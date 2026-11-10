import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { revise } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { PUBLIC_PARTNER_EVIDENCE } from "./catalog.ts";
import type { EvidenceKind, PartnerEvidence } from "./evidence.ts";
import { PREVIEW_FITS } from "./groups.ts";
import { availableEvidence, localPartnerQuery, type PartnerMatch } from "./match.ts";
import { queryLocalPartners } from "./local-query.ts";
import { FitCard, FitGroups, SourceLink } from "./NetworkResults.tsx";
import { MatchingDate } from "./SharingReview.tsx";

/** The public catalog by kind of evidence, for browsing it with no need or offer to match. */
const BROWSE: readonly { kind: EvidenceKind; heading: string }[] = [
  { kind: "confirmed_offer", heading: "Confirmed offers" },
  { kind: "published_offer", heading: "Published offers to check" },
  { kind: "inferred_capability", heading: "Relevant experience" },
  { kind: "published_need", heading: "Public requests" },
];

/**
 * One result from a public source: the project, the person's own entry where one was matched, the
 * source's summary, what supports the result with its source and date, and what to check.
 */
export function EvidenceCard({ level, evidence, match, save }: {
  level: 3 | 4;
  evidence: PartnerEvidence;
  /** The need or offer the result was matched to. Left out where the catalog is only browsed. */
  match?: PartnerMatch;
  /** The control that saves the result, where the page has one. */
  save?: ReactNode;
}) {
  const { project, source } = evidence;
  return (
    <FitCard level={level} name={project} kind={evidence.kind} checkPlace={match?.checkPlace}
      entry={match && { kind: evidence.kind === "published_need" ? "offer" : "need", title: match.ask.value.title }}
      basis={evidence.kind === "confirmed_offer" ? (
        <>Confirmed on <MatchingDate value={evidence.confirmation.confirmedOn} />. Source: {source.publisher}.</>
      ) : (
        <>Source: {source.publisher}, checked on <MatchingDate value={source.checkedOn} />.</>
      )}
      actions={<>{save}<SourceLink href={source.url} name={project} /></>}>
      <p className="rc-card-summary">{evidence.summary}</p>
      {evidence.kind === "confirmed_offer" && (
        <p className="rc-meta">Capacity: {evidence.confirmation.capacity}. For: {evidence.confirmation.audience}.</p>
      )}
    </FitCard>
  );
}

export function PartnerDiscovery({ mode }: { mode: "browse" | "matches" | "preview" }) {
  const id = useId();
  const { draft, controller, ready, storage } = useDraft();
  const [notice, setNotice] = useState("");
  const catalog = availableEvidence(PUBLIC_PARTNER_EVIDENCE, new Date());
  const query = useMemo(() => localPartnerQuery(draft.needs, draft.offers, draft.confirmed?.locations),
    [draft.needs, draft.offers, draft.confirmed?.locations]);
  const [local, setLocal] = useState<{ query: typeof query; matches: PartnerMatch[] } | null>(null);
  const matching = mode !== "browse" && ready && (query.needs.length > 0 || query.offers.length > 0);
  useEffect(() => {
    if (!matching) return;
    const controller = new AbortController();
    void queryLocalPartners(query, controller.signal).then((matches) => {
      if (!controller.signal.aborted) setLocal({ query, matches });
    }).catch(() => {});
    return () => controller.abort();
  }, [matching, query]);
  const results = local?.query === query ? local.matches : [];
  const saved = catalog.filter((evidence) => draft.partnerLeads.includes(evidence.id));

  async function toggleLead(evidenceId: string) {
    let kept = false;
    controller.change((current) => {
      kept = !current.partnerLeads.includes(evidenceId);
      return revise(current, {
        partnerLeads: kept
          ? [...current.partnerLeads, evidenceId]
          : current.partnerLeads.filter((value) => value !== evidenceId),
      });
    });
    await controller.settled();
    setNotice(controller.getSnapshot().storage === "saved"
      ? (kept ? "Saved on this device. No invitation is sent." : "Removed from saved.")
      : "The change is only in this tab. Device storage is unavailable.");
  }

  const preview = mode === "preview";
  function card(evidence: PartnerEvidence, match?: PartnerMatch) {
    const label = draft.partnerLeads.includes(evidence.id) ? "Remove from saved" : "Save";
    return (
      <EvidenceCard level={preview ? 4 : 3} evidence={evidence} match={match}
        save={!preview && (
          <button className="rc-button" data-variant={label === "Save" ? "secondary" : "quiet"} data-size="sm"
            type="button" aria-label={`${label}: ${evidence.project}`}
            disabled={!ready || storage === "saving" || storage === "conflict"}
            onClick={() => void toggleLead(evidence.id)}>{label}</button>
        )} />
    );
  }

  const hasEntries = query.needs.length > 0 || query.offers.length > 0;
  return (
    <div className="rc-stack">
      {mode === "browse" ? (
        <>
          <p className="rc-meta">These come from a small set of public sources.</p>
          {BROWSE.map(({ kind, heading }) => {
            const entries = catalog.filter((evidence) => evidence.kind === kind);
            return entries.length > 0 && (
              <section className="rc-section" key={kind} aria-labelledby={`${id}-${kind}`}>
                <h2 className="rc-heading" data-size="section" id={`${id}-${kind}`}>{heading}</h2>
                <CardGrid>{entries.map((evidence) => <li key={evidence.id}>{card(evidence)}</li>)}</CardGrid>
              </section>
            );
          })}
        </>
      ) : !ready ? <p role="status">Opening your draft</p> : (
        <>
          {matching && local?.query !== query ? <p role="status">Checking public sources</p> : !results.length && (
            <p>{hasEntries
              ? "Nothing in this small set of public sources fits your open needs or offers yet."
              : "Add an open need or offer to see partners."}</p>
          )}
          <FitGroups results={results} kindOf={({ evidence }) => evidence.kind}
            keyOf={({ ask, evidence }) => `${ask.id}/${evidence.id}`}
            level={preview ? 3 : 2} limit={preview ? PREVIEW_FITS : undefined}>
            {(match) => card(match.evidence, match)}
          </FitGroups>
          {!preview && (
            <div className="rc-action-bar">
              <ButtonLink href={pathTo(draft.confirmed ? "needs" : "initiative")} variant="secondary">
                {!draft.confirmed ? "Describe your initiative"
                  : hasEntries ? "Change needs and offers" : "Add needs and offers"}
              </ButtonLink>
              <ButtonLink href={pathTo("initiatives")} variant="quiet">Browse all initiatives</ButtonLink>
            </div>
          )}
        </>
      )}
      {mode === "matches" && saved.length > 0 && (
        <section className="rc-section" aria-labelledby={`${id}-saved`}>
          <h2 className="rc-heading" data-size="section" id={`${id}-saved`}>Saved partners on this device</h2>
          <p className="rc-meta">Saving sends no invitation.</p>
          <CardGrid>{saved.map((evidence) => <li key={evidence.id}>{card(evidence)}</li>)}</CardGrid>
        </section>
      )}
      {mode === "matches" && (
        <details>
          <summary className="rc-footer-link">How this works</summary>
          <p>
            These results come from a small set of public sources. The matching happens on this device,
            and nothing is sent.
          </p>
        </details>
      )}
      {!preview && <p className="rc-meta" role="status">{notice}</p>}
    </div>
  );
}
