import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicProjectPage } from "@weave/api/public-projects-contract";
import {
  chosenOrganizationType, countLine, emptyList, expectsStarter, firstPage, INDEX_OFF_KEY, indexLine, listView, nextPage,
  organizationTypeFacets, organizationTypeLabel, rememberIndex, publicProjectsPath, PUBLIC_PROJECT_QUERY_MAX, requestPublicProjects,
  searchQuery, SEARCH_PAUSE_MS, sharedByLine, sharedLabel, showsIndex,
} from "../src/partners/public-projects.ts";

const uri = (n: number) => `at://did:plc:fixture${"a".repeat(13)}aaa${String.fromCharCode(97 + n)}/org.hypercerts.collection/project${n}`;
const card = (n: number) => ({
  uri: uri(n), name: `Watershed circle ${n}`, passages: ["We restore wetlands along the river."],
  sharedAt: "2026-10-02T12:00:00.000000Z", checkedAt: "2026-11-15T04:01:00.000000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri(n))}`,
});
const page = (projects: ReturnType<typeof card>[], total: number, next: string | null = null): PublicProjectPage => ({
  index: { status: "bounded", checkedAt: "2026-11-15T04:01:00.000000Z", total }, projects, next,
});

test("each page has one same-origin address, with the search trimmed and bounded", () => {
  assert.equal(publicProjectsPath(""), "/api/public-projects");
  assert.equal(publicProjectsPath("  river   soil "), "/api/public-projects?q=river+soil");
  assert.equal(publicProjectsPath("", "abc", 3), "/api/public-projects?cursor=abc&limit=3");
  assert.equal(publicProjectsPath("x".repeat(150)).length, "/api/public-projects?q=".length + 100);
});

test("a typed search is trimmed, single spaced and bounded before it reaches the list (DL-081)", () => {
  assert.equal(searchQuery("  river   soil  "), "river soil");
  assert.equal(searchQuery("\n"), "");
  assert.equal(searchQuery("x".repeat(150)).length, PUBLIC_PROJECT_QUERY_MAX);
  assert.equal(publicProjectsPath(searchQuery(" river ")), "/api/public-projects?q=river");
  assert.ok(SEARCH_PAUSE_MS >= 200 && SEARCH_PAUSE_MS <= 500, "long enough to send one request, short enough to feel live");
});

test("a page is read without credentials and refused unless it is valid", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const answer = (body: unknown, status = 200) => async (path: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    return Response.json(body, { status });
  };
  const signal = new AbortController().signal;
  const ok = await requestPublicProjects("/api/public-projects", signal, answer(page([card(1)], 1)));
  assert.equal(ok.projects[0]?.name, "Watershed circle 1");
  assert.equal(calls[0]?.init?.credentials, "omit");
  await assert.rejects(requestPublicProjects("/api/public-projects", signal, answer({ error: "public_projects_unavailable" }, 503)));
  await assert.rejects(requestPublicProjects("/api/public-projects", signal,
    answer(page([{ ...card(1), sourceUrl: "https://elsewhere.example/" }], 1))));
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(requestPublicProjects("/api/public-projects", aborted.signal,
    async (_path, init) => { init?.signal?.throwIfAborted(); return Response.json(page([], 0)); }));
});

test("the index shows while it has projects or a search runs, and the starter list otherwise", () => {
  // Until a first page answers, only loading shows; a later search keeps the index on screen.
  assert.equal(listView({ status: "loading", q: "" }, false), "loading");
  assert.equal(listView({ status: "loading", q: "soil" }, true), "index");
  assert.equal(listView({ status: "failed", q: "" }, false), "starter");
  assert.equal(listView(firstPage("", page([card(1)], 1)), false), "index");
  assert.equal(showsIndex({ status: "loading", q: "" }), false);
  assert.equal(showsIndex({ status: "failed", q: "soil" }), false);
  assert.equal(showsIndex(firstPage("", page([], 0))), false);
  assert.equal(showsIndex(firstPage("soil", page([], 0))), true);
  assert.equal(showsIndex(firstPage("", page([card(1)], 1))), true);
  // Before the list is switched on, a search still shows the starter list, not "no matches".
  const off: PublicProjectPage = { index: { status: "off", checkedAt: null, total: 0 }, projects: [], next: null };
  assert.equal(showsIndex(firstPage("soil", off)), false);
  assert.equal(listView(firstPage("", off), false), "starter");
});

test("more pages add only projects not already shown", () => {
  const list = nextPage(firstPage("", page([card(1), card(2)], 4, "next")), page([card(2), card(3)], 4));
  assert.equal(list.status, "ready");
  if (list.status !== "ready") return;
  assert.deepEqual(list.projects.map(({ name }) => name), ["Watershed circle 1", "Watershed circle 2", "Watershed circle 3"]);
  assert.equal(list.page.next, null);
  assert.deepEqual(nextPage({ status: "failed", q: "" }, page([card(1)], 1)), { status: "failed", q: "" });
});

test("the count and freshness lines are whole sentences that say what the list is and how current it is", () => {
  const date = (iso: string) => iso.slice(0, 10);
  assert.equal(countLine(998, false), "998 projects shared on Certified.");
  assert.equal(countLine(1108, false), "1,108 projects shared on Certified.");
  assert.equal(countLine(1, false), "1 project shared on Certified.");
  assert.equal(countLine(1, true), "1 project matches your search.");
  assert.equal(countLine(0, true), "0 projects match your search.");
  assert.equal(sharedLabel(1108), "1,108 Projects Shared On Certified");
  assert.equal(sharedLabel(1), "1 Project Shared On Certified");
  const index = { status: "bounded", checkedAt: "2026-11-15T04:01:00.000000Z", total: 3 } as const;
  assert.equal(indexLine(index, date), "Checked on 2026-11-15.");
  assert.equal(indexLine({ ...index, status: "stale" }, date), "Last checked on 2026-11-15. The list may be out of date.");
  assert.equal(indexLine({ ...index, status: "partial", checkedAt: null }, date),
    "The latest check did not finish, so some projects may be missing.");
});

test("a browser that last heard the list is off opens on the starter list, with no skeleton to jump from (DL-109)", () => {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  const off: PublicProjectPage = { index: { status: "off", checkedAt: null, total: 0 }, projects: [], next: null };
  assert.equal(expectsStarter(storage), false, "nothing remembered: the list is expected");
  assert.equal(listView({ status: "loading", q: "" }, false, expectsStarter(storage)), "loading");
  rememberIndex(storage, off);
  assert.equal(kept.get(INDEX_OFF_KEY), "1");
  assert.equal(listView({ status: "loading", q: "" }, false, expectsStarter(storage)), "starter");
  // Once the list has been seen in this visit, a search keeps it on screen whatever was remembered.
  assert.equal(listView({ status: "loading", q: "soil" }, true, true), "index");
  // An answer that the list is on forgets it; an answer always decides, whatever was expected.
  rememberIndex(storage, page([card(1)], 1));
  assert.equal(kept.has(INDEX_OFF_KEY), false);
  assert.equal(listView(firstPage("", page([card(1)], 1)), false, true), "index");
  // A browser that refuses storage is not an error: it expects the list.
  const refuses = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => {} };
  assert.equal(expectsStarter(refuses), false);
  assert.doesNotThrow(() => rememberIndex(refuses, off));
  assert.equal(expectsStarter(null), false);
});

test("a kind of group goes into the page's address in one place, and only one the list can read", () => {
  assert.equal(publicProjectsPath("soil", "abc", 3, "nonprofit"), "/api/public-projects?q=soil&organizationType=nonprofit&cursor=abc&limit=3");
  assert.equal(publicProjectsPath("", null, undefined, "community-group"), "/api/public-projects?organizationType=community-group");
  for (const unreadable of ["Nonprofit", "non profit", "", "x".repeat(41), null])
    assert.equal(publicProjectsPath("", null, undefined, unreadable), "/api/public-projects", String(unreadable));
  assert.equal(chosenOrganizationType("?q=soil&organizationType=nonprofit"), "nonprofit");
  for (const search of ["", "?organizationType=", "?organizationType=Non%20Profit", "?kind=nonprofit"])
    assert.equal(chosenOrganizationType(search), null, search);
});

test("the filter offers only the kinds the list names, keeps a chosen one on offer, and waits with the list (DL-081, DL-108)", () => {
  assert.deepEqual(organizationTypeFacets(undefined, null), [], "a list from before the filter has none");
  assert.deepEqual(organizationTypeFacets([], null), [], "a list whose publishers name no kind has none");
  const [facet] = organizationTypeFacets(["nonprofit", "community-group"], null);
  assert.deepEqual(facet, {
    key: "organizationType", label: "Kind of group", kind: "one", chosen: [],
    options: [{ value: "", label: "Any kind" }, { value: "nonprofit", label: "Nonprofit" }, { value: "community-group", label: "Community group" }],
  });
  // A kind from an address the list no longer names still shows, so it can be taken off.
  const [kept] = organizationTypeFacets(["nonprofit"], "cooperative");
  assert.deepEqual([kept?.chosen, kept?.options.map(({ value }) => value)], [["cooperative"], ["", "nonprofit", "cooperative"]]);
  // Before the first page answers, the bar draws the filter waiting, so it does not grow when the list arrives.
  const [waiting] = organizationTypeFacets("waiting", null);
  assert.deepEqual([waiting?.label, waiting?.options.map(({ label }) => label)], ["Kind of group", ["Any kind"]]);
  assert.equal(organizationTypeLabel("nonprofit"), "Nonprofit");
  assert.equal(organizationTypeLabel("for-profit-company"), "For profit company");
});

test("a list narrowed by a kind of group says so, and an empty one offers to clear it", () => {
  assert.equal(countLine(3, false, true), "3 projects match your filter.");
  assert.equal(countLine(1, true, true), "1 project matches your search and filter.");
  assert.equal(countLine(1208, false, false), "1,208 projects shared on Certified.");
  assert.deepEqual(emptyList(true, false), { title: "No projects match your search",
    body: "Try other words, or clear the search to see every project.", action: "Clear Search" });
  assert.deepEqual(emptyList(false, true), { title: "No projects match this filter",
    body: "Try another kind of group, or clear the filters to see every project.", action: "Clear Filters" });
  assert.equal(emptyList(true, true).title, "No projects match your search and filter");
  // A kind that matches nothing still shows the index and its empty state, not the starter list.
  const none = firstPage("", page([], 0), "dao");
  assert.deepEqual([showsIndex(none), none.status === "ready" && none.organizationType], [true, "dao"]);
  assert.equal(showsIndex(firstPage("", page([], 0))), false);
});

test("the line under a card's name says who shared it and where, in words for the whole line", () => {
  assert.equal(sharedByLine({ publisher: "Lagoa Seed Library", place: "São Paulo, Brazil" }),
    "Shared by Lagoa Seed Library. Place: São Paulo, Brazil.");
  assert.equal(sharedByLine({ publisher: "Riverkeepers" }), "Shared by Riverkeepers.");
  assert.equal(sharedByLine({ place: "Awka, Nigeria" }), "Place: Awka, Nigeria.");
  assert.equal(sharedByLine({}), "");
});
