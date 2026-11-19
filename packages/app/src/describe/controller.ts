import { DeviceDraftSchema, newDraft, type DeviceDraft } from "./contracts.ts";
import { DraftChanged, draftPin, pinned, RemovalNotice, type DeviceRemoval, type DraftBackup, type DraftPin, type DraftRepository } from "./repository.ts";
import { memoryPointer, type DraftChannel, type DraftMessage, type DraftPointer } from "./tabs.ts";
export type DeviceStorage = "loading" | "none" | "saving" | "saved" | "memory";
export interface DraftSnapshot {
  /** The draft this tab is working on. */
  draft: DeviceDraft;
  storage: DeviceStorage;
  error: string | null;
  ready: boolean;
  /** Every draft stored on this device, as last read or written. The tab's own draft is in `draft`. */
  drafts: readonly DeviceDraft[];
}
const UNREAD = "Device storage could not be read. Any saved draft has not been changed. New words stay in this tab only.";
const STILL_STORING = "Your latest changes were still being stored, so nothing else was opened. Try again.";
/** Words not stored yet would be left behind by opening another draft, so the tab says so and stays. */
const UNSTORED =
  "Your latest changes are not stored on this device yet. Keep this tab open, copy your draft or try again.";
/**
 * One tab's work on one of the device's drafts. Each edit is written under the draft's own ID, and
 * the latest edit wins: a version another tab wrote in between is kept as a backup by the
 * repository, with no warning (DL-112). Tabs tell each other about writes, so a tab that is not in
 * the middle of an edit shows the newest version.
 */
export class DraftController {
  private snapshot: DraftSnapshot = { draft: newDraft(), storage: "loading", error: null, ready: false, drafts: [] };
  private listeners = new Set<() => void>();
  /** The stored version this tab last read or wrote. Null while its draft is not stored. */
  private expected: DraftPin | null = null;
  private writable = false;
  /** The first read of storage failed, and no later one has succeeded. */
  private unread = false;
  private loading: Promise<void> | undefined;
  private writing: Promise<void> | undefined;
  private dirty = false;
  private repository: DraftRepository;
  private pointer: DraftPointer;
  private channel: DraftChannel | undefined;
  private listening = false;
  constructor(repository: DraftRepository, tabs: { pointer?: DraftPointer; channel?: DraftChannel } = {}) {
    this.repository = repository;
    this.pointer = tabs.pointer ?? memoryPointer();
    this.channel = tabs.channel;
  }
  getSnapshot = (): DraftSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(change: Partial<DraftSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
  /** The list with one stored draft added, replaced or taken out. */
  private listed(id: string, draft: DeviceDraft | null): DeviceDraft[] {
    const rest = this.snapshot.drafts.filter((item) => item.id !== id);
    return draft ? [...rest, draft] : rest;
  }
  private async refreshList(): Promise<void> {
    try {
      const drafts = await this.repository.list?.();
      if (drafts) this.publish({ drafts });
    } catch {
      /* The list keeps what it last read; the tab's own draft is not affected. */
    }
  }
  initialize(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        this.unread = false;
        await this.bringAcross();
        const named = this.pointer.get();
        const saved = await this.repository.load(named);
        // A tab that started a new initiative and has not typed yet names a draft that is not
        // stored. It stays on that blank draft across a reload, and never falls back to another one.
        const blank = named && !saved ? { ...newDraft(), id: named } : null;
        this.writable = true;
        if (!this.listening && this.channel) {
          this.listening = true;
          this.channel.listen((message) => void this.heard(message));
        }
        // Words typed before storage answered are a draft of their own. The stored one stays in the list.
        if (this.dirty) {
          this.publish({ storage: "saving", error: null, ready: true });
          this.startWrite();
        } else {
          this.expected = saved ? draftPin(saved) : null;
          if (saved) this.pointer.set(saved.id);
          this.publish({ draft: saved ?? blank ?? this.snapshot.draft, storage: saved ? "saved" : "none", error: null, ready: true });
        }
        await this.refreshList();
      } catch {
        this.unread = true;
        this.publish({ storage: "memory", ready: true, error: UNREAD });
      }
    })();
    return this.loading;
  }
  change(update: (draft: DeviceDraft) => DeviceDraft): DeviceDraft {
    const next = DeviceDraftSchema.parse(update(this.snapshot.draft));
    if (next.revision <= this.snapshot.draft.revision) throw new Error("Draft changes need a new revision");
    this.dirty = true;
    // Words typed while storage is still being read wait for it quietly. Once the read has
    // failed they stay in this tab, and the page never shows them without saying so.
    if (this.writable) this.publish({ draft: next, storage: "saving" });
    else this.publish({ draft: next, storage: "memory", error: this.unread ? (this.snapshot.error ?? UNREAD) : this.snapshot.error });
    if (this.writable) this.startWrite();
    return next;
  }
  private startWrite() {
    if (this.writing) return;
    this.writing = (async () => {
      while (this.dirty && this.writable) {
        const draft = this.snapshot.draft;
        try {
          await this.repository.save(draft, this.expected);
          // Only the draft the tab is still on moves the tab's own bookkeeping.
          const here = this.snapshot.draft.id === draft.id;
          if (here) {
            this.expected = draftPin(draft);
            this.pointer.set(draft.id);
          }
          this.channel?.post({ kind: "saved", id: draft.id });
          const drafts = this.listed(draft.id, draft);
          if (this.snapshot.draft === draft || !here) {
            this.dirty = false;
            this.publish({ storage: "saved", error: null, drafts });
          } else this.publish({ drafts });
        } catch {
          this.publish({
            storage: "memory",
            error:
              "The latest changes could not be stored. Keep this tab open, remove a large file or copy your draft text.",
          });
          break;
        }
      }
    })().finally(() => {
      this.writing = undefined;
    });
  }
  /**
   * Another tab wrote or removed a draft. The list is read again. When it is this tab's draft and
   * no edit here is waiting to be written, the tab shows the stored version; an edit that is
   * waiting is the latest one, so it is written and wins.
   */
  private async heard(message: DraftMessage): Promise<void> {
    await this.refreshList();
    const before = this.snapshot.draft;
    if (message.id !== before.id || this.dirty || this.writing || !this.writable) return;
    try {
      const stored = await this.repository.load(message.id);
      if (this.snapshot.draft !== before || this.dirty) return;
      if (!stored) {
        // Removed in another tab: this tab starts clean, and the removed draft is in the backups.
        if (this.expected === null) return;
        this.expected = null;
        this.pointer.set(null);
        this.publish({ draft: newDraft(), storage: "none", error: null });
        return;
      }
      if (this.expected && pinned(stored, this.expected)) return;
      this.expected = draftPin(stored);
      this.publish({ draft: stored, storage: "saved", error: null });
    } catch {
      /* The tab keeps what it shows; its next edit still writes. */
    }
  }
  /**
   * Takes in what the released build's storage holds and this build has not seen. A failure to
   * read it changes nothing: its draft stays where it is, and the next look tries again.
   */
  private async bringAcross(): Promise<string[]> {
    try {
      return (await this.repository.bringAcross?.()) ?? [];
    } catch {
      return [];
    }
  }
  /**
   * Looks at the released build's storage again (DL-114). A tab still running that build cannot
   * tell this one that it wrote, so this build looks: when a tab comes back on screen and when
   * the list of initiatives is opened. A draft that changed there is shown here unless an edit
   * is waiting in this tab, and that edit then wins with the other version kept as a backup.
   */
  async lookAgain(): Promise<void> {
    if (!this.repository.bringAcross) return;
    await this.loaded();
    if (!this.writable) return;
    for (const id of await this.bringAcross()) {
      this.channel?.post({ kind: "saved", id });
      await this.heard({ kind: "saved", id });
    }
  }
  backups() {
    return this.repository.backups?.() ?? Promise.resolve([]);
  }
  /**
   * Starts a new initiative in this tab. The draft the tab was on stays stored under its own ID,
   * so nothing is backed up and nothing is asked. The new one is stored at its first edit.
   */
  async startNew(): Promise<DeviceDraft> {
    await this.loaded();
    await this.settled();
    if (this.dirty) throw new Error(UNSTORED);
    const draft = newDraft();
    this.expected = null;
    this.pointer.set(draft.id);
    // A first read that failed is still a failure on the new draft: the notice, Try Again and the
    // text copy stay, because its words would reach memory only.
    if (this.writable) this.publish({ draft, storage: "none", error: null });
    else this.publish({ draft, storage: "memory", error: UNREAD });
    return draft;
  }
  /** Opens one of the device's stored drafts in this tab. Throws when it is no longer stored. */
  async open(id: string): Promise<DeviceDraft> {
    await this.loaded();
    if (this.snapshot.draft.id === id) return this.snapshot.draft;
    // While the first read of storage has not succeeded, the tab cannot store a draft it opens,
    // so it does not open one as if it could. The failure and its Try Again stay on screen.
    if (!this.writable) throw new Error(UNREAD);
    await this.settled();
    if (this.dirty) throw new Error(UNSTORED);
    const before = this.snapshot.draft;
    const stored = await this.repository.load(id);
    // Words that arrived while the other draft was being read belong to the draft on screen. The
    // tab stays on it, so they are stored and shown where they were typed.
    if (this.dirty || this.writing || this.snapshot.draft !== before) throw new Error(STILL_STORING);
    if (!stored) {
      await this.refreshList();
      throw new Error("This draft is no longer on this device.");
    }
    this.expected = draftPin(stored);
    this.pointer.set(stored.id);
    this.publish({ draft: stored, storage: "saved", error: null, drafts: this.listed(stored.id, stored) });
    return stored;
  }
  /**
   * Opens `next` in this tab in place of whatever its ID holds on the device: a loaded account
   * card or a restored backup. A stored version under the same ID is backed up first. A draft
   * with another ID, the tab's own included, is not touched.
   */
  async replace(next: DeviceDraft, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.loaded();
    const previous = this.snapshot.draft;
    await this.settled();
    signal?.throwIfAborted();
    if (!this.writable || this.dirty || this.snapshot.draft !== previous || !this.repository.replace)
      throw new Error(
        "The device draft changed or could not be backed up. Keep this tab open and try again.",
      );
    const validated = DeviceDraftSchema.parse({
      ...next,
      revision: Math.max(previous.revision, next.revision) + 1,
      mark: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    // The repository checks cancellation until its atomic commit. A completed commit is device work.
    await this.repository.replace(validated, signal);
    this.channel?.post({ kind: "saved", id: validated.id });
    // Words typed during the transaction stay this tab's draft. They are the latest edit, so
    // they are written next, and the version just stored is then kept as a backup.
    if (this.snapshot.draft !== previous) {
      this.publish({ drafts: this.listed(validated.id, validated) });
      this.dirty = true;
      this.startWrite();
      throw new Error("Your latest words are still in this tab, so nothing else was opened. Try again.");
    }
    this.expected = draftPin(validated);
    this.pointer.set(validated.id);
    this.publish({ draft: validated, storage: "saved", error: null, drafts: this.listed(validated.id, validated) });
  }
  /** Removes one backup for good. Every draft and every other backup stay. */
  async deleteBackup(backup: DraftBackup): Promise<DeviceRemoval> {
    if (!this.repository.deleteBackup) throw new RemovalNotice("This device cannot remove backups. Nothing was removed.");
    return this.repository.deleteBackup(backup.key, draftPin(backup.draft));
  }
  /**
   * Removes this tab's draft from the device after keeping it as a backup. A version another tab
   * wrote meanwhile, or words typed meanwhile, stop it: they stay, and nothing is removed.
   */
  async discardCurrent(): Promise<DeviceRemoval & { backup: string }> {
    await this.loaded();
    const previous = this.snapshot.draft;
    await this.settled();
    if (!this.writable || this.dirty || this.snapshot.draft !== previous || this.expected === null || !this.repository.discard)
      throw new RemovalNotice("The device draft changed or is not stored yet. Keep this tab open and try again. Nothing was removed.");
    // A save still waiting for its answer would otherwise bind whatever draft follows to its card.
    if (previous.account.pending)
      throw new RemovalNotice("A save to your account is not confirmed yet. Save again or wait for it to finish, then remove this draft. Nothing was removed.");
    let result: DeviceRemoval & { backup: string };
    try {
      result = await this.repository.discard(draftPin(previous));
    } catch (error) {
      // Another tab's version is what the device holds now, so this tab shows it.
      if (error instanceof DraftChanged) await this.heard({ kind: "saved", id: previous.id });
      throw error;
    }
    this.channel?.post({ kind: "removed", id: previous.id });
    if (this.snapshot.draft !== previous) {
      // Words typed during the removal are the latest edit: they are written again as this draft.
      if (this.expected && pinned(previous, this.expected)) this.expected = null;
      this.publish({ drafts: this.listed(previous.id, null) });
      this.dirty = true;
      this.startWrite();
      throw new RemovalNotice("Your latest words are still in this tab and stay on this device. The earlier version was kept as a device backup.");
    }
    this.expected = null;
    this.pointer.set(null);
    this.publish({ draft: newDraft(), storage: "none", error: null, drafts: this.listed(previous.id, null) });
    return result;
  }
  /**
   * Changes one of the device's drafts by its ID, whether or not this tab is on it: a save's
   * receipt for a draft the person has since left, or a saved card removed from the account.
   * `update` returns null to leave the draft as it is. False when it is gone or left alone.
   */
  async amend(id: string, update: (draft: DeviceDraft) => DeviceDraft | null): Promise<boolean> {
    await this.loaded();
    if (this.snapshot.draft.id === id) {
      const next = update(this.snapshot.draft);
      if (!next) return false;
      this.change(() => next);
      await this.settled();
      return true;
    }
    const stored = await this.repository.load(id);
    const next = stored && update(stored);
    if (!stored || !next) return false;
    const validated = DeviceDraftSchema.parse(next);
    await this.repository.save(validated, draftPin(stored));
    this.channel?.post({ kind: "saved", id });
    this.publish({ drafts: this.listed(id, validated) });
    return true;
  }
  /**
   * Moves one of the device's drafts that this tab is not on into the backups: a working copy
   * that the account's newer version has just replaced under the card's own ID, so the card is
   * not left as two drafts. The tab's own draft, one waiting for a save's answer and one that
   * changed meanwhile are left alone. False when nothing was moved.
   */
  async retire(id: string): Promise<boolean> {
    await this.loaded();
    if (this.snapshot.draft.id === id || !this.repository.discard) return false;
    const stored = await this.repository.load(id);
    if (!stored || stored.account.pending) return false;
    try {
      await this.repository.discard(draftPin(stored));
    } catch (error) {
      if (error instanceof DraftChanged) return false;
      throw error;
    }
    this.channel?.post({ kind: "removed", id });
    this.publish({ drafts: this.listed(id, null) });
    return true;
  }
  async settled(): Promise<void> {
    await this.writing;
  }
  /** The first read of device storage has answered, so the tab knows which draft it is on. */
  private async loaded(): Promise<void> {
    await this.loading;
  }
  retry(): void {
    if (this.writable) {
      this.publish({ storage: "saving", error: null });
      this.startWrite();
    } else {
      this.loading = undefined;
      void this.initialize();
    }
  }
}
