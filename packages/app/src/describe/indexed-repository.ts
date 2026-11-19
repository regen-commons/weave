import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";
import {
  BackupChanged,
  DraftChanged,
  REPLACED_KEPT,
  RemovalNotice,
  backupKey,
  draftPin,
  pinned,
  replacedKey,
  replacedPrefix,
  type DeviceRemoval,
  type DraftBackup,
  type DraftPin,
  type DraftRepository,
} from "./repository.ts";

import { readEarlier, removeFromEarlier } from "./earlier-database.ts";

/**
 * This build's own database: each draft under its own ID, with `meta` naming the one written
 * last (DL-112). It is a new database and not an upgrade of the released build's, which is left
 * at its version so that build keeps working in an older tab and after a rollback (DL-114).
 */
export const DRAFT_DATABASE = "weave-drafts";
export const DRAFT_DATABASE_VERSION = 1;
const LAST = "last";
/** For each draft brought across from the released build's database, the version last seen there. */
const COPIED = "copied";
/** The backup keys already brought across, so one deleted here is not brought back. */
const COPIED_BACKUPS = "copiedBackups";
const STORES = ["drafts", "backups", "meta"] as const;

/**
 * Whether a removal the person asks for also removes that record's copy from the released
 * build's database. The user's decision of 19 November 2026: yes. The copy itself never changes
 * that database, but "removed from this device" has to stay true for what came from it, and a
 * rollback must not bring back something a person deleted. The other answer is `false` here.
 */
export function removalReachesEarlierCopy(): boolean {
  return true;
}

type Seen = Record<string, { revision: number; updatedAt: string }>;
const seenAt = (draft: DeviceDraft) => ({ revision: draft.revision, updatedAt: draft.updatedAt });
const sameVersion = (draft: DeviceDraft, seen: { revision: number; updatedAt: string } | undefined) =>
  !!seen && draft.revision === seen.revision && draft.updatedAt === seen.updatedAt;
function seenRecord(value: unknown): Seen {
  const seen: Seen = {};
  if (!value || typeof value !== "object") return seen;
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const { revision, updatedAt } = (entry ?? {}) as { revision?: unknown; updatedAt?: unknown };
    if (typeof revision === "number" && typeof updatedAt === "string") seen[id] = { revision, updatedAt };
  }
  return seen;
}

export class IndexedDraftRepository implements DraftRepository {
  private connection: Promise<IDBDatabase> | undefined;
  private readonly removeEarlierCopy: boolean;
  constructor(options: { removeEarlierCopy?: boolean } = {}) {
    this.removeEarlierCopy = options.removeEarlierCopy ?? removalReachesEarlierCopy();
  }
  private open(): Promise<IDBDatabase> {
    if (!this.connection)
      this.connection = new Promise((resolve, reject) => {
        let failed = false;
        const request = indexedDB.open(DRAFT_DATABASE, DRAFT_DATABASE_VERSION);
        request.onupgradeneeded = () => {
          for (const name of STORES)
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
  /**
   * Brings across what the released build's database holds and this one has not seen: its
   * draft, and its backups. It deletes and changes nothing there, and it is safe to repeat: a
   * version already seen is skipped, so the first run and every later look are the same code.
   *
   * An older tab may still be writing there. Its draft is taken again whenever it has changed:
   * - not here, or here as it was brought across: the older tab's version becomes the draft;
   * - changed here too: the later edit wins by the time each build stamped on it, and the other
   *   version is kept as a device backup. A time that cannot be read leaves this build's version
   *   as the draft. Either way neither version is dropped.
   * One transaction on this database writes all of it or none. Returns the IDs whose draft changed.
   */
  async bringAcross(): Promise<string[]> {
    const earlier = await readEarlier();
    if (!earlier || (!earlier.drafts.length && !earlier.backups.length)) return [];
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES, "readwrite");
      const drafts = transaction.objectStore("drafts"), backups = transaction.objectStore("backups"),
        meta = transaction.objectStore("meta");
      const changed: string[] = [];
      const copied = meta.get(COPIED), copiedBackups = meta.get(COPIED_BACKUPS), backupKeys = backups.getAllKeys();
      const here = earlier.drafts.map((draft) => drafts.get(draft.id));
      // The last read: every answer above is in when it succeeds, so all the writes are decided at once.
      const last = meta.get(LAST);
      last.onsuccess = () => {
        const seen = seenRecord(copied.result);
        const seenBackups = new Set<string>(Array.isArray(copiedBackups.result) ? copiedBackups.result.map(String) : []);
        const keys = backupKeys.result.map(String);
        let recorded = false, lastSet = typeof last.result === "string";
        earlier.drafts.forEach((theirs, index) => {
          if (sameVersion(theirs, seen[theirs.id])) return;
          const stored: unknown = here[index]!.result;
          const mine = stored === undefined ? null : DeviceDraftSchema.safeParse(stored);
          // What this version cannot read is never written over, and is looked at again next time.
          if (mine && !mine.success) return;
          if (!mine || sameVersion(mine.data, seen[theirs.id])) {
            drafts.put(theirs, theirs.id);
            changed.push(theirs.id);
          } else if (!pinned(mine.data, draftPin(theirs))) {
            // Not the very same version: this build marks each of its own revisions, so an edit
            // here never passes for the older tab's, even at the same revision and instant.
            const theirsLater = Date.parse(theirs.updatedAt) > Date.parse(mine.data.updatedAt);
            const prefix = replacedPrefix(theirs.id);
            const earlierKeys = keys.filter((key) => key.startsWith(prefix)).sort();
            for (const key of earlierKeys.slice(0, Math.max(0, earlierKeys.length - (REPLACED_KEPT - 1)))) backups.delete(key);
            backups.put(theirsLater ? mine.data : theirs, replacedKey(theirs.id, earlierKeys));
            if (theirsLater) {
              drafts.put(theirs, theirs.id);
              changed.push(theirs.id);
            }
          }
          seen[theirs.id] = seenAt(theirs);
          recorded = true;
          if (!lastSet && earlier.last === theirs.id) {
            meta.put(theirs.id, LAST);
            lastSet = true;
          }
        });
        for (const backup of earlier.backups) {
          if (seenBackups.has(backup.key)) continue;
          if (!keys.includes(backup.key)) backups.put(backup.draft, backup.key);
          seenBackups.add(backup.key);
          recorded = true;
        }
        if (recorded) {
          meta.put(seen, COPIED);
          meta.put([...seenBackups], COPIED_BACKUPS);
        }
      };
      transaction.oncomplete = () => resolve(changed);
      transaction.onerror = transaction.onabort = () => reject(new Error("The earlier device draft could not be brought across."));
    });
  }
  async load(id: string | null = null): Promise<DeviceDraft | null> {
    const db = await this.open();
    const raw: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "meta"], "readonly");
      const drafts = transaction.objectStore("drafts");
      let found: unknown = null;
      const read = (key: unknown) => {
        if (typeof key !== "string") return;
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
  /**
   * What removing this backup leaves of its initiative here: null when the backup is not the
   * pinned one, otherwise whether a draft or another backup of the same initiative remains.
   */
  private async remainsWithout(key: string, expected: DraftPin): Promise<{ remains: boolean } | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["drafts", "backups"], "readonly");
      const store = transaction.objectStore("backups");
      const target = store.get(key), values = store.getAll(), keys = store.getAllKeys();
      const draft = transaction.objectStore("drafts").get(expected.id);
      transaction.oncomplete = () => {
        const pinnedHere = target.result === undefined ? null : DeviceDraftSchema.safeParse(target.result);
        if (!pinnedHere?.success || !pinned(pinnedHere.data, expected)) return resolve(null);
        const another = values.result.some((value: unknown, index) => {
          const parsed = DeviceDraftSchema.safeParse(value);
          return String(keys.result[index]) !== key && parsed.success && parsed.data.id === expected.id;
        });
        resolve({ remains: draft.result !== undefined || another });
      };
      transaction.onerror = transaction.onabort = () =>
        reject(new RemovalNotice("This device could not remove the backup. Nothing was removed."));
    });
  }
  async deleteBackup(key: string, expected: DraftPin): Promise<DeviceRemoval> {
    if (this.removeEarlierCopy) {
      // The released build's copy goes first, so a failure there leaves this backup in place to
      // try again. Its draft goes too once nothing of the initiative is kept here.
      const state = await this.remainsWithout(key, expected);
      if (!state) throw new BackupChanged();
      try {
        await removeFromEarlier({ backupKey: key, draftId: state.remains ? null : expected.id });
      } catch {
        throw new RemovalNotice("An earlier copy of this backup on this device could not be removed. Nothing was removed. Try again.");
      }
    }
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
