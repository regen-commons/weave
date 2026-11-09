import { CAPITALS } from "../capitals.ts";
import { LENS_LABELS } from "../describe/contracts.ts";
import { fullDate } from "../home.ts";
import { SCOPES, STATUS, TERMS, URGENCY } from "../intake/contracts.ts";
import { amountText } from "../intake/presentation.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { entryKey, type SharingPreview } from "./matching-client.ts";

export function MatchingDate({ value }: { value: string }) {
  return <time dateTime={value}>{fullDate(new Date(value).toISOString().slice(0, 10))}</time>;
}

export function SharingReview({ review, action, busy, retry, error, onConfirm, onClose }: {
  review: SharingPreview;
  action: "share" | "renew";
  busy: boolean;
  retry: boolean;
  error: string;
  onConfirm(): void;
  onClose(): void;
}) {
  const summary = review.summary;
  return (
    <TaskDialog title={action === "renew" ? "Review renewed sharing" : "Review what you’ll share"} open onClose={onClose}>
      <div className="rc-stack" aria-busy={busy}>
        <p>Signed-in Weave users can see this initiative summary and the selected entries in their matches. Sharing ends on <MatchingDate value={review.expiresAt} />.</p>
        <section className="rc-stack" aria-label="Initiative summary">
          <h3 className="rc-heading" data-size="section">{summary.name}</h3>
          <p>{summary.description}</p>
          <p>{summary.isGlobal ? "Global" : summary.locations.join(", ")}</p>
          {!!summary.lenses.length && <p>{summary.lenses.map((lens) => LENS_LABELS[lens]).join(", ")}</p>}
          {!!summary.themes.length && <p>{summary.themes.join(", ")}</p>}
        </section>
        <ul className="rc-ask-summary">
          {review.entries.map((entry) => {
            const { value } = entry;
            return (
              <li key={entryKey(entry)}>
                <strong>{entry.kind === "need" ? "Need" : "Offer"}, {value.title}</strong>
                {value.description && <p>{value.description}</p>}
                <p>{CAPITALS.filter(({ key }) => value.capitalForms.includes(key)).map(({ title }) => title).join(", ")}</p>
                {value.amount && <p>{amountText(value.amount)}</p>}
                {value.purpose && <p><strong>Purpose</strong> {value.purpose}</p>}
                {value.capacity && <p><strong>Capacity</strong> {value.capacity}</p>}
                {value.audience && <p><strong>Who it’s for</strong> {value.audience}</p>}
                {value.timeframe && <p><strong>Timing</strong> {value.timeframe}</p>}
                {value.urgency && <p><strong>How soon</strong> {URGENCY[value.urgency]}</p>}
                <p>{SCOPES[value.placeScope]}, {value.exchangeTerms.map((term) => TERMS[term]).join(" or ")}, {STATUS[value.status]}</p>
              </li>
            );
          })}
        </ul>
        {error && <p className="rc-notice" data-tone="warning" role="alert">{error}</p>}
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={onConfirm}>
            {retry ? "Retry confirmation" : action === "renew" ? "Confirm renewed sharing" : "Share selected entries"}
          </button>
        </div>
      </div>
    </TaskDialog>
  );
}
