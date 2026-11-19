import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";

/** The draft a removal was shown is not the one stored now. Nothing was removed. */
export class DraftChanged extends Error {
  constructor() {
    super("This draft changed on this device since it was shown. Nothing was removed.");
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
/** Exactly the draft a person or a tab saw. A write or a removal compares every field. */
export interface DraftPin {
  id: string;
  revision: number;
  updatedAt: string;
  /** The revision's own random mark. Absent on a draft stored before marks. */
  mark?: string | undefined;
}
export const draftPin = (draft: DeviceDraft): DraftPin => ({
  id: draft.id,
  revision: draft.revision,
  updatedAt: draft.updatedAt,
  mark: draft.mark,
});
export const pinned = (draft: DeviceDraft, pin: DraftPin) =>
  draft.id === pin.id && draft.revision === pin.revision && draft.updatedAt === pin.updatedAt && draft.mark === pin.mark;
/** What one device removal took away, by store key, and how many backups remain. */
export interface DeviceRemoval {
  removed: string[];
  kept: number;
  /**
   * What the removal found in an older tab's storage when it looked there first: the drafts whose
   * newer words are in the list again, how many versions it kept as device backups, and whether
   * newer words are still waiting there because they could not be read. Absent when it found nothing.
   */
  older?: { drafts: string[]; backups: number; waiting: boolean };
}
/**
 * How many versions replaced by another tab's edit are kept for one draft. The oldest goes when a
 * newer one arrives, so two tabs typing in turn never fill the device (DL-112).
 */
export const REPLACED_KEPT = 3;
/** The backup key of a version another tab's edit replaced. Its prefix names the draft, so the cap can find them. */
export const replacedPrefix = (id: string) => `replaced:${id}:`;
/**
 * The key for the next replaced version of a draft. Keys sort by their time, and the time is
 * always later than the newest key already kept, so two made in the same millisecond still sort
 * in the order they were made and the cap drops the oldest.
 */
export function replacedKey(id: string, earlier: readonly string[] = []): string {
  const prefix = replacedPrefix(id);
  const newest = Math.max(0, ...earlier.map((key) => Date.parse(key.slice(prefix.length, prefix.length + 24)) || 0));
  return `${prefix}${new Date(Math.max(Date.now(), newest + 1)).toISOString()}:${crypto.randomUUID()}`;
}
/**
 * The backup key of a version that lost to the other build's later edit, when a draft changed in
 * the released build and in this one. No cap ever drops these: a tab of the released build never
 * takes this build's edits, so each one may hold words kept nowhere else. Only the person deletes them.
 */
export const betweenBuildsPrefix = (id: string) => `between-builds:${id}:`;
export const betweenBuildsKey = (id: string) => `${betweenBuildsPrefix(id)}${new Date().toISOString()}:${crypto.randomUUID()}`;
/** The key of a backup made before a draft was opened over or removed. */
export const backupKey = () => `${new Date().toISOString()}:${crypto.randomUUID()}`;

/**
 * The drafts kept in this browser. Each has its own ID, and a browser can hold several, signed in
 * or not (DL-112). A tab works on one of them at a time.
 */
export interface DraftRepository {
  /** One stored draft by its ID, or with `null` the draft written most recently. Null when there is none. */
  load(id?: string | null): Promise<DeviceDraft | null>;
  /**
   * Brings across what an earlier build's storage holds and this one has not seen, without
   * changing that storage. Returns the IDs of the drafts whose stored version changed.
   */
  bringAcross?(): Promise<string[]>;
  /** Every draft stored on this device that can be read. */
  list?(): Promise<DeviceDraft[]>;
  backups?(): Promise<DraftBackup[]>;
  /** Removes one backup for good, only if its key holds exactly the pinned draft. */
  deleteBackup?(key: string, expected: DraftPin): Promise<DeviceRemoval>;
  /**
   * Moves the pinned draft into the backups and removes it from the drafts, in one transaction.
   * It never writes a blank draft or touches other drafts or backups.
   */
  discard?(expected: DraftPin): Promise<DeviceRemoval & { backup: string }>;
  /**
   * Stores a draft that is opened in place of whatever its ID holds: a loaded account card, a
   * restored backup. The version it replaces is kept as a backup in the same transaction.
   * Cancellation applies until the atomic commit, never by undoing a completed commit.
   */
  replace?(draft: DeviceDraft, signal?: AbortSignal): Promise<void>;
  /**
   * Stores one edit. The latest edit wins: when the stored version is not the one this tab last
   * read or wrote, another tab changed it, and that version is kept quietly as a backup before
   * this one replaces it.
   */
  save(draft: DeviceDraft, expected: DraftPin | null): Promise<void>;
}
export class MemoryDraftRepository implements DraftRepository {
  drafts = new Map<string, DeviceDraft>();
  /** The draft written most recently, which a new tab opens. */
  last: string | null = null;
  history: DraftBackup[] = [];
  constructor(seed: DeviceDraft | null = null, others: readonly DeviceDraft[] = []) {
    for (const draft of others) this.drafts.set(draft.id, draft);
    if (seed) this.value = seed;
  }
  /** The draft a new tab opens. */
  get value(): DeviceDraft | null {
    return this.last ? (this.drafts.get(this.last) ?? null) : null;
  }
  set value(draft: DeviceDraft | null) {
    if (!draft) {
      if (this.last) this.drafts.delete(this.last);
      this.last = null;
      return;
    }
    this.drafts.set(draft.id, draft);
    this.last = draft.id;
  }
  async load(id: string | null = null) {
    return id === null ? this.value : (this.drafts.get(id) ?? null);
  }
  async list() {
    return [...this.drafts.values()];
  }
  async backups() {
    return this.history;
  }
  async replace(draft: DeviceDraft, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const validated = DeviceDraftSchema.parse(draft);
    const previous = this.drafts.get(validated.id);
    if (previous) this.history.unshift({ key: backupKey(), draft: previous });
    this.value = validated;
  }
  async deleteBackup(key: string, expected: DraftPin): Promise<DeviceRemoval> {
    const index = this.history.findIndex((item) => item.key === key);
    if (index < 0 || !pinned(this.history[index]!.draft, expected)) throw new BackupChanged();
    this.history = this.history.filter((item) => item.key !== key);
    return { removed: [key], kept: this.history.length };
  }
  async discard(expected: DraftPin): Promise<DeviceRemoval & { backup: string }> {
    const stored = this.drafts.get(expected.id);
    if (!stored || !pinned(stored, expected)) throw new DraftChanged();
    const backup = backupKey();
    this.history = [{ key: backup, draft: stored }, ...this.history];
    this.drafts.delete(expected.id);
    if (this.last === expected.id) this.last = null;
    return { removed: [expected.id], kept: this.history.length, backup };
  }
  async save(draft: DeviceDraft, expected: DraftPin | null) {
    const validated = DeviceDraftSchema.parse(draft);
    const stored = this.drafts.get(validated.id);
    if (stored && !(expected && pinned(stored, expected))) {
      const prefix = replacedPrefix(validated.id);
      const earlier = this.history.filter((item) => item.key.startsWith(prefix));
      const dropped = new Set(earlier.slice(REPLACED_KEPT - 1).map((item) => item.key));
      this.history = [
        { key: replacedKey(validated.id, earlier.map((item) => item.key)), draft: stored },
        ...this.history.filter((item) => !dropped.has(item.key)),
      ];
    }
    this.value = validated;
  }
}
