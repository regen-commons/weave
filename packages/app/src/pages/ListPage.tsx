import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerDiscovery } from "../partners/PartnerDiscovery.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { EMPTY_FILTERS, selectRecords, type CapitalKey } from "../listing.ts";
import { currentRoute, navigate, routeSearch } from "../router.tsx";
import { pathTo, routeWith } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";

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
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    search: new URLSearchParams(routeSearch()).get("q") ?? "",
  }));
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
    navigate(routeWith(currentRoute(), "state", "ready"));
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
      ) : partners ? (
        <ExamplePartners />
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
            partners={false}
            personalized={personalized}
            funding={kind === "funding"}
          />
          {selected.length ? (
            <CardGrid>
              {selected.map((record) => (
                <li key={record.id}>
                  <ListingCard record={record} personalized={personalized && kind !== "initiatives"} />
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
