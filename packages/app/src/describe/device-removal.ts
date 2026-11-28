import type { DeviceDraft } from "./contracts.ts";
import type { DraftController } from "./controller.ts";
import { BackupChanged, DraftChanged, RemovalNotice, type DeviceRemoval } from "./repository.ts";

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
/** The confirmation for restoring one backup: which one opens, and what happens to a draft it takes the place of. */
export function restoreWarning(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `This opens the backup ${draftTitle(draft)}, last changed ${draftTime(draft)}${
    count ? `, with its ${files(count)}` : ""}. A draft it replaces is kept as a backup first.`;
}
/** One line under a backup's name: when it last changed and what it holds. */
export function backupLine(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `Last changed ${draftTime(draft)}${count ? `, ${files(count)}` : ""}`;
}
/** How many backups the list shows before it offers the rest, so a long history never fills the page. */
export const BACKUPS_SHOWN = 4;
/** Backups newest first, by when each draft last changed, and only the first few unless all are asked for. */
export function listedBackups<T extends { draft: DeviceDraft }>(backups: readonly T[], all: boolean): T[] {
  const newest = [...backups].sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt));
  return all ? newest : newest.slice(0, BACKUPS_SHOWN);
}
export function discardWarning(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `Weave keeps ${draftTitle(draft)} as a device backup first${count ? `, with its ${files(count)}` : ""}, so you can restore it below.`;
}

/**
 * What a removal found when it looked at an older tab's storage first, in a sentence that is true
 * for each outcome: words that are in the list again, words kept as a backup, and words it could
 * not read, which are still where the older tab stored them.
 */
function olderTabLine(older: DeviceRemoval["older"]): string {
  if (!older) return "";
  const lines: string[] = [];
  if (older.drafts.length) lines.push("An older tab on this device held newer words, and they are in Your Initiatives now.");
  if (older.backups) lines.push("An older tab on this device held words this build had not seen. They are kept as a device backup.");
  if (older.waiting) lines.push("An older tab on this device holds newer words that could not be read just now. They are still there, and will appear in Your Initiatives.");
  return lines.length ? ` ${lines.join(" ")}` : "";
}
export const removedBackupMessage = (result: DeviceRemoval) =>
  `Removed 1 backup. ${backups(result.kept)}${olderTabLine(result.older)}`;
export const discardedMessage = (result: DeviceRemoval) =>
  `Removed this draft from this device and kept it as a backup you can restore. ${backups(result.kept)}`;

/**
 * Moves one of this device's drafts into its backups, whichever tab it is open in: the tab's own
 * through `discardCurrent`, which then opens a blank draft, and any other through `retire`. False
 * when the other draft changed meanwhile or waits for a save's answer; the tab's own throws a
 * `RemovalNotice` in those cases. Nothing is deleted: the backup can be restored in Settings.
 */
export async function backUpDraft(
  controller: Pick<DraftController, "getSnapshot" | "discardCurrent" | "retire">,
  id: string,
): Promise<boolean> {
  if (controller.getSnapshot().draft.id === id) {
    await controller.discardCurrent();
    return true;
  }
  return controller.retire(id);
}

/** The confirmation for moving one draft from Your Initiatives to the device's backups. */
export function backUpWarning(draft: DeviceDraft): string {
  const count = attachedFiles(draft);
  return `This moves ${draftTitle(draft)}${count ? `, with its ${files(count)},` : ""} from Your Initiatives to the device backups in Settings, where you can restore it or delete it for good. It is not saved anywhere else.`;
}
/** Said when a draft other than the tab's could not be moved: it changed or left meanwhile. */
export const NOT_BACKED_UP = "This draft changed on this device meanwhile. Nothing was removed. Try again in a moment.";
/** Said after a draft moved to the backups: where it went. */
export const backedUpMessage = (draft: DeviceDraft) =>
  `Moved ${draftTitle(draft)} to the device backups. Restore it or delete it for good in Settings, under Device Backups.`;

/** Why nothing was removed. A draft another tab changed meanwhile keeps that tab's words. */
export function deviceRemovalFailure(error: unknown): string {
  if (error instanceof DraftChanged || error instanceof BackupChanged || error instanceof RemovalNotice) return error.message;
  return "This device could not finish the removal. Nothing was removed.";
}
