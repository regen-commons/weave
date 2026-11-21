import type { Attachment, DeviceDraft } from "./contracts.ts";

type FileRead = NonNullable<DeviceDraft["lastBuild"]>["files"][number];

/**
 * What the page says under one added file: what the last reading made of it. A file is read on
 * this device as soon as it is added (DL-124), so the line names the result and not a promise. A
 * file whose kind cannot be read, and one a reading could not open, both say so plainly, and a
 * PDF read in part says how many pages were left.
 */
export function fileNote(
  file: Pick<Attachment, "id" | "name" | "type">,
  reads: readonly FileRead[],
  reading = false,
): string {
  const readable = /^text\//u.test(file.type) || /\.(txt|md|csv|pdf)$/iu.test(file.name) || file.type === "application/pdf";
  if (!readable) return "kept on this device, content not read";
  const read = reads.find((entry) => entry.id === file.id);
  if (!read) return reading ? "reading on this device" : "kept on this device, not read yet";
  if (read.status === "read") return "read on this device";
  if (read.status === "partial")
    return `read on this device, except ${read.unreadPages} of ${read.pages} ${read.pages === 1 ? "page" : "pages"}`;
  return "kept on this device, but its text could not be read";
}
