import { useEffect, useId, useMemo, useState } from "react";
import { revise } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { fullDate } from "../home.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Card, CardGrid } from "../ui/Card.tsx";
import { PUBLIC_PARTNER_EVIDENCE } from "./catalog.ts";
import type { EvidenceKind, PartnerEvidence } from "./evidence.ts";
import { availableEvidence, localPartnerQuery, type PartnerMatch } from "./match.ts";
import { queryLocalPartners } from "./local-query.ts";

const labels: Record<EvidenceKind, string> = {
  confirmed_offer: "Confirmed offers",
  published_offer: "Published offers to check",
  inferred_capability: "Relevant experience",
  published_need: "Public requests that may fit your offers",
};
const availability: Record<EvidenceKind, string> = {
  confirmed_offer: "Confirmed for the stated scope. Check the details before making plans.",
  published_offer: "The source lists this resource. Check its current availability and terms.",
  inferred_capability: "This source describes relevant work. Availability is unknown.",
  published_need: "The source invites contributions. Check what is still needed before offering help.",
};
const kinds: EvidenceKind[] = ["confirmed_offer", "published_offer", "inferred_capability", "published_need"];

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
      ? (kept ? "Lead saved on this device." : "Lead removed on this device.")
      : "The change is only in this tab. Device storage is unavailable.");
  }

  function card(evidence: PartnerEvidence, match?: PartnerMatch) {
    const isSaved = draft.partnerLeads.includes(evidence.id);
    const Title = mode === "preview" ? "h4" : "h3";
    return (
      <li key={match ? `${match.ask.id}/${evidence.id}` : evidence.id}>
        <Card>
          <Title className="rc-card-title">{evidence.project}</Title>
          {match && (
            <p className="rc-card-meta">
              {evidence.kind === "published_need" ? "Your offer" : "Your need"}: {match.ask.value.title}.
              {" "}Shared topics: {match.hits.join(", ")}.
            </p>
          )}
          <p className="rc-card-summary">{evidence.summary}</p>
          <p className="rc-meta">{availability[evidence.kind]}{match?.checkPlace && " Check the location."}</p>
          {evidence.kind === "confirmed_offer" && (
            <p className="rc-meta">
              Capacity: {evidence.confirmation.capacity}. For: {evidence.confirmation.audience}.
              {" "}Confirmed on {fullDate(evidence.confirmation.confirmedOn)}.
            </p>
          )}
          <p className="rc-meta">
            {evidence.source.publisher}. Source checked{" "}
            <time dateTime={evidence.source.checkedOn}>{fullDate(evidence.source.checkedOn)}</time>.
          </p>
          <div className="rc-action-bar">
            <a className="rc-button" data-variant="secondary" href={evidence.source.url}
              target="_blank" rel="noopener noreferrer">View source</a>
            {mode !== "preview" && (
              <button className="rc-button" data-variant="quiet" type="button"
                disabled={!ready || storage === "saving" || storage === "conflict"}
                onClick={() => void toggleLead(evidence.id)}>
                {isSaved ? "Remove saved lead" : "Save lead"}
              </button>
            )}
          </div>
        </Card>
      </li>
    );
  }

  const hasNeeds = query.needs.length > 0;
  const hasOffers = query.offers.length > 0;
  const visible = mode === "preview" ? results.slice(0, 2) : results;
  return (
    <div className="rc-stack">
      <p className="rc-meta">
        This starter collection covers selected public sources. Matching happens on this device.
      </p>
      {mode === "browse" ? kinds.map((kind) => {
        const entries = catalog.filter((evidence) => evidence.kind === kind);
        if (!entries.length) return null;
        return (
          <section className="rc-stack" key={kind} aria-labelledby={`${id}-${kind}`}>
            <h2 className="rc-heading" data-size="section" id={`${id}-${kind}`}>
              {kind === "published_need" ? "Public requests" : labels[kind]}
            </h2>
            <CardGrid>{entries.map((evidence) => card(evidence))}</CardGrid>
          </section>
        );
      }) : !ready ? <p role="status">Opening your device draft</p> : (
        <>
          {matching && local?.query !== query ? <p role="status">Checking public suggestions on this device</p> : !visible.length && (
            <p>{hasNeeds || hasOffers
              ? "No public sources in this collection matched your open needs or offers."
              : "Keep an open need or offer to see suggestions for your initiative."}</p>
          )}
          {kinds.map((kind) => {
            const matches = visible.filter(({ evidence }) => evidence.kind === kind);
            if (!matches.length) return null;
            const Heading = mode === "preview" ? "h3" : "h2";
            return (
              <section className="rc-stack" key={kind} aria-labelledby={`${id}-${kind}`}>
                <Heading className="rc-heading" data-size="section" id={`${id}-${kind}`}>{labels[kind]}</Heading>
                <CardGrid>{matches.map((match) => card(match.evidence, match))}</CardGrid>
              </section>
            );
          })}
          <div className="rc-action-bar">
            {mode === "preview" ? (
              <ButtonLink href={pathTo("partners")} variant="secondary">Explore partners</ButtonLink>
            ) : (
              <>
                <ButtonLink href={pathTo(draft.confirmed ? "needs" : "initiative")} variant="secondary">
                  {draft.confirmed ? (hasNeeds ? "Change your needs" : "Add a need") : "Describe your initiative"}
                </ButtonLink>
                {draft.confirmed && (
                  <ButtonLink href={pathTo("offers")} variant="quiet">
                    {hasOffers ? "Change your offers" : "Add an offer"}
                  </ButtonLink>
                )}
                <ButtonLink href={pathTo("initiatives")} variant="quiet">Browse public initiatives</ButtonLink>
              </>
            )}
          </div>
        </>
      )}
      {mode === "matches" && saved.length > 0 && (
        <section className="rc-stack" aria-labelledby={`${id}-saved`}>
          <h2 className="rc-heading" data-size="section" id={`${id}-saved`}>Saved leads on this device</h2>
          <CardGrid>{saved.map((evidence) => card(evidence))}</CardGrid>
        </section>
      )}
      {mode !== "preview" && <p className="rc-meta" role="status">{notice}</p>}
    </div>
  );
}
