import { useId, type ReactNode } from "react";
import { CAPITALS } from "../capitals.ts";
import { Link } from "../router.tsx";
import { CardGrid, Card } from "../ui/Card.tsx";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Tag } from "../ui/Tag.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import { FIT_BASIS, fitLead, fitLines, fitStrength, groupFits, topicsLine, unknownLine, type FitEvidence } from "./groups.ts";
import type { NetworkMatch } from "./matching-client.ts";

/** How a partner result explains itself, and the cards and groups the partner lists share. */
const evidenceContext: Record<NetworkMatch["evidenceKind"], string> = {
  confirmed_offer: "The owner shared this offer. Check the details before making plans.",
  confirmed_need: "The owner shared this need. Check the details before making plans.",
  published_offer: "The source describes an offer. Check what is currently available.",
  published_request: "The source invites contributions. Check what is still needed.",
  inferred_capability: "The source describes related work. Availability is unknown.",
  potential_use: "Your offer could support the work described here. The source gives no confirmed need.",
};
/** A direct fit from another project's published listing (DL-155, step 5). */
const listingContext: Record<"need" | "offer", string> = {
  offer: "The project published this offer. Check the details before making plans.",
  need: "The project published this need. Check the details before making plans.",
};

/** One reason a match rests on: shared words, related wording, or what links the two sides (DL-144). */
export type MatchReason = { readonly type: "shared_terms" | "related_terms" | "complement"; readonly terms: readonly string[] };
/** How each kind of reason opens its sentence. */
export function reasonLead(type: MatchReason["type"]): string {
  return type === "related_terms" ? "Related wording: " : type === "complement" ? "What links you: " : "Shared topics include ";
}

/** What supports one match and what to check: dates, why it fits, shared topics and what is unknown. */
export function PartialFitDetails({ partial }: {
  partial: { evidence: string; toCheck: string; supportingPassage?: string };
}) {
  return (
    <div className="rc-stack">
      <p>{partial.evidence}</p>
      <p className="rc-meta">Check {partial.toCheck.charAt(0).toLowerCase() + partial.toCheck.slice(1)}</p>
      {partial.supportingPassage && <blockquote className="rc-prose">{partial.supportingPassage}</blockquote>}
    </div>
  );
}

export function MatchDetails({ match }: { match: Omit<NetworkMatch, "reasons"> & { reasons: readonly MatchReason[]; partial?: unknown } }) {
  const evidence = match.evidence;
  return (
    <>
      {evidence.type === "shared" ? (
        <p className="rc-meta">Confirmed on <MatchingDate value={evidence.confirmedAt} />. {evidence.expiresAt ? <>Sharing ends on <MatchingDate value={evidence.expiresAt} />.</> : "Shared until closed or withdrawn."}</p>
      ) : evidence.type === "listing" ? (
        <p className="rc-meta">Published on <MatchingDate value={evidence.createdAt} />. {evidence.expiresAt ? <>Open until <MatchingDate value={evidence.expiresAt} />.</> : "Open until the project closes it."}</p>
      ) : (
        <p className="rc-meta">
          Source dated <MatchingDate value={evidence.sourceCreatedAt} />. Checked on <MatchingDate value={evidence.fetchedAt} />.
        </p>
      )}
      {!match.partial && <p>{evidence.type === "listing"
        ? listingContext[match.evidenceKind === "confirmed_need" ? "need" : "offer"] : evidenceContext[match.evidenceKind]}</p>}
      {match.reasons.map(({ type, terms }) => <p className="rc-meta" key={`${type}:${terms.join(", ")}`}>
        {reasonLead(type)}{terms.join(", ")}.
      </p>)}
      {!!match.unknowns.length && <p className="rc-meta">Details to check include {match.unknowns.join(", ")}.</p>}
      {match.reciprocal && <p className="rc-meta">This initiative has a match in both directions.</p>}
    </>
  );
}

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
 * a browsed result claims no fit. On a matched result the name is plain text, never a link, so
 * opening the source, saving and hiding stay separate targets. A result that is only browsed, as on
 * Initiatives, opens its source from its name (`href`), as every other card in a list opens.
 */
export function FitCard({
  level, name, href, entry, kind, reciprocal = false, topics = [], kinds = [], unknowns = [], basis, checkPlace = false,
  actions, children,
}: {
  level: 2 | 3 | 4 | 5 | 6;
  name: string;
  /** The public source the name opens, in a new tab. Left out where the card has its own Open the source. */
  href?: string;
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
    <Card kind="initiative">
      {entry && <Fit level={strength} explanation={FIT_BASIS[strength]} />}
      <Title className="rc-card-title">{href ? <Link href={href}>{name}</Link> : name}</Title>
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
    <Link className="rc-button" data-variant="quiet" data-size="sm" href={href}
      aria-label={`Open the source: ${name} (opens in a new tab)`}>Open The Source</Link>
  );
}
