import type { TestContext } from "node:test";

export type StoreName = "drafts" | "backups" | "meta";
type Stores = Partial<Record<StoreName, Map<string, unknown>>>;
type Seed = Partial<Record<StoreName, [string, unknown][]>>;
const DELETED = Symbol("deleted");

/** The database this build keeps its drafts in, and the released build's, which it only reads. */
const DRAFTS = "weave-drafts", EARLIER = "weave-device-drafts";
/** This build's database has all three stores from its first version. */
const draftStores = (version: number): StoreName[] => (version > 0 ? ["drafts", "backups", "meta"] : []);
/** The released build's database: `drafts` at version 1, `backups` from 2. A version 3 exists only where this branch ran before. */
const earlierStores = (version: number): StoreName[] =>
  version >= 3 ? ["drafts", "backups", "meta"] : version === 2 ? ["drafts", "backups"] : version === 1 ? ["drafts"] : [];

/**
 * One synthetic database: each transaction stages its writes, reads see them, and the whole
 * transaction commits once its requests settle, or aborts and leaves the stores as they were.
 * `failCommit` makes the next commit fail the way a full disk does. Opening at a higher version
 * runs `onupgradeneeded` inside one transaction, as a browser does, so a failed or aborted
 * upgrade leaves the earlier version and its data in place, and a database that did not exist
 * still does not. Opening with no version opens what is there, and creates version 1 when
 * nothing is. Transactions run one after another in the order they were opened, as a browser
 * runs overlapping write transactions.
 */
function fakeDatabase(seed: Seed, version: number, layout: (version: number) => StoreName[]) {
  const stores: Stores = {};
  for (const name of Object.keys(seed) as StoreName[]) stores[name] = new Map(seed[name]);
  for (const name of layout(version)) stores[name] ??= new Map();
  /** `connections` counts the ones still open, so a test can hold a reader to closing its own. */
  const control = { failCommit: false, commits: 0, version, opens: 0, connections: 0 };
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
          // A browser copies the value when `put` is called, so a later change to it is not stored.
          put: (value: unknown, key: string) => { const copy = structuredClone(value); return request(() => { stage(key, copy); return key; }); },
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
  const connection = () => {
    let open = true;
    control.connections++;
    return {
      objectStoreNames: { contains: (name: StoreName) => !!stores[name] },
      transaction: (names: string | string[], _mode?: string) => {
        // A browser refuses a transaction that names a store the database does not have.
        for (const name of [names].flat()) if (!stores[name as StoreName]) throw new Error(`NotFoundError: ${name}`);
        return transaction();
      },
      close() { if (open) { open = false; control.connections--; } },
      onversionchange: null as (() => void) | null,
    };
  };
  function open(wanted?: number) {
    control.opens++;
    const request = {
      result: undefined as unknown, transaction: null as ReturnType<typeof transaction> | null,
      onsuccess: null as (() => void) | null, onerror: null as ((event?: { preventDefault(): void }) => void) | null,
      onblocked: null as (() => void) | null,
      onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null,
    };
    queueMicrotask(() => {
      const target = wanted ?? (control.version || 1);
      if (target < control.version) { request.onerror?.({ preventDefault() {} }); return; }
      if (target === control.version) { request.result = connection(); request.onsuccess?.(); return; }
      const created: StoreName[] = [], oldVersion = control.version;
      const upgrade = transaction(created, (ok) => {
        request.transaction = null;
        if (ok) { control.version = target; request.result = connection(); request.onsuccess?.(); }
        else request.onerror?.({ preventDefault() {} });
      });
      request.transaction = upgrade;
      request.result = {
        objectStoreNames: { contains: (name: StoreName) => !!stores[name] || created.includes(name) },
        createObjectStore(name: StoreName) { created.push(name); },
      };
      request.onupgradeneeded?.({ oldVersion });
    });
    return request;
  }
  const entries = (name: StoreName) => [...(stores[name] ?? [])];
  return {
    open, stores, control,
    /** Whether a database of this name exists at all. One never created, or whose first upgrade was aborted, does not. */
    exists: () => control.version > 0,
    snapshot: () => structuredClone({ drafts: entries("drafts"), backups: entries("backups"), meta: entries("meta") }),
  };
}

/**
 * A synthetic IndexedDB holding this build's database and, as `earlier`, the released build's.
 * `seed` and `version` describe this build's; by default it is there, empty, at version 1, and
 * version 0 means it has never been opened. `earlier` is absent unless it is given. No browser
 * runs here: there are no version-change or blocked events, which a real browser proves.
 */
export function fakeIndexedDB(seed: Seed = {}, version = 1, earlier: { seed?: Seed; version?: number } = {}) {
  const drafts = fakeDatabase(seed, version, draftStores);
  const released = fakeDatabase(earlier.seed ?? {}, earlier.version ?? (earlier.seed ? 2 : 0), earlierStores);
  const factory = {
    open(name: string, wanted?: number) {
      if (name === DRAFTS) return drafts.open(wanted);
      if (name === EARLIER) return released.open(wanted);
      throw new Error(`An unexpected database was opened: ${name}`);
    },
  };
  return { factory, stores: drafts.stores, control: drafts.control, snapshot: drafts.snapshot, earlier: released };
}

export function installIndexedDB(t: TestContext, fake: ReturnType<typeof fakeIndexedDB>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fake.factory });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "indexedDB", previous); else Reflect.deleteProperty(globalThis, "indexedDB"); });
}
