import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { PublicProjects } from "../partners/PublicProjects.tsx";
import { useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { EMPTY_FILTERS, applyListFacet, listFacets, listSorts, selectRecords, type CapitalKey } from "../listing.ts";
import { currentRoute, navigate, routeSearch } from "../router.tsx";
import { pathTo, routeWith } from "../routes.ts";
import { FUNDING_COMMONS } from "../links.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";
import { useDescribeDoor } from "../ui/describe-door.ts";

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
  const door = useDescribeDoor();
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
  // Every list opens the same way: its name, one line that says what it is for, then its filter bar.
  const opening =
    kind === "funding"
      ? "Find support for your next chapter."
      : partners
        ? "Find people whose work complements yours."
        : "See the work people are sharing.";
  if (!fixture && kind !== "funding") {
    return (
      <ListLayout>
        <Heading level={1} size="page">{title}</Heading>
        <p className="rc-prose">{opening}</p>
        {partners ? <PartnerExperience mode="matches" /> : <PublicProjects />}
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
      <p className="rc-prose">{opening}</p>
      {fixture?.state === "error" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The list did not load</h2>
            <p>Your search and filter choices are still here.</p>
            <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>
              Try Again
            </button>
          </div>
        </section>
      ) : fixture?.state === "loading" && !partners ? (
        <section className="rc-stack" aria-busy="true" aria-label="Loading list">
          <FilterBar
            noun={kind === "funding" ? "funds" : "initiatives"}
            search={visibleFilters.search}
            onSearch={(search) => setFilters((current) => ({ ...current, search }))}
            facets={listFacets(visibleFilters, [])}
            onFacet={() => {}}
            sort={{ value: visibleFilters.sort, options: listSorts(personalized) }}
            onSort={() => {}}
            count={0}
            total={0}
            loading
            onClear={() => {}}
          />
          <CardGridSkeleton kind={kind === "funding" ? "funding" : "initiative"} count={6} />
        </section>
      ) : partners ? (
        <ExamplePartners />
      ) : !records.length ? (
        <EmptyState
          title={kind === "funding" ? "Funding is in the current directory" : "No initiatives here yet"}
          action={
            <ButtonLink
              variant="primary"
              href={kind === "funding" ? FUNDING_COMMONS : door.href}
            >
              {kind === "funding" ? "Browse Current Funding" : door.label}
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
              You are offline. Search and filters still work on this device.
            </p>
          )}
          <FilterBar
            noun={kind === "funding" ? "funds" : "initiatives"}
            search={visibleFilters.search}
            onSearch={(search) => setFilters((current) => ({ ...current, search }))}
            facets={listFacets(visibleFilters, [...new Set(records.map((record) => record.country))].sort())}
            onFacet={(key, chosen) => setFilters((current) => applyListFacet(current, key, chosen))}
            sort={{ value: visibleFilters.sort, options: listSorts(personalized) }}
            onSort={(sort) =>
              setFilters((current) => ({ ...current, sort: sort === "recent" || sort === "fit" ? sort : "name" }))
            }
            count={selected.length}
            total={records.length}
            onClear={() => setFilters((current) => ({ ...EMPTY_FILTERS, sort: current.sort }))}
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
                  Clear Filters
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
