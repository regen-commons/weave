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
import { MatchingDate } from "./SharingReview.tsx";
import {
  countLine, firstPage, indexLine, nextPage, PUBLIC_PROJECT_PAGE_SIZE, PUBLIC_PROJECT_QUERY_MAX, publicProjectsPath, requestPublicProjects,
  expectsStarter, listView, rememberIndex, searchQuery, SEARCH_PAUSE_MS, type PublicProjectCard as Project, type PublicProjectList,
} from "./public-projects.ts";

const day = (iso: string) => fullDate(new Date(iso).toISOString().slice(0, 10));

/**
 * One listed public Certified project: its name, its own words, when it was shared and where it comes
 * from. The card opens the project's public record from its name, in a new tab, so it has the one
 * target every card in a list has.
 */
export function PublicProjectCard({ project, level }: { project: Project; level: 2 | 3 }) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <Card kind="initiative" rows="fixed">
      <Title className="rc-card-title">
        <Link href={project.sourceUrl}>{project.name}</Link>
      </Title>
      <p className="rc-card-summary">{project.passages.join(" ")}</p>
      <p className="rc-meta">Source: Certified, checked on <MatchingDate value={project.checkedAt} />.</p>
      <p className="rc-time">
        <Icon name="clock" size="sm" />
        Shared <MatchingDate value={project.sharedAt} />
      </p>
    </Card>
  );
}

/** The first page for a search, then further pages on request. `enabled: false` reads nothing. */
export function usePublicProjects(q: string, limit?: number, enabled = true) {
  const [list, setList] = useState<PublicProjectList>({ status: enabled ? "loading" : "failed", q });
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setList({ status: "loading", q });
    requestPublicProjects(publicProjectsPath(q, null, limit), controller.signal)
      .then((page) => { if (!controller.signal.aborted) setList(firstPage(q, page)); })
      .catch(() => { if (!controller.signal.aborted) setList({ status: "failed", q }); });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [q, limit, enabled, attempt]);
  function more() {
    if (list.status !== "ready" || !list.page.next || list.more === "loading") return;
    const controller = pending.current = new AbortController();
    setList({ ...list, more: "loading" });
    requestPublicProjects(publicProjectsPath(q, list.page.next, limit), controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setList((latest) => latest.q === q ? nextPage(latest, page) : latest);
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
    const timer = window.setTimeout(() => setPaused(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, paused, ms]);
  return paused;
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
  const q = usePaused(searchQuery(search), SEARCH_PAUSE_MS);
  useEffect(() => {
    replaceRouteQuietly(q ? `${routePath()}?${new URLSearchParams({ q })}` : routePath());
  }, [q]);
  const { list, more, retry } = usePublicProjects(q);
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
  // Focus moves to the first project a press of Show More added, so a keyboard user keeps their place.
  const shown = list.status === "ready" ? list.projects.length : 0;
  const added = useAddedFocus(shown);

  function clear() {
    setSearch("");
    keepFocusOnPage();
  }
  const bar = (loading: boolean) => (
    <FilterBar
      noun="initiatives"
      search={search}
      onSearch={setSearch}
      maxLength={PUBLIC_PROJECT_QUERY_MAX}
      facets={[]}
      onFacet={() => {}}
      count={ready?.projects.length ?? 0}
      total={ready?.page.index.total ?? 0}
      summary={ready ? countLine(ready.page.index.total, ready.q !== "") : undefined}
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
              <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>Try Again</button>
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
              title="No projects match your search"
              action={
                <button className="rc-button" data-variant="secondary" type="button" onClick={clear}>Clear Search</button>
              }
            >
              Try other words, or clear the search to see every project.
            </EmptyState>
          )}
          {/* The list fills in as its end comes near, and a new search starts its run again (DL-101). Every
              list with cards has its end, and keeps its room while a search loads (DL-108). */}
          {list.status !== "ready" && ready.projects.length > 0 && <ListEndHold things="projects" />}
          {list.status === "ready" && list.projects.length > 0 && (
            <ListEnd
              key={list.q}
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
