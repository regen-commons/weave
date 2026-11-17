import type { DeviceDraft } from "./contracts.ts";
import { BackupChanged, DraftConflict, RemovalNotice, type DeviceRemoval } from "./repository.ts";

/** The name a backup is listed under. Two backups can share it, so it never identifies one. */
export const draftTitle = (draft: DeviceDraft) => draft.confirmed?.name || draft.proposal?.name || "untitled draft";
/** The time shown beside a backup: when its draft last changed, not when the backup was made. Written in full. */
export const draftTime = (draft: DeviceDraft) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" }).format(new Date(draft.updatedAt));

/** Files kept inside a draft: its own, and those added to its needs and offers. */
export function attachedFiles(draft: DeviceDraft): number {
  return draft.attachments.length + draft.needs.attachments.length + draft.offers.attachments.length;
}
const files = (count: number) => `${count} attached ${count === 1 ? "file" : "files"}`;
const backups = (count: number) =>
  count === 0 ? "No backups kept." : `${count} ${count === 1 ? "backup" : "backups"} kept.`;

/** The confirmation for one backup, by name, displayed time and contents. */
export function backupDeleteWarning(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `This deletes the backup ${draftTitle(draft)}, last changed ${draftTime(draft)}, from this browser${
    count ? ` with its ${files(count)}` : ""}. It cannot be undone.`;
}
export function discardWarning(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `Weave keeps ${draftTitle(draft)} as a device backup first${count ? `, with its ${files(count)}` : ""}, so you can restore it below. A copy saved in your account is not changed.`;
}

export const removedBackupMessage = (result: DeviceRemoval) => `Removed 1 backup. ${backups(result.kept)}`;
export const discardedMessage = (result: DeviceRemoval) =>
  `Removed this draft from this device and kept it as a backup you can restore. ${backups(result.kept)}`;

/** Why nothing was removed. A conflict keeps the existing cross-tab words. */
export function deviceRemovalFailure(error: unknown): string {
  if (error instanceof DraftConflict || error instanceof BackupChanged || error instanceof RemovalNotice) return error.message;
  return "This device could not finish the removal. Nothing was removed.";
}
