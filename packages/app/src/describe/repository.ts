import { DeviceDraftSchema, type DeviceDraft } from "./contracts.ts";

export class DraftConflict extends Error {
  constructor() {
    super("Another tab changed this draft. Copy your words before reloading.");
  }
}
export interface DraftBackup {
  key: string;
  draft: DeviceDraft;
}
export interface DraftRepository {
  load(): Promise<DeviceDraft | null>;
  backups?(): Promise<DraftBackup[]>;
  replace?(draft: DeviceDraft, expectedRevision: number | null): Promise<void>;
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
  async replace(draft: DeviceDraft, expectedRevision: number | null) {
    const previous = this.value;
    await this.save(draft, expectedRevision);
    if (previous) this.history.unshift({ key: crypto.randomUUID(), draft: previous });
  }
  async load() {
    return this.value;
  }
  async save(draft: DeviceDraft, expectedRevision: number | null) {
    if ((this.value?.revision ?? null) !== expectedRevision) throw new DraftConflict();
    this.value = DeviceDraftSchema.parse(draft);
  }
}
