import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { fullDate } from "../home.ts";
import { replaceRouteQuietly, routePath, routeSearch } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { Card, CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Icon } from "../ui/Icon.tsx";
import { SourceLink } from "./NetworkResults.tsx";
import { PartnerDiscovery } from "./PartnerDiscovery.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import {
  countLine, firstPage, indexLine, nextPage, PUBLIC_PROJECT_QUERY_MAX, publicProjectsPath, requestPublicProjects,
  showsIndex, type PublicProjectCard as Project, type PublicProjectList,
} from "./public-projects.ts";

const day = (iso: string) => fullDate(new Date(iso).toISOString().slice(0, 10));

/**
 * One listed public Certified project: its name, its own words, when it was shared and where it comes
 * from. The name is plain text, as on other public results, so opening the source stays one target.
 */
export function PublicProjectCard({ project, level }: { project: Project; level: 2 | 3 }) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <Card kind="initiative">
      <Title className="rc-card-title">{project.name}</Title>
      <p className="rc-card-summary">{project.passages.join(" ")}</p>
      <p className="rc-time">
        <Icon name="clock" size="sm" />
        Shared <MatchingDate value={project.sharedAt} />
      </p>
      <p className="rc-meta">Source: Certified, checked on <MatchingDate value={project.checkedAt} />.</p>
      <div className="rc-action-bar">
        <SourceLink href={project.sourceUrl} name={project.name} />
      </div>
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

/**
 * The Initiatives page body: every listed public Certified project, newest first, with search and more
 * pages. An empty index, or one that does not answer, shows the starter list of public sources instead.
 */
export function PublicProjects() {
  const id = useId();
  // The search lives in the page and is written into its address quietly, as Funding's filters are,
  // so searching keeps focus and scroll where they are.
  const [q, setQ] = useState(() => (new URLSearchParams(routeSearch()).get("q") ?? "").trim().slice(0, PUBLIC_PROJECT_QUERY_MAX));
  const [search, setSearch] = useState(q);
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    replaceRouteQuietly(q ? `${routePath()}?${new URLSearchParams({ q })}` : routePath());
  }, [q]);
  const { list, more, retry } = usePublicProjects(q);
  // Focus moves to the first project "Show more" added, so a keyboard user keeps their place.
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const added = useRef<HTMLLIElement | null>(null);
  const shown = list.status === "ready" ? list.projects.length : 0;
  useEffect(() => {
    if (focusAt === null || shown <= focusAt) return;
    added.current?.focus();
    setFocusAt(null);
  }, [shown, focusAt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQ(search.trim().replace(/\s+/gu, " "));
  }
  function clear() {
    setSearch("");
    setQ("");
    field.current?.focus();
  }
  function showMore() {
    if (list.status !== "ready" || list.more === "loading") return;
    setFocusAt(list.projects.length);
    more();
  }

  if (!showsIndex(list)) {
    return (
      <div className="rc-stack">
        {list.status === "failed" && (
          <section className="rc-notice" data-tone="warning">
            <div className="rc-notice-body">
              <h2 className="rc-notice-title">Projects from Certified did not load</h2>
              <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>Try again</button>
            </div>
          </section>
        )}
        <PartnerDiscovery mode="browse" />
      </div>
    );
  }
  return (
    <div className="rc-stack">
      <p className="rc-prose">Projects shared publicly on Certified. Weave checks them every day.</p>
      <form className="rc-field" role="search" onSubmit={submit} action={pathTo("initiatives")}>
        <label htmlFor={`${id}-search`}>Search projects</label>
        <div className="rc-search rc-inline-field">
          <input className="rc-input" type="search" id={`${id}-search`} name="q" maxLength={PUBLIC_PROJECT_QUERY_MAX}
            ref={field} value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rc-button" data-variant="secondary" type="submit">Search</button>
        </div>
      </form>
      <p className="rc-meta">
        <span role="status">{list.status === "ready" ? countLine(list.page.index.total, q !== "") : "Loading projects"}</span>
        {list.status === "ready" && ` ${indexLine(list.page.index, day)}`}
      </p>
      {list.status !== "ready" ? (
        <div className="rc-stack" aria-busy="true">
          <div className="rc-skeleton" />
          <div className="rc-skeleton" />
        </div>
      ) : (
        <>
          {list.projects.length ? (
            <CardGrid>
              {list.projects.map((project, index) => (
                <li key={project.uri} tabIndex={-1} ref={index === focusAt ? added : undefined}>
                  <PublicProjectCard project={project} level={2} />
                </li>
              ))}
            </CardGrid>
          ) : (
            <EmptyState
              title="No projects match your search"
              action={
                <button className="rc-button" data-variant="secondary" type="button" onClick={clear}>Clear search</button>
              }
            >
              Try other words, or clear the search to see every project.
            </EmptyState>
          )}
          {list.page.next && (
            <div className="rc-action-bar">
              {/* aria-disabled, not disabled, so the button keeps keyboard focus while the next page loads. */}
              <button className="rc-button" data-variant="secondary" type="button" aria-disabled={list.more === "loading"}
                onClick={showMore}>{list.more === "loading" ? "Loading more projects" : "Show more projects"}</button>
            </div>
          )}
          {list.more === "failed" && <p role="alert">More projects did not load. Try again.</p>}
        </>
      )}
    </div>
  );
}
