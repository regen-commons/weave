import { useEffect, useRef, type RefObject } from "react";
import type { Attachment, DeviceDraft } from "../describe/contracts.ts";
import { fileNote } from "../describe/file-note.ts";
import { Link } from "../router.tsx";
/** Local file and link references. No preview fetch is implied. */
export function AttachmentList({
  files,
  readOnBuild = true,
  reads,
  reading = false,
  links,
  onRemoveFile,
  onRemoveLink,
  afterLast,
}: {
  files: readonly Attachment[];
  readOnBuild?: boolean;
  /** What the last reading made of each file, where the page reads a file as it is added (DL-127). */
  reads?: readonly NonNullable<DeviceDraft["lastBuild"]>["files"][number][];
  /** A reading is under way, so a file with no result yet is being read. */
  reading?: boolean;
  links: readonly string[];
  onRemoveFile(id: string): void;
  onRemoveLink(url: string): void;
  /** Where the focus goes once the last file or link is removed, such as Add Files. */
  afterLast?: RefObject<HTMLElement | null>;
}) {
  // Remove takes its own row away, and the browser would drop the focus on the page. It goes to the
  // Remove that took the row's place, or the one before it, or past the list once it is empty (WCAG 2.4.3).
  const list = useRef<HTMLUListElement>(null);
  const removedAt = useRef<number | null>(null);
  const count = files.length + links.length;
  useEffect(() => {
    const at = removedAt.current;
    removedAt.current = null;
    if (at === null) return;
    const left = list.current ? [...list.current.querySelectorAll<HTMLElement>(":scope > li > button")] : [];
    (left[Math.min(at, left.length - 1)] ?? afterLast?.current)?.focus();
  }, [count]);
  if (!count) return null;
  return (
    <ul className="rc-attachment-list" aria-label="Files and links" ref={list}>
      {files.map((file, index) => (
        <li className="rc-attachment" key={file.id}>
          <div>
            <strong>{file.name}</strong>
            <p className="rc-meta">
              {new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(file.bytes / 1024)} KB,{" "}
              {!readOnBuild
                ? "kept on this device; not read in manual mode"
                : reads
                  ? fileNote(file, reads, reading)
                  : /^text\//u.test(file.type) || /\.(txt|md|csv|pdf)$/iu.test(file.name)
                  ? "text read when you build, where readable"
                  : "kept on this device, content not read"}
            </p>
          </div>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => {
              removedAt.current = index;
              onRemoveFile(file.id);
            }}
          >
            Remove
          </button>
        </li>
      ))}
      {links.map((link, index) => (
        <li className="rc-attachment" key={link}>
          <div>
            {/* A kept link is whatever was typed, so it opens apart from this page even where it is not a full address. */}
            <Link href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </Link>
            <p className="rc-meta">Link kept here. Its page has not been read.</p>
          </div>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            aria-label={`Remove ${link}`}
            onClick={() => {
              removedAt.current = files.length + index;
              onRemoveLink(link);
            }}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
