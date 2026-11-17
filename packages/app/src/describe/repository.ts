import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";

export class DraftConflict extends Error {
  constructor() {
    super("Another tab changed this draft. Copy your words before reloading.");
  }
}
/** The target of a removal is not on this device as it was shown. Nothing was removed. */
export class BackupChanged extends Error {
  constructor() {
    super("This backup changed or is no longer on this device. Nothing was removed.");
  }
}
/** A removal that did not finish as asked, in words safe to show as they are. */
export class RemovalNotice extends Error {}
export interface DraftBackup {
  key: string;
  draft: DeviceDraft;
}
/** Exactly the draft a person saw. A removal compares every field before it removes anything. */
export interface DraftPin {
  id: string;
  revision: number;
  updatedAt: string;
}
export const draftPin = (draft: DeviceDraft): DraftPin => ({ id: draft.id, revision: draft.revision, updatedAt: draft.updatedAt });
export const pinned = (draft: DeviceDraft, pin: DraftPin) =>
  draft.id === pin.id && draft.revision === pin.revision && draft.updatedAt === pin.updatedAt;
/** What one device removal took away, by store key, and how many backups remain. */
export interface DeviceRemoval {
  removed: string[];
  kept: number;
}
export interface DraftRepository {
  load(): Promise<DeviceDraft | null>;
  backups?(): Promise<DraftBackup[]>;
  /** Removes one backup for good, only if its key holds exactly the pinned draft. */
  deleteBackup?(key: string, expected: DraftPin): Promise<DeviceRemoval>;
  /**
   * Moves the pinned current draft into the backups and removes the current key, in one
   * transaction. It never writes a blank draft or touches other backups.
   */
  discardCurrent?(expected: DraftPin): Promise<DeviceRemoval & { backup: string }>;
  /** Cancellation applies until the atomic draft-and-backup commit, never by undoing a completed commit. */
  replace?(draft: DeviceDraft, expectedRevision: number | null, signal?: AbortSignal): Promise<void>;
  save(draft: DeviceDraft, expectedRevision: number | null): Promise<void>;
}
export class MemoryDraftRepository implements DraftRepository {
  value: DeviceDraft | null;
  history: DraftBackup[] = [];
  constructor(seed: DeviceDraft | null = null) {
    this.value = seed;
  }
  async backups() {
    return this.history;
  }
  async replace(draft: DeviceDraft, expectedRevision: number | null, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const validated = this.validateWrite(draft, expectedRevision);
    const previous = this.value;
    this.value = validated;
    if (previous) this.history.unshift({ key: crypto.randomUUID(), draft: previous });
  }
  async load() {
    return this.value;
  }
  async deleteBackup(key: string, expected: DraftPin): Promise<DeviceRemoval> {
    const index = this.history.findIndex((item) => item.key === key);
    if (index < 0 || !pinned(this.history[index]!.draft, expected)) throw new BackupChanged();
    this.history = this.history.filter((item) => item.key !== key);
    return { removed: [key], kept: this.history.length };
  }
  async discardCurrent(expected: DraftPin): Promise<DeviceRemoval & { backup: string }> {
    if (!this.value || !pinned(this.value, expected)) throw new DraftConflict();
    const backup = `${new Date().toISOString()}:${crypto.randomUUID()}`;
    this.history = [{ key: backup, draft: this.value }, ...this.history];
    this.value = null;
    return { removed: ["current"], kept: this.history.length, backup };
  }
  async save(draft: DeviceDraft, expectedRevision: number | null) {
    this.value = this.validateWrite(draft, expectedRevision);
  }
  private validateWrite(draft: DeviceDraft, expectedRevision: number | null) {
    if ((this.value?.revision ?? null) !== expectedRevision) throw new DraftConflict();
    return DeviceDraftSchema.parse(draft);
  }
}
