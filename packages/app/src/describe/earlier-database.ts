import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";
import type { DraftBackup } from "./repository.ts";

/**
 * The database of the build released before several drafts (DL-114): one draft under `current`
 * and its backups, at version 2. That build may still be running in another tab, and a rollback
 * runs it again, so this build never opens the database with a version number. An open without
 * one raises no version change, so that build's connection stays open and the database is never
 * upgraded. This build reads it, closes it, and changes it only when a person removes something
 * for good.
 */
export const EARLIER_DATABASE = "weave-device-drafts";
/** The one key that build keeps its draft under. */
const SINGLE_DRAFT_KEY = "current";

/** What the released build's database holds that this build can read. */
export interface EarlierContent {
  /** Its drafts: the one under `current`, or several where this branch ran before its release. */
  drafts: DeviceDraft[];
  /** The draft a tab of that build opens. */
  last: string | null;
  backups: DraftBackup[];
}

type Store = "drafts" | "backups" | "meta";
const present = (db: IDBDatabase): Store[] =>
  (["drafts", "backups", "meta"] as const).filter((name) => db.objectStoreNames.contains(name));

/**
 * Opens the released build's database as it is, or resolves null when there is none. An open
 * without a version would create an empty database for a first-time visitor, and after a
 * rollback the released build would then meet a database it never made. So when the open turns
 * out to be a create, its upgrade is aborted, which leaves no database behind. That works in
 * every browser, where `indexedDB.databases()` is missing in some, and it leaves no gap between
 * a check and the open.
 */
function openEarlier(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let creating = false;
    const request = indexedDB.open(EARLIER_DATABASE);
    request.onupgradeneeded = () => {
      creating = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const db = request.result;
      // Should that build ever need its database to itself, this build lets go at once.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = (event) => {
      // The abort above is expected, so it is not reported as a failure of the page.
      event?.preventDefault?.();
      if (creating) resolve(null);
      else reject(new Error("The earlier device storage could not be opened."));
    };
  });
}

/** Reads the released build's drafts and backups, and closes the database again. Null when there is none. */
export async function readEarlier(): Promise<EarlierContent | null> {
  const db = await openEarlier();
  if (!db) return null;
  try {
    const stores = present(db);
    if (!stores.includes("drafts")) return { drafts: [], last: null, backups: [] };
    return await new Promise<EarlierContent>((resolve, reject) => {
      const transaction = db.transaction(stores, "readonly");
      const store = transaction.objectStore("drafts");
      const values = store.getAll(), keys = store.getAllKeys();
      const kept = stores.includes("backups") ? transaction.objectStore("backups") : null;
      const keptValues = kept?.getAll(), keptKeys = kept?.getAllKeys();
      const named = stores.includes("meta") ? transaction.objectStore("meta").get("last") : null;
      transaction.oncomplete = () => {
        const drafts: DeviceDraft[] = [];
        let last: string | null = null;
        // What this build cannot read stays where it is and is left out.
        values.result.forEach((value: unknown, index) => {
          const parsed = DeviceDraftSchema.safeParse(value);
          if (!parsed.success) return;
          drafts.push(parsed.data);
          if (keys.result[index] === SINGLE_DRAFT_KEY) last = parsed.data.id;
        });
        if (last === null && typeof named?.result === "string" && drafts.some((draft) => draft.id === named.result))
          last = named.result;
        const backups: DraftBackup[] = [];
        keptValues?.result.forEach((value: unknown, index) => {
          const parsed = DeviceDraftSchema.safeParse(value);
          if (parsed.success) backups.push({ key: String(keptKeys!.result[index]), draft: parsed.data });
        });
        resolve({ drafts, last, backups });
      };
      transaction.onerror = transaction.onabort = () => reject(new Error("The earlier device storage could not be read."));
    });
  } finally {
    db.close();
  }
}

/** A version of a draft as this build last saw it in the released build's database. */
export interface SeenVersion {
  revision: number;
  updatedAt: string;
}

/**
 * Removes from the released build's database what a person removed for good in this build: the
 * backup under the same key, and with `draft` that build's draft of the initiative, but only at
 * the version this build has seen. A tab of that build may have typed since, and words this
 * build never copied are not its to delete: such a draft is left exactly as it is and `newer`
 * says so, for the caller to bring across. One transaction, so it removes all of it or none. A
 * database that is not there holds nothing to remove.
 */
export async function removeFromEarlier(removal: {
  backupKey: string;
  draft: { id: string; seen: SeenVersion | undefined } | null;
}): Promise<{ newer: boolean }> {
  const db = await openEarlier();
  if (!db) return { newer: false };
  try {
    const stores = present(db).filter((name) => name !== "meta");
    if (!stores.length) return { newer: false };
    return await new Promise<{ newer: boolean }>((resolve, reject) => {
      const transaction = db.transaction(stores, "readwrite");
      let newer = false;
      if (stores.includes("backups")) transaction.objectStore("backups").delete(removal.backupKey);
      if (removal.draft !== null && stores.includes("drafts")) {
        const wanted = removal.draft;
        const store = transaction.objectStore("drafts");
        const values = store.getAll(), keys = store.getAllKeys();
        keys.onsuccess = () =>
          values.result.forEach((value: unknown, index) => {
            const parsed = DeviceDraftSchema.safeParse(value);
            if (!parsed.success || parsed.data.id !== wanted.id) return;
            const seen = wanted.seen;
            if (seen && parsed.data.revision === seen.revision && parsed.data.updatedAt === seen.updatedAt)
              store.delete(keys.result[index]!);
            else newer = true;
          });
      }
      transaction.oncomplete = () => resolve({ newer });
      transaction.onerror = transaction.onabort = () => reject(new Error("The earlier device storage could not be changed."));
    });
  } finally {
    db.close();
  }
}
