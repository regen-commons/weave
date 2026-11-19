import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";
import {
  BackupChanged,
  DraftChanged,
  REPLACED_KEPT,
  RemovalNotice,
  backupKey,
  pinned,
  replacedKey,
  replacedPrefix,
  type DeviceRemoval,
  type DraftBackup,
  type DraftPin,
  type DraftRepository,
} from "./repository.ts";

export const DRAFT_DATABASE = "weave-device-drafts";
/** Version 3 keeps each draft under its own ID, with `meta` naming the one written last (DL-112). */
export const DRAFT_DATABASE_VERSION = 3;
/** The one key every draft was stored under before version 3. */
const SINGLE_DRAFT_KEY = "current";
const LAST = "last";
const STORES = ["drafts", "backups", "meta"] as const;

/**
 * Moves the single draft of versions 1 and 2 to its own ID, inside the upgrade's transaction, so
 * it lands whole or the database stays at its old version. A draft that cannot be read is left
 * exactly where it is: nothing reads that key again, and nothing deletes it.
 */
export function migrateSingleDraft(transaction: IDBTransaction): void {
  const drafts = transaction.objectStore("drafts");
  const request = drafts.get(SINGLE_DRAFT_KEY);
  request.onsuccess = () => {
    const parsed = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
    if (!parsed?.success) return;
    drafts.put(parsed.data, parsed.data.id);
    drafts.delete(SINGLE_DRAFT_KEY);
    transaction.objectStore("meta").put(parsed.data.id, LAST);
  };
}

export class IndexedDraftRepository implements DraftRepository {
  private connection: Promise<IDBDatabase> | undefined;
  private open(): Promise<IDBDatabase> {
    if (!this.connection)
      this.connection = new Promise((resolve, reject) => {
        let failed = false;
        const request = indexedDB.open(DRAFT_DATABASE, DRAFT_DATABASE_VERSION);
        request.onupgradeneeded = (event) => {
          for (const name of STORES)
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
          if (event.oldVersion > 0 && event.oldVersion < DRAFT_DATABASE_VERSION && request.transaction)
            migrateSingleDraft(request.transaction);
        };
        request.onsuccess = () => {
          const db = request.result;
          if (failed) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db.close();
            this.connection = undefined;
          };
          resolve(db);
        };
        request.onerror = () => {
          if (failed) return;
          failed = true;
          this.connection = undefined;
          reject(new Error("This browser could not open device storage."));
        };
        request.onblocked = () => {
          if (failed) return;
          failed = true;
          this.connection = undefined;
          reject(new Error("Close older Weave tabs and try again."));
        };
      });
    return this.connection;
  }
  async load(id: string | null = null): Promise<DeviceDraft | null> {
    const db = await this.open();
    const raw: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "meta"], "readonly");
      const drafts = transaction.objectStore("drafts");
      let found: unknown = null;
      const read = (key: unknown) => {
        if (typeof key !== "string" || key === SINGLE_DRAFT_KEY) return;
        const request = drafts.get(key);
        request.onsuccess = () => {
          found = request.result ?? null;
        };
      };
      if (id !== null) read(id);
      else {
        const last = transaction.objectStore("meta").get(LAST);
        last.onsuccess = () => read(last.result);
      }
      transaction.oncomplete = () => resolve(found);
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("The device draft could not be read."));
    });
    if (raw === null) return null;
    const parsed = DeviceDraftSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error("This device draft could not be read safely. It has not been changed.");
    return parsed.data;
  }
  async list(): Promise<DeviceDraft[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readonly");
      const values = transaction.objectStore("drafts").getAll();
      transaction.oncomplete = () =>
        resolve(
          // A draft this version cannot read stays stored and is left out of the list.
          values.result.flatMap((value: unknown) => {
            const parsed = DeviceDraftSchema.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          }),
        );
      transaction.onerror = transaction.onabort = () => reject(new Error("The device drafts could not be read."));
    });
  }
  async backups(): Promise<DraftBackup[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backups", "readonly"),
        store = tx.objectStore("backups");
      const values = store.getAll(),
        keys = store.getAllKeys();
      tx.oncomplete = () => {
        try {
          resolve(
            values.result
              .map((value: unknown, index) => ({
                key: String(keys.result[index]),
                draft: DeviceDraftSchema.parse(value),
              }))
              .reverse(),
          );
        } catch {
          reject(new Error("Device backups could not be read safely."));
        }
      };
      tx.onerror = tx.onabort = () => reject(new Error("Device backups could not be read."));
    });
  }
  async deleteBackup(key: string, expected: DraftPin): Promise<DeviceRemoval> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("backups", "readwrite");
      const store = transaction.objectStore("backups");
      const request = store.get(key);
      let changed = false, kept = 0;
      request.onsuccess = () => {
        const current = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
        if (!current?.success || !pinned(current.data, expected)) {
          changed = true;
          transaction.abort();
          return;
        }
        store.delete(key);
        const count = store.count();
        count.onsuccess = () => { kept = count.result; };
      };
      transaction.oncomplete = () => resolve({ removed: [key], kept });
      transaction.onerror = transaction.onabort = () =>
        reject(changed ? new BackupChanged() : new RemovalNotice("This device could not remove the backup. Nothing was removed."));
    });
  }
  async discard(expected: DraftPin): Promise<DeviceRemoval & { backup: string }> {
    const db = await this.open();
    const backup = backupKey();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "backups", "meta"], "readwrite");
      const drafts = transaction.objectStore("drafts"), backups = transaction.objectStore("backups"),
        meta = transaction.objectStore("meta");
      const request = drafts.get(expected.id);
      let changed = false, kept = 0;
      request.onsuccess = () => {
        const current = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
        if (!current?.success || !pinned(current.data, expected)) {
          changed = true;
          transaction.abort();
          return;
        }
        // The backup and the removal commit together, or neither does.
        backups.put(current.data, backup);
        drafts.delete(expected.id);
        const last = meta.get(LAST);
        last.onsuccess = () => {
          if (last.result === expected.id) meta.delete(LAST);
        };
        const count = backups.count();
        count.onsuccess = () => { kept = count.result; };
      };
      transaction.oncomplete = () => resolve({ removed: [expected.id], kept, backup });
      transaction.onerror = transaction.onabort = () =>
        reject(changed ? new DraftChanged() : new RemovalNotice("This device could not remove the draft. Nothing was removed."));
    });
  }
  async replace(draft: DeviceDraft, signal?: AbortSignal): Promise<void> {
    return this.write(draft, { opening: true }, signal);
  }
  async save(draft: DeviceDraft, expected: DraftPin | null): Promise<void> {
    return this.write(draft, { opening: false, expected });
  }
  /**
   * One transaction for one draft. Opening keeps whatever its ID held as a backup. An edit keeps
   * the stored version only when another tab wrote it, and then at most `REPLACED_KEPT` of them.
   */
  private async write(
    draft: DeviceDraft,
    mode: { opening: true } | { opening: false; expected: DraftPin | null },
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const validated = DeviceDraftSchema.parse(draft);
    const db = await this.open();
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "backups", "meta"], "readwrite");
      const store = transaction.objectStore("drafts"), backups = transaction.objectStore("backups");
      const request = store.get(validated.id);
      const cancel = () => {
        try { transaction.abort(); } catch { /* An already committed transaction remains device work. */ }
      };
      const cleanup = () => signal?.removeEventListener("abort", cancel);
      signal?.addEventListener("abort", cancel, { once: true });
      request.onsuccess = () => {
        if (signal?.aborted) { cancel(); return; }
        const current = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
        // What this version cannot read is never written over.
        if (current && !current.success) { transaction.abort(); return; }
        if (current && mode.opening) backups.put(current.data, backupKey());
        else if (current && !mode.opening && !(mode.expected && pinned(current.data, mode.expected))) {
          const prefix = replacedPrefix(validated.id);
          const keys = backups.getAllKeys();
          keys.onsuccess = () => {
            // Keys sort by their time, so the first are the oldest.
            const earlier = keys.result.map(String).filter((key) => key.startsWith(prefix)).sort();
            for (const key of earlier.slice(0, Math.max(0, earlier.length - (REPLACED_KEPT - 1)))) backups.delete(key);
            backups.put(current.data, replacedKey(validated.id, earlier));
          };
        }
        store.put(validated, validated.id);
        transaction.objectStore("meta").put(validated.id, LAST);
      };
      transaction.oncomplete = () => { cleanup(); resolve(); };
      transaction.onerror = transaction.onabort = () => {
        cleanup();
        reject(
          signal?.aborted
            ? signal.reason
            : new Error(
                "Your latest changes could not be stored on this device. Keep this tab open and copy your draft.",
              ),
        );
      };
    });
  }
}
