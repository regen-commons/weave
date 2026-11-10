import { useMemo } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { examplePartners, readFixtures, type ExamplePartner } from "../fixtures.ts";
import { shareable } from "../initiative/status.ts";
import { routeSearch } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { SocialAction } from "../social/Action.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { partnerAccessOf, type SocialState } from "../social/fixture.ts";
import { ShareAction } from "../social/Share.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { ShareCard } from "../ui/ShareCard.tsx";
import { PUBLIC_PARTNER_EVIDENCE } from "./catalog.ts";
import { PREVIEW_FITS } from "./groups.ts";
import { localPartnerQuery, rankLocalPartners, type PartnerMatch } from "./match.ts";
import { FitCard, FitGroups } from "./NetworkResults.tsx";
import { EvidenceCard } from "./PartnerDiscovery.tsx";
import { MatchingDate } from "./SharingReview.tsx";

/** One result in the example world: an invented team that shared in Weave, or a real public source. */
type ExampleFit =
  | { readonly from: "weave"; readonly partner: ExamplePartner }
  | { readonly from: "public"; readonly match: PartnerMatch };

/**
 * Partners in the example world, by how far the person has come. Before the initiative is linked to a
 * Certified project there is only a gate. A linked initiative sees fits from public sources, matched
 * for real on this device. Once it shares an open need or offer it also sees other teams, which are
 * invented and labeled. Renders nothing outside the example world.
 */
export function ExamplePartners({ compact = false }: { compact?: boolean }) {
  const social = useSocialFixture();
  // Everything past this check is example-only, so a production build drops it with the invented data.
  if (!import.meta.env.DEV || !social) return null;
  return <ExampleFits state={social.state} compact={compact} />;
}

function ExampleFits({ state, compact }: { state: SocialState; compact: boolean }) {
  const { draft, ready } = useDraft();
  const access = partnerAccessOf(state);
  const search = routeSearch();
  const query = useMemo(() => localPartnerQuery(draft.needs, draft.offers, draft.confirmed?.locations),
    [draft.needs, draft.offers, draft.confirmed?.locations]);
  // Other teams are searched only with what the person shared, and only while it is open.
  const shared = access === "network" ? state.shared?.entries : undefined;
  const fits = useMemo<ExampleFit[]>(() => [
    ...(shared === undefined ? [] : examplePartners(
      shareable(draft, shared).filter(({ value }) => value.status === "open"),
      readFixtures(search).initiatives,
    )).map((partner) => ({ from: "weave" as const, partner })),
    ...rankLocalPartners(query, PUBLIC_PARTNER_EVIDENCE).map((match) => ({ from: "public" as const, match })),
  ], [draft, shared, search, query]);

  if (!ready) return <p role="status">Opening your draft</p>;
  if (access === "unlinked") {
    const described = hasDraft(draft);
    return (
      <ShareCard level={compact ? 3 : 2}>
        <ButtonLink href={pathTo(described ? "your-initiatives" : "initiative")} variant="primary">
          {described ? "Link or create a project" : "Describe your initiative"}
        </ButtonLink>
        <ButtonLink href={pathTo("initiatives")} variant="quiet">Browse all initiatives</ButtonLink>
      </ShareCard>
    );
  }

  const hasEntries = query.needs.length > 0 || query.offers.length > 0;
  const level = compact ? 4 : 3;
  return (
    <div className="rc-stack">
      {fits.some(({ from }) => from === "weave") && (
        <p className="rc-meta">Example partners. The initiatives shared in Weave are invented.</p>
      )}
      {!fits.length && (
        <p>{!hasEntries ? "Add an open need or offer to see partners."
          : access === "network" ? "No partners fit your open needs or offers yet."
          : "Nothing in this small set of public sources fits your open needs or offers yet."}</p>
      )}
      <FitGroups results={fits} kindOf={(fit) => fit.from === "weave" ? fit.partner.kind : fit.match.evidence.kind}
        keyOf={(fit) => fit.from === "weave"
          ? `weave/${fit.partner.id}` : `public/${fit.match.ask.id}/${fit.match.evidence.id}`}
        level={compact ? 3 : 2} limit={compact ? PREVIEW_FITS : undefined}>
        {(fit) => fit.from === "weave" ? (
          <FitCard level={level} name={fit.partner.name} entry={fit.partner.entry} kind={fit.partner.kind}
            basis={<>Shared in Weave on <MatchingDate value={fit.partner.confirmedOn} />.</>}
            actions={!compact && (
              <SocialAction intent={{ kind: "lead", id: fit.partner.id, name: fit.partner.name }} />
            )}>
            <p><strong>{fit.partner.title}</strong></p>
            <p>{fit.partner.passage}</p>
          </FitCard>
        ) : (
          <EvidenceCard level={level} evidence={fit.match.evidence} match={fit.match}
            save={!compact && (
              <SocialAction intent={{ kind: "lead", id: fit.match.evidence.id, name: fit.match.evidence.project }} />
            )} />
        )}
      </FitGroups>
      {access === "public" && (
        <p>To search what other teams have shared, share at least one open need or offer.</p>
      )}
      {(access === "public" || compact) && (
        <div className="rc-action-bar">
          {access === "public" && <ShareAction variant="secondary" />}
          {compact && <ButtonLink href={pathTo("partners")} variant="secondary">See all partners</ButtonLink>}
        </div>
      )}
    </div>
  );
}
