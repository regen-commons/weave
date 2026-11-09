import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";
import { DraftConflict, type DraftBackup, type DraftRepository } from "./repository.ts";
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
  async replace(draft: DeviceDraft, expectedRevision: number | null): Promise<void> {
    return this.write(draft, expectedRevision, true);
  }
  async save(draft: DeviceDraft, expectedRevision: number | null): Promise<void> {
    return this.write(draft, expectedRevision, false);
  }
  private async write(draft: DeviceDraft, expectedRevision: number | null, backup: boolean): Promise<void> {
    const validated = DeviceDraftSchema.parse(draft);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(backup ? ["drafts", "backups"] : ["drafts"], "readwrite");
      const store = transaction.objectStore("drafts");
      const request = store.get("current");
      let conflict = false;
      request.onsuccess = () => {
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
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(
          conflict
            ? new DraftConflict()
            : new Error(
                "Your latest changes could not be stored on this device. Keep this tab open and copy your draft.",
              ),
        );
    });
  }
}
