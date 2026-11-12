import { useEffect, useMemo, useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { fundingFixture, teamFixture } from "../fixtures.ts";
import { catalogEntries } from "../funding/catalog.ts";
import { applyFundingFacet, fundingFacets, fundingSorts, fundingVocabulary } from "../funding/facets.ts";
import {
  emptyFundingFilters,
  filterFunding,
  readFundingFilters,
  writeFundingFilters,
  type FundingFilters as Filters,
} from "../funding/select.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { CardGrid } from "../ui/Card.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";
import { OpportunityCard } from "../ui/OpportunityCard.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { FundingProfile } from "../ui/FundingProfile.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { fullDate } from "../home.ts";
import { replaceRouteQuietly, routePath, routeSearch } from "../router.tsx";
import { DescribePrompt } from "../ui/DescribePrompt.tsx";
import { SuggestFund } from "../funding/SuggestFund.tsx";
export function Funding({ fixture }: { fixture?: FixtureContext }) {
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  const catalog = useCatalog(example);
  const [filters, setFilters] = useState<Filters>(() => readFundingFilters(routeSearch()));
  const [limit, setLimit] = useState(24),
    [retried, setRetried] = useState(false);
  const state = fixture?.state;
  const loading = catalog.loading || (state === "loading" && !retried),
    failed =
      catalog.error ||
      (state === "error" && !retried ? "The catalog did not load. Your choices are still here." : "");
  const entries = useMemo(() => (catalog.bundle ? catalogEntries(catalog.bundle) : []), [catalog.bundle]);
  const vocabulary = useMemo(() => fundingVocabulary(entries), [entries]);
  // Ranking needs a card to compare with; without one its group and its sort order mean nothing.
  const personalized = !!catalog.results;
  const visibleFilters = personalized
    ? filters
    : { ...filters, group: "", sort: filters.sort === "fit" ? "closing" : filters.sort };
  const selected = useMemo(
    () => filterFunding(entries, visibleFilters, catalog.results),
    [entries, filters, catalog.results],
  );
  const results = new Map(catalog.results?.map((result) => [result.documentId, result]));
  useEffect(() => setLimit(24), [filters]);
  useEffect(() => {
    const params = new URLSearchParams(routeSearch());
    writeFundingFilters(filters, params);
    const query = params.toString();
    replaceRouteQuietly(`${routePath()}${query ? `?${query}` : ""}`);
  }, [filters]);
  return (
    <ListLayout>
      <Heading level={1} size="page">
        Funding
      </Heading>
      {!catalog.personalized && (
        <DescribePrompt>
          For now every fund is listed without ranking. Check eligibility with the funder before applying.
        </DescribePrompt>
      )}
      {(state === "offline" || !navigator.onLine) && (
        <p className="rc-notice" data-tone="info">
          You are offline. Showing the catalog bundled with this app; the funder's page needs a connection.
        </p>
      )}
      {catalog.bundle && (
        <p className="rc-meta">
          {catalog.bundle.catalog.funds.length} funders, {entries.length} program and overview records.
          Research snapshot {fullDate(catalog.bundle.catalog.researchCheckedOn)}. Keyword matching runs on
          this device; no model download.
        </p>
      )}
      {catalog.bundle?.conditions === null && (
        <p className="rc-notice" data-tone="warning">
          Eligibility screening data is unavailable. Research priority is provisional; check every requirement
          manually.
        </p>
      )}
      {failed && (
        <section className="rc-notice" data-tone="warning" role="alert">
          <div className="rc-notice-body">
            <p>{failed}</p>
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => {
                setRetried(true);
                catalog.retry();
              }}
            >
              Try again
            </button>
          </div>
        </section>
      )}
      {loading ? (
        <section className="rc-stack" aria-busy="true">
          <p role="status">Opening the funding catalog</p>
          <div className="rc-skeleton" />
          <div className="rc-skeleton" />
        </section>
      ) : !entries.length ? (
        <EmptyState
          title="No funding records available"
          action={
            <a className="rc-button" data-variant="secondary" href="https://funding-commons.vercel.app/">
              Browse current funding
            </a>
          }
        >
          Your initiative is still on this device. Try again or browse the current directory.
        </EmptyState>
      ) : (
        <>
          {catalog.ranking && <p role="status">Comparing your card with the catalog on this device</p>}
          <FilterBar
            noun="funding"
            things="programs and overview records"
            search={visibleFilters.search}
            onSearch={(search) => setFilters((current) => ({ ...current, search }))}
            facets={fundingFacets(vocabulary, visibleFilters, personalized)}
            onFacet={(key, chosen) => setFilters((current) => applyFundingFacet(current, key, chosen))}
            sort={{ value: visibleFilters.sort, options: fundingSorts(personalized) }}
            onSort={(sort) => setFilters((current) => ({ ...current, sort }))}
            count={selected.length}
            total={entries.length}
            onClear={() => setFilters((current) => ({ ...emptyFundingFilters, sort: current.sort }))}
          />
          {selected.length ? (
            <>
              <CardGrid>
                {selected.slice(0, limit).map((entry) => (
                  <li key={entry.id}>
                    <OpportunityCard
                      entry={entry}
                      result={results.get(entry.id)}
                      teamLine={
                        import.meta.env.DEV && example
                          ? `${teamFixture(null).length} partner asks, ${teamFixture(null).filter((ask) => ask.candidates.length).length} that people on the list could fill`
                          : undefined
                      }
                    />
                  </li>
                ))}
              </CardGrid>
              {selected.length > limit && (
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setLimit((value) => value + 24)}
                >
                  Show more funding
                </button>
              )}
            </>
          ) : (
            <EmptyState
              title="Nothing matches these filters"
              action={
                <button
                  className="rc-button"
                  data-variant="secondary"
                  onClick={() => setFilters(emptyFundingFilters)}
                >
                  Clear filters
                </button>
              }
            >
              Try fewer filters or another search.
            </EmptyState>
          )}
          {import.meta.env.DEV && example && <SuggestFund />}
        </>
      )}
      <FundingProfile />
    </ListLayout>
  );
}
