import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";
import {
  BackupChanged,
  DraftConflict,
  pinned,
  RemovalNotice,
  type DeviceRemoval,
  type DraftBackup,
  type DraftPin,
  type DraftRepository,
} from "./repository.ts";
export class IndexedDraftRepository implements DraftRepository {
  private connection: Promise<IDBDatabase> | undefined;
  private open(): Promise<IDBDatabase> {
    if (!this.connection)
      this.connection = new Promise((resolve, reject) => {
        let failed = false;
        const request = indexedDB.open("weave-device-drafts", 2);
        request.onupgradeneeded = () => {
          for (const name of ["drafts", "backups"])
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
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
  async load(): Promise<DeviceDraft | null> {
    const db = await this.open();
    const raw: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readonly");
      const request = transaction.objectStore("drafts").get("current");
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("The device draft could not be read."));
    });
    if (raw === null) return null;
    const parsed = DeviceDraftSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error("This device draft could not be read safely. It has not been changed.");
    return parsed.data;
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
  async discardCurrent(expected: DraftPin): Promise<DeviceRemoval & { backup: string }> {
    const db = await this.open();
    const backup = `${new Date().toISOString()}:${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "backups"], "readwrite");
      const drafts = transaction.objectStore("drafts"), backups = transaction.objectStore("backups");
      const request = drafts.get("current");
      let conflict = false, kept = 0;
      request.onsuccess = () => {
        const current = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
        if (!current?.success || !pinned(current.data, expected)) {
          conflict = true;
          transaction.abort();
          return;
        }
        // The backup and the removal commit together, or neither does.
        backups.put(current.data, backup);
        drafts.delete("current");
        const count = backups.count();
        count.onsuccess = () => { kept = count.result; };
      };
      transaction.oncomplete = () => resolve({ removed: ["current"], kept, backup });
      transaction.onerror = transaction.onabort = () =>
        reject(conflict ? new DraftConflict() : new RemovalNotice("This device could not remove the draft. Nothing was removed."));
    });
  }
  async replace(draft: DeviceDraft, expectedRevision: number | null, signal?: AbortSignal): Promise<void> {
    return this.write(draft, expectedRevision, true, signal);
  }
  async save(draft: DeviceDraft, expectedRevision: number | null): Promise<void> {
    return this.write(draft, expectedRevision, false);
  }
  private async write(draft: DeviceDraft, expectedRevision: number | null, backup: boolean, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const validated = DeviceDraftSchema.parse(draft);
    const db = await this.open();
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(backup ? ["drafts", "backups"] : ["drafts"], "readwrite");
      const store = transaction.objectStore("drafts");
      const request = store.get("current");
      let conflict = false;
      const cancel = () => {
        try { transaction.abort(); } catch { /* An already committed transaction remains device work. */ }
      };
      const cleanup = () => signal?.removeEventListener("abort", cancel);
      signal?.addEventListener("abort", cancel, { once: true });
      request.onsuccess = () => {
        if (signal?.aborted) { cancel(); return; }
        const current = request.result === undefined ? null : DeviceDraftSchema.safeParse(request.result);
        const revision = current === null ? null : current.success ? current.data.revision : undefined;
        if (revision !== expectedRevision) {
          conflict = true;
          transaction.abort();
          return;
        }
        if (backup && current?.success)
          transaction
            .objectStore("backups")
            .put(current.data, `${new Date().toISOString()}:${crypto.randomUUID()}`);
        store.put(validated, "current");
      };
      transaction.oncomplete = () => { cleanup(); resolve(); };
      transaction.onerror = transaction.onabort = () => {
        cleanup();
        reject(
          signal?.aborted ? signal.reason : conflict
            ? new DraftConflict()
            : new Error(
                "Your latest changes could not be stored on this device. Keep this tab open and copy your draft.",
              ),
        );
      };
    });
  }
}
