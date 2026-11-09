import type { ReactNode } from "react";
import type { Initiative } from "../describe/contracts.ts";
import { LENS_LABELS } from "../describe/contracts.ts";
import { WorkTag } from "./WorkTag.tsx";
import { STAGE_LABELS } from "../listing.ts";
/** Card preview: it fills in while the person talks; it is not an account or public record. */
export function RecordPreview({
  fields,
  confirmed,
  children,
}: {
  fields: Initiative;
  confirmed: boolean;
  children?: ReactNode;
}) {
  return (
    <article
      className="rc-card rc-draft-preview"
      data-pencil={!confirmed || undefined}
      aria-label="Your initiative preview"
    >
      <h2 className="rc-card-title">{fields.name || "Your initiative"}</h2>
      <p className="rc-card-meta">
        {fields.isGlobal ? "Global" : fields.locations.join("; ") || "Add where you work"}
      </p>
      <p className="rc-card-summary">{fields.description || "Your words will fill this card."}</p>
      {fields.stage && <p className="rc-meta">{STAGE_LABELS[fields.stage]}</p>}
      {!!fields.lenses.length && (
        <ul className="rc-tag-list">
          {fields.lenses.map((lens) => (
            <li key={lens}>
              <WorkTag work={LENS_LABELS[lens]} />
            </li>
          ))}
        </ul>
      )}
      {children}
      <p className="rc-draft-status">
        {confirmed
          ? "Card checked. Source words and files stay on this device."
          : "Draft in this browser. It has not been shared."}
      </p>
    </article>
  );
}
