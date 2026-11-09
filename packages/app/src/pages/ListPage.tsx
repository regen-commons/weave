import { useSocialFixture } from "../social/context.tsx";
import { SocialAction } from "../social/Action.tsx";
import { PartnerDiscovery } from "../partners/PartnerDiscovery.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { EMPTY_FILTERS, selectRecords, partnerAccess, type CapitalKey } from "../listing.ts";
import { navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";
import { ShareCard } from "../ui/ShareCard.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";

export function ListPage({
  title,
  kind,
  fixture,
  subject,
}: {
  title: string;
  kind: "partners" | "funding" | "initiatives";
  fixture?: FixtureContext;
  subject?: { needs: readonly CapitalKey[]; offers: readonly CapitalKey[] };
}) {
  const social = useSocialFixture();
  const shared = social
    ? social.state.saved && social.state.visibility === "public"
    : partnerAccess(fixture?.scenario);
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    search: new URLSearchParams(window.location.search).get("q") ?? "",
  }));
  const device = useDraft();
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const records =
    import.meta.env.DEV && fixture ? (kind === "funding" ? fixture.funding : fixture.initiatives) : [];
  const personalized = !!fixture && fixture.scenario !== "visitor";
  const visibleFilters = personalized
    ? filters
    : {
        ...filters,
        relation: "any" as const,
        sort: filters.sort === "fit" ? ("name" as const) : filters.sort,
      };
  const selected = selectRecords(records, visibleFilters, subject);
  const partners = kind === "partners";
  if (!fixture && kind !== "funding") {
    return (
      <ListLayout>
        <Heading level={1} size="page">{title}</Heading>
        {partners ? <PartnerExperience mode="matches" /> : <PartnerDiscovery mode="browse" />}
      </ListLayout>
    );
  }
  function retry() {
    const url = new URL(window.location.href);
    url.searchParams.set("state", "ready");
    navigate(`${url.pathname}${url.search}`);
  }
  return (
    <ListLayout>
      <Heading level={1} size="page">
        {title}
      </Heading>
      <p className="rc-prose">
        {kind === "funding"
          ? "Find support for your next chapter."
          : partners
            ? "Find people whose work complements yours."
            : "See the work people are sharing."}
      </p>
      {fixture?.state === "error" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The example list did not load</h2>
            <p>Your search and filter choices are still here.</p>
            <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>
              Try again
            </button>
          </div>
        </section>
      ) : fixture?.state === "loading" ? (
        <section className="rc-stack" aria-busy="true" aria-label="Loading example list">
          <p role="status">Loading examples</p>
          <div className="rc-skeleton" />
          <div className="rc-skeleton" />
        </section>
      ) : partners && !shared ? (
        <ShareCard count={fixture && fixture.scenario !== "visitor" ? records.length : null}>
          <p className="rc-meta">
            {fixture
              ? "Fictional count only. No names or individual reasons are shown before sharing."
              : "Partner matching and sharing are not connected yet. The number of matches is not known."}
          </p>
          {import.meta.env.DEV && fixture && personalized ? (
            <SocialAction intent={{ kind: "share" }} inline />
          ) : null}
          <div className="rc-action-bar">
            {!hasDraft(device.draft) && !personalized && (
              <ButtonLink variant="primary" href={pathTo("initiative")}>
                Describe your initiative
              </ButtonLink>
            )}
            <ButtonLink variant="secondary" href={pathTo("initiatives")}>
              Browse all initiatives
            </ButtonLink>
          </div>
        </ShareCard>
      ) : !records.length ? (
        <EmptyState
          title={kind === "funding" ? "Funding is in the current directory" : "No initiatives here yet"}
          action={
            <ButtonLink
              variant="primary"
              href={kind === "funding" ? "https://funding-commons.vercel.app/" : pathTo("initiative")}
            >
              {kind === "funding" ? "Browse current funding" : "Describe your initiative"}
            </ButtonLink>
          }
        >
          {kind === "funding"
            ? "Every funder and program remains available in Funding Commons."
            : "Shared initiatives will appear here."}
        </EmptyState>
      ) : (
        <>
          {fixture?.state === "offline" && (
            <p className="rc-notice" data-tone="info">
              You are viewing offline examples. Search and filters still work on this device.
            </p>
          )}
          <FilterBar
            filters={visibleFilters}
            onChange={setFilters}
            countries={[...new Set(records.map((record) => record.country))].sort()}
            count={selected.length}
            total={records.length}
            noun={kind === "funding" ? "funds" : "initiatives"}
            partners={partners}
            personalized={personalized}
            funding={kind === "funding"}
          />
          {selected.length ? (
            <CardGrid>
              {selected.map((record) => (
                <li key={record.id}>
                  {partners && dismissed[record.id] ? (
                    <article className="rc-card">
                      <h2 className="rc-card-title">Hidden: {record.title}</h2>
                      <p className="rc-meta">
                        {dismissed[record.id]}. This example choice stays in this page.
                      </p>
                      <button
                        className="rc-button"
                        data-variant="quiet"
                        type="button"
                        autoFocus
                        onClick={() => {
                          setRestored(record.id);
                          setDismissed((previous) => {
                            const next = { ...previous };
                            delete next[record.id];
                            return next;
                          });
                        }}
                      >
                        Undo hide
                      </button>
                    </article>
                  ) : (
                    <ListingCard
                      record={record}
                      personalized={personalized && kind !== "initiatives"}
                      actions={
                        partners && (
                          <>
                            {import.meta.env.DEV && fixture && (
                              <SocialAction
                                intent={{ kind: "intro", ids: [record.id], names: [record.title] }}
                              />
                            )}
                            {dismissing === record.id ? (
                              <fieldset className="rc-field">
                                <legend>Why is it not a fit?</legend>
                                <div className="rc-action-bar">
                                  {[
                                    "Too far away",
                                    "Not what we need",
                                    "Already in touch",
                                    "Another reason",
                                  ].map((reason) => (
                                    <button
                                      key={reason}
                                      autoFocus={reason === "Too far away"}
                                      className="rc-button"
                                      data-variant="secondary"
                                      type="button"
                                      onClick={() => {
                                        setDismissed({
                                          ...dismissed,
                                          [record.id]: reason,
                                        });
                                        setDismissing(null);
                                      }}
                                    >
                                      {reason}
                                    </button>
                                  ))}
                                  <button
                                    className="rc-button"
                                    data-variant="quiet"
                                    type="button"
                                    onClick={() => {
                                      setDismissing(null);
                                      setRestored(record.id);
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </fieldset>
                            ) : (
                              <button
                                className="rc-button"
                                data-variant="quiet"
                                type="button"
                                autoFocus={restored === record.id}
                                onClick={() => {
                                  setRestored(null);
                                  setDismissing(record.id);
                                }}
                              >
                                Not a fit
                              </button>
                            )}
                          </>
                        )
                      }
                    />
                  )}
                </li>
              ))}
            </CardGrid>
          ) : (
            <EmptyState
              title="Nothing matches these filters"
              action={
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Clear filters
                </button>
              }
            >
              Try fewer filters or another search.
            </EmptyState>
          )}
        </>
      )}
    </ListLayout>
  );
}
