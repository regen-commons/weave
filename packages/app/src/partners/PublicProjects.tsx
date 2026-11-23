import { useEffect, useRef, useState } from "react";
import { fullDate } from "../home.ts";
import { Link, replaceRouteQuietly, routePath, routeSearch } from "../router.tsx";
import { Card, CardGrid } from "../ui/Card.tsx";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { FilterBar } from "../ui/FilterBar.tsx";
import { keepFocusOnPage } from "../ui/focus.ts";
import { ListEnd, ListEndHold, useAddedFocus } from "../ui/ListEnd.tsx";
import { Icon } from "../ui/Icon.tsx";
import { PartnerDiscovery } from "./PartnerDiscovery.tsx";
import { projectAddress, rememberProject } from "./public-project.ts";
import { MatchingDate } from "./SharingReview.tsx";
import {
  askedFor, chosenOrganizationType, chosenSort, chosenWorkScope, countLine, emptyList, filtersChosen, firstPage, indexLine,
  nextPage, ORGANIZATION_TYPE_KEY, isPublicProjectSort, organizationTypeFacets, PUBLIC_PROJECT_SORT_OPTIONS, sameAsk, SORT_KEY,
  type PublicProjectSort, PUBLIC_PROJECT_PAGE_SIZE, PUBLIC_PROJECT_QUERY_MAX, publicProjectsPath, requestPublicProjects,
  expectsStarter, listView, rememberIndex, searchNow, searchQuery, SEARCH_PAUSE_MS, sharedByLine, WORK_SCOPE_KEY, workScopeFacets,
  type PublicProjectCard as Project, type PublicProjectList,
} from "./public-projects.ts";

const day = (iso: string) => fullDate(new Date(iso).toISOString().slice(0, 10));

/**
 * One listed public Certified project: its name, who shared it and where, its own words, when it was
 * shared and where it comes from. The card opens the project at its Weave address from its name, so it
 * has the one target every card in a list has: over the list inside the app, and as its own page from a
 * link (22 November 2026). The card is kept in memory as it opens, so the project shows at once. A
 * project with no Weave address keeps its name unlinked.
 */
export function PublicProjectCard({ project, level }: { project: Project; level: 2 | 3 }) {
  const Title = level === 3 ? "h3" : "h2";
  const line = sharedByLine(project);
  const address = projectAddress(project.uri);
  return (
    <Card kind="initiative" rows="fixed">
      <Title className="rc-card-title">
        {address ? <Link href={address} onClick={() => rememberProject(project)}>{project.name}</Link> : project.name}
      </Title>
      {/* Who shared it and where keep one line on every card, so cards are one height (DL-108). It is
          empty where the project names neither, and a line cut at its end is whole one hover away.
          The place is the publisher's own label, shown as it is. */}
      <p className="rc-card-meta" title={line || undefined}>
        {project.publisher && (
          <>
            <span className="rc-visually-hidden">Shared by </span>
            {project.publisher}
          </>
        )}
        {project.place && (
          <>
            <Icon name="place" size="sm" />
            <span className="rc-visually-hidden">{project.publisher ? ". Place: " : "Place: "}</span>
            {project.place}
          </>
        )}
      </p>
      <p className="rc-card-summary">{project.passages.join(" ")}</p>
      <p className="rc-meta">Source: Certified, checked on <MatchingDate value={project.checkedAt} />.</p>
      <p className="rc-time">
        <Icon name="clock" size="sm" />
        Shared <MatchingDate value={project.sharedAt} />
      </p>
    </Card>
  );
}

/**
 * The first page for a search, kind of group, kind of work and order, then further pages on request.
 * `enabled: false` reads nothing.
 */
export function usePublicProjects(q: string, { limit, enabled = true, organizationType, workScope, sort = "newest" }: {
  limit?: number; enabled?: boolean; organizationType?: string; workScope?: string; sort?: PublicProjectSort;
} = {}) {
  const choice = { organizationType: organizationType ?? null, workScope: workScope ?? null, sort };
  const asked = askedFor(q, choice);
  const [list, setList] = useState<PublicProjectList>({ status: enabled ? "loading" : "failed", ...asked });
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setList({ status: "loading", ...asked });
    requestPublicProjects(publicProjectsPath(q, { ...choice, limit }), controller.signal)
      .then((page) => { if (!controller.signal.aborted) setList(firstPage(q, page, choice)); })
      .catch(() => { if (!controller.signal.aborted) setList({ status: "failed", ...asked }); });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [q, organizationType, workScope, sort, limit, enabled, attempt]);
  function more() {
    if (list.status !== "ready" || !list.page.next || list.more === "loading") return;
    const controller = pending.current = new AbortController();
    setList({ ...list, more: "loading" });
    requestPublicProjects(publicProjectsPath(q, { ...choice, cursor: list.page.next, limit }), controller.signal)
      .then((page) => {
        if (!controller.signal.aborted)
          setList((latest) => sameAsk(latest, asked) ? nextPage(latest, page) : latest);
      })
      .catch(() => {
        if (!controller.signal.aborted) setList((latest) => latest.status === "ready" ? { ...latest, more: "failed" } : latest);
      });
  }
  return { list, more, retry: () => setAttempt((count) => count + 1) };
}

/** This browser's storage, or none where it is refused. */
function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The words typed, once typing has paused, so a search asks the list once. */
function usePaused(value: string, ms: number): string {
  const [paused, setPaused] = useState(value);
  useEffect(() => {
    if (value === paused) return;
    const timer = window.setTimeout(() => setPaused(value), value === "" ? 0 : ms);
    return () => window.clearTimeout(timer);
  }, [value, paused, ms]);
  return searchNow(value, paused);
}

/**
 * The Initiatives page body: every listed public Certified project, newest first, with search and more
 * pages. An empty index, or one that does not answer, shows the starter list of public sources instead.
 * Both lists sit under the same filter bar, and the list follows the search as it is typed (DL-081).
 */
export function PublicProjects() {
  // The search lives in the page and is written into its address quietly, as Funding's filters are,
  // so searching keeps focus and scroll where they are.
  const [search, setSearch] = useState(() => searchQuery(new URLSearchParams(routeSearch()).get("q") ?? ""));
  const [organizationType, setOrganizationType] = useState(() => chosenOrganizationType(routeSearch()));
  const [workScope, setWorkScope] = useState(() => chosenWorkScope(routeSearch()));
  const [sort, setSort] = useState<PublicProjectSort>(() => chosenSort(routeSearch()));
  const q = usePaused(searchQuery(search), SEARCH_PAUSE_MS);
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (organizationType) params.set(ORGANIZATION_TYPE_KEY, organizationType);
    if (workScope) params.set(WORK_SCOPE_KEY, workScope);
    if (sort !== "newest") params.set(SORT_KEY, sort);
    const query = params.toString();
    replaceRouteQuietly(query ? `${routePath()}?${query}` : routePath());
  }, [q, organizationType, workScope, sort]);
  const { list, more, retry } = usePublicProjects(q, {
    organizationType: organizationType ?? undefined, workScope: workScope ?? undefined, sort,
  });
  // Whether a page has shown the list is switched on, so later searches keep the index while they load.
  const [indexSeen, setIndexSeen] = useState(false);
  // The last list that arrived stays on screen while the next search loads, so the cards do not blink.
  const [arrived, setArrived] = useState<Extract<PublicProjectList, { status: "ready" }> | null>(null);
  // What the list said last time decides the first shape: the starter list at once where it was off.
  const [expectStarter] = useState(() => expectsStarter(deviceStorage()));
  useEffect(() => {
    if (list.status !== "ready") return;
    setArrived(list);
    rememberIndex(deviceStorage(), list.page);
    if (list.page.index.status !== "off") setIndexSeen(true);
  }, [list]);
  const view = listView(list, indexSeen, expectStarter);
  const ready = list.status === "ready" ? list : arrived;
  const waiting = list.status === "loading";
  const filters = ready ? filtersChosen(ready) : 0;
  const empty = emptyList(!!ready && ready.q !== "", filters);
  // Focus moves to the first project a press of Show More added, so a keyboard user keeps their place.
  const shown = list.status === "ready" ? list.projects.length : 0;
  const added = useAddedFocus(shown);

  function clear() {
    setSearch("");
    setOrganizationType(null);
    setWorkScope(null);
    setSort("newest");
    keepFocusOnPage();
  }
  // A list from before a filter refuses it, and a filter can come from a shared address. Trying again
  // without the filters is what can succeed, so they go; with none, the same request is sent again.
  function tryAgain() {
    if (organizationType || workScope) {
      setOrganizationType(null);
      setWorkScope(null);
    } else retry();
  }
  // The kinds on offer are the whole list's, whatever the search, so the menus stay put while a person types.
  const facets = [
    ...workScopeFacets(ready ? ready.page.index.workScopes : "waiting", workScope),
    ...organizationTypeFacets(ready ? ready.page.index.organizationTypes : "waiting", organizationType),
  ];
  const bar = (loading: boolean) => (
    <FilterBar
      noun="initiatives"
      search={search}
      onSearch={setSearch}
      maxLength={PUBLIC_PROJECT_QUERY_MAX}
      facets={facets}
      onFacet={(key, chosen) => (key === WORK_SCOPE_KEY ? setWorkScope : setOrganizationType)(chosen[0] || null)}
      // Newest first, oldest first or by name, read from the server, since the list comes a page at a time.
      sort={{ value: sort, options: PUBLIC_PROJECT_SORT_OPTIONS }}
      onSort={(value) => setSort(isPublicProjectSort(value) ? value : "newest")}
      // The list comes a page at a time, so the sheet's Show button counts every match, not the cards loaded.
      count={ready?.page.index.total ?? 0}
      total={ready?.page.index.total ?? 0}
      summary={ready ? countLine(ready.page.index.total, ready.q !== "", filters) : undefined}
      note={ready ? indexLine(ready.page.index, day) : undefined}
      loading={loading}
      reserve="Checked on 00 November 0000."
      onClear={clear}
    />
  );

  if (view === "loading") {
    return (
      <div className="rc-stack" aria-busy="true">
        {bar(true)}
        <CardGridSkeleton kind="project" count={PUBLIC_PROJECT_PAGE_SIZE} />
        <ListEndHold things="projects" />
      </div>
    );
  }
  if (view === "starter") {
    return (
      <div className="rc-stack">
        {list.status === "failed" && (
          <section className="rc-notice" data-tone="warning">
            <div className="rc-notice-body">
              <h2 className="rc-notice-title">Projects from Certified did not load</h2>
              <button className="rc-button" data-variant="secondary" type="button" onClick={tryAgain}>Try Again</button>
            </div>
          </section>
        )}
        <PartnerDiscovery mode="browse" search={search} onSearch={setSearch} />
      </div>
    );
  }
  return (
    <div className="rc-stack" aria-busy={waiting || undefined}>
      {bar(!ready)}
      {!ready ? (
        <>
          <CardGridSkeleton kind="project" count={PUBLIC_PROJECT_PAGE_SIZE} />
          <ListEndHold things="projects" />
        </>
      ) : (
        <>
          {ready.projects.length ? (
            <CardGrid>
              {ready.projects.map((project, index) => (
                <li key={project.uri} {...added.item(index)}>
                  <PublicProjectCard project={project} level={2} />
                </li>
              ))}
            </CardGrid>
          ) : (
            <EmptyState
              title={empty.title}
              action={
                <button className="rc-button" data-variant="secondary" type="button" onClick={clear}>{empty.action}</button>
              }
            >
              {empty.body}
            </EmptyState>
          )}
          {/* The list fills in as its end comes near, and a new search starts its run again (DL-101). Every
              list with cards has its end, and keeps its room while a search loads (DL-108). */}
          {list.status !== "ready" && ready.projects.length > 0 && <ListEndHold things="projects" />}
          {list.status === "ready" && list.projects.length > 0 && (
            <ListEnd
              key={`${list.q} ${list.organizationType ?? ""} ${list.workScope ?? ""} ${list.sort ?? ""}`}
              shown={list.projects.length}
              total={Math.max(list.page.index.total, list.projects.length)}
              things="projects"
              more={!!list.page.next}
              busy={list.more === "loading"}
              failed={list.more === "failed"}
              onPress={added.pressed}
              onMore={more}
            />
          )}
        </>
      )}
    </div>
  );
}
