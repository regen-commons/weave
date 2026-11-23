import { useEffect, useMemo, useRef, useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import type { FixtureContext } from "../fixtures.ts";
import { fundingFixture, teamFixture } from "../fixtures.ts";
import { catalogEntries, researchSnapshotDate } from "../funding/catalog.ts";
import { lastChoiceWins } from "../funding/change.ts";
import { applyFundingFacet, fundingFacets, fundingSorts, fundingVocabulary } from "../funding/facets.ts";
import {
  emptyFundingFilters,
  filterFunding,
  fundingOrder,
  readBrowsing,
  readFundingFilters,
  writeBrowsing,
  writeFundingFilters,
  type FundingFilters as Filters,
} from "../funding/select.ts";
import { fundingSubject, NO_INITIATIVE, subjectLine, subjectOptions } from "../funding/subject.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { useListedDrafts, useOpenDraft } from "../initiative/use-drafts.ts";
import { useSocial } from "../social/context.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { ListEnd, ListEndHold, useAddedFocus } from "../ui/ListEnd.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";
import { OpportunityCard } from "../ui/OpportunityCard.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { FundingProfile } from "../ui/FundingProfile.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { RadioMenu } from "../ui/RadioMenu.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { fullDate } from "../home.ts";
import { replaceRouteQuietly, routePath, routeSearch } from "../router.tsx";
import { DescribePrompt } from "../ui/DescribePrompt.tsx";
import { SuggestFund } from "../funding/SuggestFund.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { FUNDING_COMMONS } from "../links.ts";
/** How many cards the list holds at first, and how many each further batch adds. */
const BATCH = 24;
/** What the list counts: each program, and each funder whose programs are not researched yet. */
const THINGS = "funds";

export function Funding({ fixture }: { fixture?: FixtureContext }) {
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  // Someone with an initiative can still browse without one, and then nothing is ranked (DL-129).
  const [browsing, setBrowsing] = useState(() => readBrowsing(routeSearch()));
  const catalog = useCatalog(example, undefined, { compare: !browsing });
  // The fit is for one initiative, the one this tab is on. A browser can hold several (DL-112), so
  // the page names it above the list and offers the others to compare with instead (DL-118).
  const { draft } = useDraft();
  const subject = fundingSubject(draft, useListedDrafts());
  const comparing = catalog.subjectKnown ? subjectLine(subject, browsing) : null;
  const subjectChoices = subjectOptions(subject);
  const openInTab = useOpenDraft();
  const social = useSocial();
  // The initiative last picked in Change Initiative, while it opens. The menu marks it at once, as the
  // Kind of group filter on Initiatives marks its choice before the list arrives.
  const [chosen, setChosen] = useState<string | null>(null);
  const [changeProblem, setChangeProblem] = useState("");
  const latest = useRef({ openInTab, social });
  useEffect(() => {
    latest.current = { openInTab, social };
  });
  // Each arrow press in the menu is a choice. One opening runs at a time and the last choice wins, so
  // the page ends on the initiative reached. A refusal leaves the page on the one it was on.
  const [compareWith] = useState(() =>
    lastChoiceWins(
      (id) => latest.current.openInTab(id),
      ({ problem }) => {
        if (problem) setChangeProblem(problem instanceof Error ? problem.message : "That initiative did not open. Try again.");
        else latest.current.social?.refresh();
        setChosen(null);
      },
    ),
  );
  function choose(id: string) {
    setChangeProblem("");
    setBrowsing(id === NO_INITIATIVE);
    if (id === NO_INITIATIVE || id === subject.current?.id) return;
    setChosen(id);
    compareWith(id);
  }
  const [filters, setFilters] = useState<Filters>(() => readFundingFilters(routeSearch()));
  const [limit, setLimit] = useState(BATCH),
    [retried, setRetried] = useState(false);
  const state = fixture?.state;
  const loading = catalog.loading || (state === "loading" && !retried),
    failed =
      catalog.error ||
      (state === "error" && !retried ? "The catalog did not load. Your choices are still here." : "");
  const entries = useMemo(() => (catalog.bundle ? catalogEntries(catalog.bundle) : []), [catalog.bundle]);
  const researchDate = useMemo(
    () => (catalog.bundle ? researchSnapshotDate(catalog.bundle.catalog) : null),
    [catalog.bundle],
  );
  const vocabulary = useMemo(() => fundingVocabulary(entries), [entries]);
  // Ranking needs a card to compare with; without one its group and its sort order mean nothing.
  const personalized = !!catalog.results;
  const visibleFilters = {
    ...filters,
    group: personalized ? filters.group : "",
    sort: fundingOrder(filters.sort, personalized),
  };
  const selected = useMemo(
    () => filterFunding(entries, visibleFilters, catalog.results),
    [entries, filters, catalog.results],
  );
  const results = new Map(catalog.results?.map((result) => [result.documentId, result]));
  useEffect(() => setLimit(BATCH), [filters]);
  const added = useAddedFocus(Math.min(limit, selected.length));
  useEffect(() => {
    const params = new URLSearchParams(routeSearch());
    writeFundingFilters(filters, params);
    writeBrowsing(browsing, params);
    const query = params.toString();
    replaceRouteQuietly(`${routePath()}${query ? `?${query}` : ""}`);
  }, [filters, browsing]);
  // How many funds, and when their sources were checked: as short as the Initiatives page's line.
  const summary = selected.length === entries.length ? `${entries.length} funds.` : `${selected.length} of ${entries.length} funds.`;
  const note = !catalog.bundle
    ? undefined
    : catalog.ranking
      ? "Comparing on this device."
      : researchDate
        ? `Checked on ${fullDate(researchDate)}.`
        : "Source check date unknown.";
  const prompt = (
    <DescribePrompt>
      Until then, fit is not shown or sorted on. Check eligibility with the funder before applying.
    </DescribePrompt>
  );
  return (
    <ListLayout>
      <Heading level={1} size="page">
        Funding
      </Heading>
      <p className="rc-prose">Find support for your next chapter.</p>
      {(state === "offline" || !navigator.onLine) && (
        <p className="rc-notice" data-tone="info">
          You are offline. Showing the catalog bundled with this app; the funder's page needs a connection.
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
              Try Again
            </button>
          </div>
        </section>
      )}
      {!loading && !entries.length ? (
        <EmptyState
          title="No funding records available"
          action={
            <ButtonLink variant="secondary" href={FUNDING_COMMONS}>
              Browse Current Funding
            </ButtonLink>
          }
        >
          Your initiative is still on this device. Try again or browse the current directory.
        </EmptyState>
      ) : (
        <>
          {/* The bar is here from the first paint, so the list arrives under it and nothing jumps. */}
          <FilterBar
            noun="funding"
            things={THINGS}
            search={visibleFilters.search}
            onSearch={(search) => setFilters((current) => ({ ...current, search }))}
            facets={fundingFacets(vocabulary, visibleFilters, personalized)}
            onFacet={(key, chosen) => setFilters((current) => applyFundingFacet(current, key, chosen))}
            sort={{ value: visibleFilters.sort, options: fundingSorts(personalized), defaultValue: fundingOrder("", personalized) }}
            onSort={(sort) => setFilters((current) => ({ ...current, sort }))}
            count={selected.length}
            total={entries.length}
            summary={summary}
            note={note}
            loading={loading}
            reserve="Checked on 00 November 0000."
            onClear={() => setFilters(emptyFundingFilters)}
          />
          {/* Which initiative the fit is for, said right above the cards it orders. The menu changes to
              another initiative at once, and the details at the foot of the page follow, or to No
              initiative, for browsing without fit (DL-129). */}
          {comparing && (
            <StatusLine
              actions={
                subjectChoices.length > 0 && (
                  <RadioMenu
                    label={subject.current && !browsing ? "Change Initiative" : "Choose Initiative"}
                    legend="Show what fits"
                    size="sm"
                    align="end"
                    options={subjectChoices}
                    value={browsing ? NO_INITIATIVE : (chosen ?? subject.current?.id)}
                    onChange={choose}
                  />
                )
              }
            >
              {comparing.before}
              {comparing.name && <strong>{comparing.name}</strong>}
              {comparing.after}
            </StatusLine>
          )}
          {changeProblem && (
            <p className="rc-notice" data-tone="warning" role="alert">
              {changeProblem}
            </p>
          )}
          {/* The prompt depends on the card, not on the catalog, so it is there from the first paint.
              Until the device draft opens its room is held, unseen, so the list does not move (DL-104). */}
          {!catalog.subjectKnown ? (
            <div className="rc-skeleton" data-shape="room" aria-hidden="true">
              {prompt}
            </div>
          ) : (
            !catalog.personalized && prompt
          )}
          {loading ? (
            // As many shapes as the first batch holds, and the list end's room under them (DL-108).
            <>
              <CardGridSkeleton kind="funding" count={BATCH} />
              <ListEndHold things={THINGS} />
            </>
          ) : selected.length ? (
            <>
              <CardGrid>
                {selected.slice(0, limit).map((entry, index) => (
                  <li key={entry.id} {...added.item(index)}>
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
              {/* The list fills in as its end comes near; a new search or filter starts its run again (DL-101).
                  Every list with cards has its end, so its room does not come and go (DL-108). */}
              <ListEnd
                key={JSON.stringify(visibleFilters)}
                shown={Math.min(limit, selected.length)}
                total={selected.length}
                things={THINGS}
                more={selected.length > limit}
                onPress={added.pressed}
                onMore={() => setLimit((value) => value + BATCH)}
              />
            </>
          ) : (
            <EmptyState
              title="Nothing matches these filters"
              action={
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setFilters(emptyFundingFilters)}
                >
                  Clear Filters
                </button>
              }
            >
              Try fewer filters or another search.
            </EmptyState>
          )}
          {import.meta.env.DEV && example && !loading && <SuggestFund />}
        </>
      )}
      {!browsing && <FundingProfile />}
    </ListLayout>
  );
}
