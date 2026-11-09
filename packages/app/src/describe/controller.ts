import { DeviceDraftSchema, newDraft, type DeviceDraft } from "./contracts.ts";
import { DraftConflict, type DraftRepository } from "./repository.ts";
export type DeviceStorage = "loading" | "none" | "saving" | "saved" | "memory" | "conflict";
export interface DraftSnapshot {
  draft: DeviceDraft;
  storage: DeviceStorage;
  error: string | null;
  ready: boolean;
}
/** One writer per tab. IndexedDB compares the last stored revision before replacing a draft. */
export class DraftController {
  private snapshot: DraftSnapshot = { draft: newDraft(), storage: "loading", error: null, ready: false };
  private listeners = new Set<() => void>();
  private expected: number | null = null;
  private writable = false;
  private loading: Promise<void> | undefined;
  private writing: Promise<void> | undefined;
  private dirty = false;
  constructor(privateRepo: DraftRepository) {
    this.repository = privateRepo;
  }
  private repository: DraftRepository;
  getSnapshot = (): DraftSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(change: Partial<DraftSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
  initialize(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const saved = await this.repository.load();
        if (this.dirty && saved) {
          this.publish({
            ready: true,
            storage: "conflict",
            error: "Your words in this tab are still here. Copy them before loading a saved draft.",
          });
          return;
        }
        this.expected = saved?.revision ?? null;
        this.writable = true;
        this.publish({
          draft: saved ?? this.snapshot.draft,
          storage: this.dirty ? "saving" : saved ? "saved" : "none",
          error: null,
          ready: true,
        });
        if (this.dirty) this.startWrite();
      } catch {
        this.publish({
          storage: "memory",
          ready: true,
          error:
            "Device storage could not be read. Any saved draft has not been changed. New words stay in this tab only.",
        });
      }
    })();
    return this.loading;
  }
  change(update: (draft: DeviceDraft) => DeviceDraft): DeviceDraft {
    const next = DeviceDraftSchema.parse(update(this.snapshot.draft));
    if (next.revision <= this.snapshot.draft.revision) throw new Error("Draft changes need a new revision");
    this.dirty = true;
    this.publish({
      draft: next,
      storage: this.writable ? "saving" : this.snapshot.storage === "conflict" ? "conflict" : "memory",
    });
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
          this.expected = draft.revision;
          if (this.snapshot.draft.revision === draft.revision) {
            this.dirty = false;
            this.publish({ storage: "saved", error: null });
          }
        } catch (error) {
          const conflict = error instanceof DraftConflict;
          if (conflict) this.writable = false;
          this.publish({
            storage: conflict ? "conflict" : "memory",
            error: conflict
              ? error.message
              : "The latest changes could not be stored. Keep this tab open, remove a large file or copy your draft text.",
          });
          break;
        }
      }
    })().finally(() => {
      this.writing = undefined;
    });
  }
  backups() {
    return this.repository.backups?.() ?? Promise.resolve([]);
  }
  async replace(next: DeviceDraft): Promise<void> {
    const previous = this.snapshot.draft;
    await this.settled();
    if (!this.writable || this.dirty || this.snapshot.draft !== previous || !this.repository.replace)
      throw new Error(
        "The device draft changed or could not be backed up. Keep this tab open and try again.",
      );
    const validated = DeviceDraftSchema.parse({
      ...next,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.replace(validated, this.expected);
    // Another edit during the transaction remains visible and will conflict safely on its next write.
    if (this.snapshot.draft !== previous) {
      this.writable = false;
      this.publish({
        storage: "conflict",
        error: "Your latest words are still in this tab. A device backup was kept before loading.",
      });
      throw new DraftConflict();
    }
    this.expected = validated.revision;
    this.publish({ draft: validated, storage: "saved", error: null });
  }
  async settled(): Promise<void> {
    await this.writing;
  }
  retry(): void {
    if (this.writable) {
      this.publish({ storage: "saving", error: null });
      this.startWrite();
    } else if (this.snapshot.storage !== "conflict") {
      this.loading = undefined;
      void this.initialize();
    }
  }
}
