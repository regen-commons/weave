import { useId, type ReactNode } from "react";
import type { MatchingEntryKey } from "@weave/api/matching-contract";
import { CAPITALS } from "../capitals.ts";
import { Card, CardGrid } from "../ui/Card.tsx";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Tag } from "../ui/Tag.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import {
  FIT_BASIS, PREVIEW_FITS, entryLine, fitLead, fitLines, fitStrength, groupFits, topicsLine, unknownLine,
  type FitEvidence,
} from "./groups.ts";
import {
  entryKey, leadKey, type EntryRef, type MatchingSearch, type NetworkLead, type NetworkMatch,
} from "./matching-client.ts";

export const evidenceLabels: Record<NetworkMatch["evidenceKind"], string> = {
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

/** What supports one match and what to check: dates, why it fits, shared topics and what is unknown. */
export function MatchDetails({ match }: { match: NetworkMatch }) {
  const evidence = match.evidence;
  return (
    <>
      {evidence.type === "shared" ? (
        <p className="rc-meta">Confirmed on <MatchingDate value={evidence.confirmedAt} />. {evidence.expiresAt ? <>Sharing ends on <MatchingDate value={evidence.expiresAt} />.</> : "Shared until closed or withdrawn."}</p>
      ) : (
        <p className="rc-meta">
          Source dated <MatchingDate value={evidence.sourceCreatedAt} />. Checked on <MatchingDate value={evidence.fetchedAt} />.
        </p>
      )}
      <p>{evidenceContext[match.evidenceKind]}</p>
      {match.reasons.map(({ type, terms }) => <p className="rc-meta" key={`${type}:${terms.join(", ")}`}>
        {type === "related_terms" ? "Related wording: " : "Shared topics include "}{terms.join(", ")}.
      </p>)}
      {!!match.unknowns.length && <p className="rc-meta">Details to check include {match.unknowns.join(", ")}.</p>}
      {match.reciprocal && <p className="rc-meta">This initiative has a match in both directions.</p>}
    </>
  );
}

export type NamedEntry = EntryRef & {
  title: string;
  /** The kinds of support the person gave the entry, which colour the card it is matched on. */
  kinds?: readonly string[];
};
type ChangeLead = (entry: EntryRef, candidateId: string, disposition: NetworkLead["disposition"]) => void;

/**
 * Partner results in their two groups: direct fits, then possible fits, each under its heading and the
 * one line that says what the group rests on. A group with no results is left out.
 */
export function FitGroups<Result>({ results, kindOf, keyOf, level, limit, children }: {
  results: readonly Result[];
  kindOf(result: Result): FitEvidence;
  keyOf(result: Result): string;
  /** Heading level of the group titles. Result titles sit one level below. */
  level: 2 | 3 | 4;
  /** At most this many results from each group. */
  limit?: number;
  children(result: Result): ReactNode;
}) {
  const id = useId();
  const Title = `h${level}` as const;
  return (
    <>
      {groupFits(results, kindOf, limit).map((group) => group.results.length > 0 && (
        <section className="rc-section" key={group.key} aria-labelledby={`${id}-${group.key}`}>
          <Title className="rc-heading" data-size="section" id={`${id}-${group.key}`}>{group.heading}</Title>
          <p className="rc-meta">{group.explanation}</p>
          <CardGrid>
            {group.results.map((result) => <li key={keyOf(result)}>{children(result)}</li>)}
          </CardGrid>
        </section>
      ))}
    </>
  );
}

/**
 * One partner result (DL-064). It leads with how strong the fit is, then who it is, why it fits, the
 * other side's own words, what to check and what the result rests on, using the system's Fit, Tag
 * and Reason patterns. Strength and reasons show only where one of the person's entries is matched;
 * a browsed result claims no fit. The name is plain text, never a link, so opening the source,
 * saving and hiding stay separate targets.
 */
export function FitCard({
  level, name, entry, kind, reciprocal = false, topics = [], kinds = [], unknowns = [], basis, checkPlace = false,
  actions, children,
}: {
  level: 3 | 4 | 5;
  name: string;
  /** The person's own need or offer this result is for. Left out where nothing is being matched. */
  entry?: { kind: "need" | "offer"; title: string };
  kind: FitEvidence;
  /** The other side also has a need or an offer that fits the person's. */
  reciprocal?: boolean;
  /** Words the two sides share. */
  topics?: readonly string[];
  /** Kinds of support the result is about. */
  kinds?: readonly string[];
  /** What the search could not tell. */
  unknowns?: readonly string[];
  /** Where the evidence comes from and its date in full. It follows the line that says what supports the result. */
  basis: ReactNode;
  /** The result does not say whether the place fits. */
  checkPlace?: boolean;
  actions?: ReactNode;
  /** The other side's own words. */
  children: ReactNode;
}) {
  const Title = `h${level}` as const;
  const { supports, check } = fitLines(kind);
  const strength = fitStrength(kind, reciprocal);
  const { direction, lead } = fitLead(kind);
  const shared = topicsLine(topics);
  const unknown = unknownLine(checkPlace ? [...unknowns, "place"] : unknowns);
  const capitals = CAPITALS.filter((capital) => kinds.includes(capital.key));
  return (
    <Card>
      {entry && <Fit level={strength} explanation={FIT_BASIS[strength]} />}
      <Title className="rc-card-title">{name}</Title>
      {capitals.length > 0 && (
        <ul className="rc-tag-list" aria-label="Kinds of support">
          {capitals.map((capital) => <li key={capital.key}><Tag capital={capital} /></li>)}
        </ul>
      )}
      {entry && (
        <ul className="rc-reasons">
          <li className="rc-reason">
            <Icon name={direction === "they-offer" ? "offer" : "need"} size="sm" />
            <span>{lead}: <strong>{entry.title}</strong></span>
          </li>
          {reciprocal && (
            <li className="rc-reason"><Icon name="people" size="sm" /><span>The fit goes both ways.</span></li>
          )}
          {shared && <li className="rc-reason"><Icon name="search" size="sm" /><span>{shared}</span></li>}
        </ul>
      )}
      {children}
      <p>{check}{unknown && ` ${unknown}`}</p>
      <p className="rc-meta">{supports} {basis}</p>
      {actions && <div className="rc-action-bar">{actions}</div>}
    </Card>
  );
}

/** Opens the public source a result rests on, in a new tab. */
export function SourceLink({ href, name }: { href: string; name: string }) {
  return (
    <a className="rc-button" data-variant="quiet" data-size="sm" href={href} target="_blank" rel="noopener noreferrer"
      aria-label={`Open the source: ${name}`}>Open the source</a>
  );
}

function LeadButton({ label, name, variant = "quiet", onClick, disabled }: {
  label: string;
  /** Whose result the button acts on, so buttons with the same label can be told apart. */
  name: string;
  variant?: "secondary" | "quiet";
  onClick(): void;
  disabled: boolean;
}) {
  return (
    <button className="rc-button" data-variant={variant} data-size="sm" type="button" disabled={disabled}
      aria-label={`${label}: ${name}`} onClick={onClick}>{label}</button>
  );
}

export function NetworkResults({ search, leads, entries, compact, blocked, onChange, onRemove, readOnly = false, includePublic = true }: {
  search: MatchingSearch | null;
  leads: NetworkLead[] | null;
  entries: NamedEntry[];
  compact: boolean;
  blocked: boolean;
  readOnly?: boolean;
  includePublic?: boolean;
  onChange: ChangeLead;
  onRemove(entry: MatchingEntryKey, candidateId: string): void;
}) {
  const id = useId();
  const Group = compact ? "h4" : "h3";
  const Title = compact ? "h5" : "h4";
  const leadIndex = new Map(leads?.map((lead) => [leadKey(lead, lead.candidateId), lead]));
  const now = Date.now();
  const matches = search?.results.filter(({ evidence }) =>
    evidence.type !== "shared" || (evidence.expiresAt === null || Date.parse(evidence.expiresAt) > now)) ?? [];
  const matchIndex = new Map(matches.map((match) => [leadKey(match.query, match.candidateId), match]));
  const entriesByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const disabled = blocked || leads === null;
  // Results for each entry as it stands now, in the order the search ranked them.
  const current = entries.flatMap((entry) => matches
    .filter(({ query, evidence }) => (includePublic || evidence.type === "shared") && entryKey(query) === entryKey(entry) && query.revision === entry.revision)
    .map((match) => ({ entry, match, lead: leadIndex.get(leadKey(entry, match.candidateId)) })));
  // A preview has no room for a hidden result, so the next one takes its place.
  const fits = compact ? current.filter(({ lead }) => lead?.disposition !== "dismissed") : current;
  const saved = compact ? [] : leads?.filter(({ disposition }) => disposition === "saved") ?? [];

  return (
    <>
      {search && <CoverageGaps coverage={search.coverage} />}
      {search && !matches.length && <p>No partners fit what you have shared yet.</p>}
      <FitGroups results={fits} kindOf={({ match }) => match.evidenceKind}
        keyOf={({ entry, match }) => leadKey(entry, match.candidateId)}
        level={compact ? 4 : 3} limit={compact ? PREVIEW_FITS : undefined}>
        {({ entry, match, lead }) => {
          const name = match.counterpart.name;
          if (lead?.disposition === "dismissed") {
            return (
              <Card>
                <Title className="rc-card-title">{name}</Title>
                <p className="rc-card-meta">{entryLine(entry.kind, entry.title)}</p>
                <p className="rc-meta">You hid this result.</p>
                <div className="rc-action-bar">
                  {!readOnly && <LeadButton label="Undo hide" name={name} disabled={disabled}
                    onClick={() => onRemove(entry, match.candidateId)} />}
                </div>
              </Card>
            );
          }
          const { evidence } = match;
          return (
            <FitCard level={compact ? 5 : 4} name={name} entry={entry} kind={match.evidenceKind}
              reciprocal={match.reciprocal} topics={match.reasons.flatMap(({ terms }) => terms)}
              kinds={entry.kinds} unknowns={match.unknowns}
              basis={evidence.type === "shared" ? (
                <>Shared in Weave on <MatchingDate value={evidence.confirmedAt} />.</>
              ) : (
                <>
                  Source dated <MatchingDate value={evidence.sourceCreatedAt} />, checked on{" "}
                  <MatchingDate value={evidence.fetchedAt} />.
                </>
              )}
              actions={(evidence.type === "public" || !compact) && (
                <>
                  {!compact && !readOnly && (
                    <LeadButton label={lead ? "Remove from saved" : "Save"} name={name}
                      variant={lead ? "quiet" : "secondary"} disabled={disabled || readOnly}
                      onClick={() => lead
                        ? onRemove(entry, match.candidateId)
                        : onChange(entry, match.candidateId, "saved")} />
                  )}
                  {evidence.type === "public" && <SourceLink href={evidence.sourceUrl} name={name} />}
                  {!compact && !readOnly && (
                    <LeadButton label="Hide" name={name} disabled={disabled || readOnly}
                      onClick={() => onChange(entry, match.candidateId, "dismissed")} />
                  )}
                </>
              )}>
              {evidence.type === "shared" ? (
                <>
                  <p><strong>{evidence.title}</strong></p>
                  {evidence.passage && <p>{evidence.passage}</p>}
                </>
              ) : <blockquote className="rc-prose">{evidence.passage}</blockquote>}
            </FitCard>
          );
        }}
      </FitGroups>
      {saved.length > 0 && (
        <section className="rc-section" aria-labelledby={`${id}-saved`}>
          <Group className="rc-heading" data-size="section" id={`${id}-saved`}>Saved partners</Group>
          <p className="rc-meta">These stay private. Saving sends no invitation.</p>
          <ul className="rc-ask-summary">
            {saved.map((lead) => {
              const key = leadKey(lead, lead.candidateId);
              const match = matchIndex.get(key);
              const entry = entriesByKey.get(entryKey(lead));
              const external = lead.candidateId.startsWith("public:");
              const name = match?.counterpart.name ?? (external ? "A public project" : "An initiative on Weave");
              return (
                <li key={key}>
                  <strong>{name}</strong>
                  <p className="rc-meta">
                    {entry ? entryLine(entry.kind, entry.title)
                      : lead.kind === "need" ? "For an earlier need" : "For an earlier offer"}
                  </p>
                  {lead.evidenceStatus !== "current" && (
                    <p className="rc-meta">
                      {lead.evidenceStatus === "unknown" ? "Could not check whether this is still current."
                        : external ? "The source is no longer available." : "They no longer share this."}
                    </p>
                  )}
                  <div className="rc-action-bar">
                    {!readOnly && <LeadButton label="Remove from saved" name={name} disabled={disabled}
                      onClick={() => onRemove(lead, lead.candidateId)} />}
                    {match?.evidence.type === "public" && <SourceLink href={match.evidence.sourceUrl} name={name} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {search && !compact && <HowItWorks coverage={search.coverage} />}
    </>
  );
}

/** A gap in what the search covered that changes what a person should do. Said outright, before the results. */
function CoverageGaps({ coverage }: { coverage: MatchingSearch["coverage"] }) {
  if (coverage.external === "unavailable") {
    return <p role="status">Public sources could not be checked, so this search covers only what other teams shared.</p>;
  }
  if (coverage.external === "stale") {
    return <p role="status">Some public sources may be out of date. Open the source before relying on one.</p>;
  }
  return null;
}

/** The standing rules of the search, opened on request. A preview leaves them to the full page. */
function HowItWorks({ coverage }: { coverage: MatchingSearch["coverage"] }) {
  return (
    <details>
      <summary className="rc-footer-link">How this works</summary>
      <p>
        Results come from what other teams shared in Weave and from a limited set of public sources.
        {coverage.external === "partial" && " Some public sources were not checked, so results may be incomplete."}
        {coverage.modelVersion === null && (coverage.engineVersion === "partner-concepts-v2"
          ? " This search uses words and related phrases. Other wording may be missed."
          : " This search matched words only, so related wording can be missed.")}
        {" "}Saving keeps a result in a private list and sends no invitation.
      </p>
    </details>
  );
}
