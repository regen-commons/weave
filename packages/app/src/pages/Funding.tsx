import { useEffect, useMemo, useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { fundingFixture, teamFixture } from "../fixtures.ts";
import { catalogEntries, fundingSearch } from "../funding/catalog.ts";
import { emptyFundingFilters, filterFunding, type FundingFilters as Filters } from "../funding/select.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { CardGrid } from "../ui/Card.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";
import { OpportunityCard } from "../ui/OpportunityCard.tsx";
import { FundingFilters } from "../ui/FundingFilters.tsx";
import { FundingProfile } from "../ui/FundingProfile.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { fullDate } from "../home.ts";
export function Funding({ fixture }: { fixture?: FixtureContext }) {
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  const catalog = useCatalog(example);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFundingFilters,
    search: new URLSearchParams(location.search).get("q") ?? "",
    ...Object.fromEntries([...fundingSearch(location.search)].filter(([key]) => key !== "q")),
  }));
  const [limit, setLimit] = useState(24),
    [retried, setRetried] = useState(false);
  const state = fixture?.state;
  const loading = catalog.loading || (state === "loading" && !retried),
    failed =
      catalog.error ||
      (state === "error" && !retried ? "The example catalog did not load. Your choices are still here." : "");
  const entries = useMemo(() => (catalog.bundle ? catalogEntries(catalog.bundle) : []), [catalog.bundle]);
  const visibleFilters = catalog.results
    ? filters
    : { ...filters, group: "", sort: filters.sort === "fit" ? "closing" : filters.sort };
  const selected = useMemo(
    () => filterFunding(entries, visibleFilters, catalog.results),
    [entries, filters, catalog.results],
  );
  const results = new Map(catalog.results?.map((result) => [result.documentId, result]));
  useEffect(() => setLimit(24), [filters]);
  useEffect(() => {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(filters)) {
      const name = key === "search" ? "q" : key;
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(null, "", url.pathname + url.search);
  }, [filters]);
  return (
    <ListLayout>
      <Heading level={1} size="page">
        Funding
      </Heading>
      {!catalog.personalized && (
        <section className="rc-notice" data-tone="info">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">Describe your initiative to see what fits</h2>
            <p>Browse the full catalog without ranking. Check eligibility with the funder before applying.</p>
            <ButtonLink href="/start/initiative" variant="primary">
              Describe your initiative
            </ButtonLink>
          </div>
        </section>
      )}
      {import.meta.env.DEV && example && (
        <p className="rc-notice" data-tone="info">
          Fictional funding examples. Terms, counts and team requirements are invented.
        </p>
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
          {import.meta.env.DEV && example && (
            <button className="rc-button" data-variant="secondary" onClick={() => setRetried(true)}>
              Show examples
            </button>
          )}
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
          <FundingFilters
            filters={visibleFilters}
            onChange={setFilters}
            count={selected.length}
            total={entries.length}
            personalized={!!catalog.results}
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
                          ? `${teamFixture(null).length} example partner asks; ${teamFixture(null).filter((ask) => ask.candidates.length).length} could come from the list`
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
        </>
      )}
      <FundingProfile />
    </ListLayout>
  );
}
