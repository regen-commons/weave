import type { TestContext } from "node:test";

export type StoreName = "drafts" | "backups" | "meta";
type Stores = Partial<Record<StoreName, Map<string, unknown>>>;
type Seed = Partial<Record<StoreName, [string, unknown][]>>;
const DELETED = Symbol("deleted");

/**
 * A synthetic IndexedDB: each transaction stages its writes, reads see them, and the whole
 * transaction commits once its requests settle, or aborts and leaves the stores as they were.
 * `failCommit` makes the next commit fail the way a full disk does. Opening at a higher version
 * runs `onupgradeneeded` inside one transaction, as a browser does, so a failed upgrade leaves
 * the earlier version and its data in place. Transactions run one after another in the order they
 * were opened, as a browser runs overlapping write transactions. No browser runs here.
 */
export function fakeIndexedDB(seed: Seed = {}, version = 3) {
  const stores: Stores = {};
  for (const name of Object.keys(seed) as StoreName[]) stores[name] = new Map(seed[name]);
  // A database at version 3 has all three stores. One at version 2 has only the first two.
  for (const name of (version >= 3 ? ["drafts", "backups", "meta"] : version > 0 ? ["drafts", "backups"] : []) as StoreName[])
    stores[name] ??= new Map();
  const control = { failCommit: false, commits: 0, version, opens: 0 };
  let queue: Promise<void> = Promise.resolve();
  function transaction(created: StoreName[] = [], onDone?: (ok: boolean) => void) {
    const staged = new Map<StoreName, Map<string, unknown>>();
    let pending = 0, finished = false;
    // This transaction's turn comes when every earlier one has finished.
    const turn = queue, done = Promise.withResolvers<void>();
    queue = done.promise;
    const view = (name: StoreName) => {
      if (!stores[name] && !created.includes(name)) throw new Error(`NotFoundError: ${name}`);
      const merged = new Map(stores[name] ?? []);
      for (const [key, value] of staged.get(name) ?? []) if (value === DELETED) merged.delete(key); else merged.set(key, value);
      return new Map([...merged].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    };
    const tx = {
      oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, onabort: null as (() => void) | null,
      objectStore(name: StoreName) {
        view(name);
        const stage = (key: string, value: unknown) => {
          if (!staged.has(name)) staged.set(name, new Map());
          staged.get(name)!.set(key, value);
        };
        const request = <T,>(read: () => T) => {
          pending++;
          const result = { result: undefined as T | undefined, onsuccess: null as (() => void) | null };
          void turn.then(() => {
            if (finished) return;
            result.result = read();
            pending--;
            result.onsuccess?.();
            settle();
          });
          return result;
        };
        return {
          get: (key: string) => request(() => structuredClone(view(name).get(key))),
          put: (value: unknown, key: string) => request(() => { stage(key, structuredClone(value)); return key; }),
          delete: (key: string) => request(() => { stage(key, DELETED); return undefined; }),
          count: () => request(() => view(name).size),
          getAll: () => request(() => [...view(name).values()].map(value => structuredClone(value))),
          getAllKeys: () => request(() => [...view(name).keys()]),
        };
      },
      abort() {
        if (finished) throw new Error("InvalidStateError");
        finished = true; staged.clear(); done.resolve();
        queueMicrotask(() => { onDone?.(false); tx.onabort?.(); });
      },
    };
    const settle = () => void turn.then(() => queueMicrotask(() => {
      if (pending || finished) return;
      finished = true; done.resolve();
      if (control.failCommit) { control.failCommit = false; onDone?.(false); tx.onerror?.(); tx.onabort?.(); return; }
      for (const name of created) stores[name] ??= new Map();
      for (const [name, changes] of staged)
        for (const [key, value] of changes)
          if (value === DELETED) stores[name]!.delete(key); else stores[name]!.set(key, value);
      control.commits++;
      onDone?.(true);
      tx.oncomplete?.();
    }));
    settle();
    return tx;
  }
  const db = {
    objectStoreNames: { contains: (name: StoreName) => !!stores[name] },
    transaction: (_names: string | string[], _mode?: string) => transaction(),
    close() {},
    onversionchange: null as (() => void) | null,
  };
  const factory = { open(_name: string, wanted: number) {
    control.opens++;
    const request = {
      result: db as unknown, transaction: null as ReturnType<typeof transaction> | null,
      onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, onblocked: null as (() => void) | null,
      onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null,
    };
    queueMicrotask(() => {
      if (wanted < control.version) { request.onerror?.(); return; }
      if (wanted === control.version) { request.onsuccess?.(); return; }
      const created: StoreName[] = [], oldVersion = control.version;
      const upgrade = transaction(created, (ok) => {
        request.transaction = null;
        if (ok) { control.version = wanted; request.onsuccess?.(); } else request.onerror?.();
      });
      request.transaction = upgrade;
      request.result = {
        ...db,
        objectStoreNames: { contains: (name: StoreName) => !!stores[name] || created.includes(name) },
        createObjectStore(name: StoreName) { created.push(name); },
      };
      request.onupgradeneeded?.({ oldVersion });
      request.result = db;
    });
    return request;
  } };
  const entries = (name: StoreName) => [...(stores[name] ?? [])];
  return {
    factory, stores, control,
    snapshot: () => structuredClone({ drafts: entries("drafts"), backups: entries("backups"), meta: entries("meta") }),
  };
}

export function installIndexedDB(t: TestContext, fake: ReturnType<typeof fakeIndexedDB>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fake.factory });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "indexedDB", previous); else Reflect.deleteProperty(globalThis, "indexedDB"); });
}
