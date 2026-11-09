import type { MatchingEntryKey } from "@weave/api/matching-contract";
import { Card, CardGrid } from "../ui/Card.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import {
  entryKey, leadKey, type EntryRef, type MatchingSearch, type NetworkLead, type NetworkMatch,
} from "./matching-client.ts";

const evidenceLabels: Record<NetworkMatch["evidenceKind"], string> = {
  confirmed_offer: "Owner-confirmed offer",
  confirmed_need: "Owner-confirmed need",
  published_offer: "Published offer to check",
  published_request: "Public request to check",
  inferred_capability: "Relevant experience",
  potential_use: "Possible use for your offer",
};
const evidenceContext: Record<NetworkMatch["evidenceKind"], string> = {
  confirmed_offer: "The owner shared this offer. Check the details before making plans.",
  confirmed_need: "The owner shared this need. Check the details before making plans.",
  published_offer: "The source describes an offer. Check what is currently available.",
  published_request: "The source invites contributions. Check what is still needed.",
  inferred_capability: "The source describes related work. Availability is unknown.",
  potential_use: "Your offer could support the work described here. The source gives no confirmed need.",
};

export type NamedEntry = EntryRef & { title: string };
type ChangeLead = (entry: EntryRef, candidateId: string, disposition: NetworkLead["disposition"]) => void;

function LeadButton({ children, onClick, disabled }: {
  children: string;
  onClick(): void;
  disabled: boolean;
}) {
  return <button className="rc-button" data-variant="quiet" type="button" disabled={disabled} onClick={onClick}>{children}</button>;
}

export function NetworkResults({ search, leads, entries, compact, blocked, onChange, onRemove }: {
  search: MatchingSearch | null;
  leads: NetworkLead[] | null;
  entries: NamedEntry[];
  compact: boolean;
  blocked: boolean;
  onChange: ChangeLead;
  onRemove(entry: MatchingEntryKey, candidateId: string): void;
}) {
  const Group = compact ? "h4" : "h3";
  const Title = compact ? "h5" : "h4";
  const leadIndex = new Map(leads?.map((lead) => [leadKey(lead, lead.candidateId), lead]));
  const now = Date.now();
  const matches = search?.results.filter(({ evidence }) =>
    evidence.type !== "shared" || Date.parse(evidence.expiresAt) > now) ?? [];
  const matchIndex = new Map(matches.map((match) => [leadKey(match.query, match.candidateId), match]));
  const entriesByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const coverage = search?.coverage;
  const disabled = blocked || leads === null;

  return (
    <>
      {coverage && <Coverage coverage={coverage} />}
      {search && !matches.length && <p>No current matches were found for the shared entries searched.</p>}
      {entries.map((entry) => {
        const candidates = matches.filter(({ query }) => entryKey(query) === entryKey(entry) && query.revision === entry.revision);
        if (!search || !candidates.length) return null;
        return (
          <section className="rc-stack" key={entryKey(entry)} aria-label={entry.title}>
            <Group className="rc-heading" data-size="section">{entry.kind === "need" ? "Your need" : "Your offer"}, {entry.title}</Group>
            <CardGrid>
              {(compact ? candidates.slice(0, 2) : candidates).map((match) => {
                const lead = leadIndex.get(leadKey(entry, match.candidateId));
                return (
                  <li key={match.candidateId}>
                    {lead?.disposition === "dismissed" ? (
                      <Card>
                        <p className="rc-meta">Lead hidden for this entry.</p>
                        <LeadButton disabled={disabled} onClick={() => onRemove(entry, match.candidateId)}>Undo hide</LeadButton>
                      </Card>
                    ) : (
                      <Card>
                        <Title className="rc-card-title">{match.counterpart.name}</Title>
                        <p className="rc-card-meta">{evidenceLabels[match.evidenceKind]}</p>
                        {match.evidence.type === "shared" ? (
                          <>
                            <p><strong>{match.evidence.title}</strong></p>
                            {match.evidence.passage && <p>{match.evidence.passage}</p>}
                            <p className="rc-meta">Confirmed on <MatchingDate value={match.evidence.confirmedAt} />. Sharing ends on <MatchingDate value={match.evidence.expiresAt} />.</p>
                          </>
                        ) : (
                          <>
                            <blockquote className="rc-prose">{match.evidence.passage}</blockquote>
                            <p className="rc-meta">
                              Source dated <MatchingDate value={match.evidence.sourceCreatedAt} />. Checked on <MatchingDate value={match.evidence.fetchedAt} />.
                            </p>
                          </>
                        )}
                        <p>{evidenceContext[match.evidenceKind]}</p>
                        {match.reasons.map(({ terms }) => <p className="rc-meta" key={terms.join(", ")}>Shared topics include {terms.join(", ")}.</p>)}
                        {!!match.unknowns.length && <p className="rc-meta">Details to check include {match.unknowns.join(", ")}.</p>}
                        {match.reciprocal && <p className="rc-meta">This initiative has a match in both directions.</p>}
                        <div className="rc-action-bar">
                          {match.evidence.type === "public" && (
                            <a className="rc-button" data-variant="secondary" href={match.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>
                          )}
                          {!compact && (
                            <>
                              <LeadButton disabled={disabled} onClick={() => lead ? onRemove(entry, match.candidateId) : onChange(entry, match.candidateId, "saved")}>
                                {lead ? "Remove saved lead" : "Save lead"}
                              </LeadButton>
                              <LeadButton disabled={disabled} onClick={() => onChange(entry, match.candidateId, "dismissed")}>Hide lead</LeadButton>
                            </>
                          )}
                        </div>
                      </Card>
                    )}
                  </li>
                );
              })}
            </CardGrid>
          </section>
        );
      })}
      {!compact && !!leads?.some(({ disposition }) => disposition === "saved") && (
        <section className="rc-stack" aria-label="Private saved leads">
          <Group className="rc-heading" data-size="section">Private saved leads</Group>
          <ul className="rc-ask-summary">
            {leads.filter(({ disposition }) => disposition === "saved").map((lead) => {
              const key = leadKey(lead, lead.candidateId);
              const match = matchIndex.get(key);
              const entry = entriesByKey.get(entryKey(lead));
              return (
                <li key={key}>
                  <strong>{match?.counterpart.name ?? (lead.candidateId.startsWith("public:") ? "Public project lead" : "Shared entry lead")}</strong>
                  <p className="rc-meta">
                    {entry ? entry.title : (lead.kind === "need" ? "Earlier need" : "Earlier offer")}.{" "}
                    {lead.evidenceStatus === "unavailable" ? "Evidence is no longer available"
                      : lead.evidenceStatus === "current" ? "Evidence is current" : "Current evidence could not be checked"}
                  </p>
                  <LeadButton disabled={disabled} onClick={() => onRemove(lead, lead.candidateId)}>Remove saved lead</LeadButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Coverage({ coverage }: { coverage: MatchingSearch["coverage"] }) {
  return (
    <div className="rc-meta">
      <p>Matches use shared entries and a limited collection of public sources.</p>
      {coverage.external === "partial" &&
        <p role="status">Public evidence covers a limited set of projects. Coverage may be incomplete.</p>}
      {coverage.external === "unavailable" &&
        <p role="status">The public collection could not be checked. Shared entries are included.</p>}
      {coverage.external === "stale" && <p role="status">Some public evidence may be out of date. Check the source before relying on it.</p>}
      {coverage.modelVersion === null && <p>Showing text matches. Model refinement is unavailable.</p>}
    </div>
  );
}
