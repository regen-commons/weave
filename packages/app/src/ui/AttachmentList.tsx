import type { Attachment } from "../describe/contracts.ts";
/** Local file and link references. No preview fetch is implied. */
export function AttachmentList({
  files,
  readOnBuild = true,
  links,
  onRemoveFile,
  onRemoveLink,
}: {
  files: readonly Attachment[];
  readOnBuild?: boolean;
  links: readonly string[];
  onRemoveFile(id: string): void;
  onRemoveLink(url: string): void;
}) {
  if (!files.length && !links.length) return null;
  return (
    <ul className="rc-attachment-list" aria-label="Files and links">
      {files.map((file) => (
        <li className="rc-attachment" key={file.id}>
          <div>
            <strong>{file.name}</strong>
            <p className="rc-meta">
              {new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(file.bytes / 1024)} KB,{" "}
              {!readOnBuild
                ? "kept on this device; not read in manual mode"
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
            onClick={() => onRemoveFile(file.id)}
          >
            Remove
          </button>
        </li>
      ))}
      {links.map((link) => (
        <li className="rc-attachment" key={link}>
          <div>
            <a href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
            <p className="rc-meta">Link kept here. Its page has not been read.</p>
          </div>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            aria-label={`Remove ${link}`}
            onClick={() => onRemoveLink(link)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
