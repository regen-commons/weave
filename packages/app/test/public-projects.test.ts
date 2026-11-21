import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicProjectPage } from "@weave/api/public-projects-contract";
import {
  chosenOrganizationType, chosenSort, chosenWorkScope, countLine, emptyList, expectsStarter, filtersChosen, firstPage, INDEX_OFF_KEY,
  indexLine, keyLabel, listView, nextPage, organizationTypeFacets, organizationTypeLabel, rememberIndex, publicProjectsPath,
  PUBLIC_PROJECT_QUERY_MAX, requestPublicProjects, PUBLIC_PROJECT_SORT_OPTIONS, sameAsk, searchNow, searchQuery, SEARCH_PAUSE_MS,
  sharedByLine, sharedLabel, showsIndex, workScopeFacets,
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
  assert.equal(publicProjectsPath("", { cursor: "abc", limit: 3 }), "/api/public-projects?cursor=abc&limit=3");
  assert.equal(publicProjectsPath("x".repeat(150)).length, "/api/public-projects?q=".length + 100);
});

test("a typed search is trimmed, single spaced and bounded before it reaches the list (DL-081)", () => {
  assert.equal(searchQuery("  river   soil  "), "river soil");
  assert.equal(searchQuery("\n"), "");
  assert.equal(searchQuery("x".repeat(150)).length, PUBLIC_PROJECT_QUERY_MAX);
  assert.equal(publicProjectsPath(searchQuery(" river ")), "/api/public-projects?q=river");
  assert.ok(SEARCH_PAUSE_MS >= 200 && SEARCH_PAUSE_MS <= 500, "long enough to send one request, short enough to feel live");
  // An emptied box asks at once, so clearing the search and the kind of group sends one request.
  assert.equal(searchNow("", "soil"), "");
  assert.equal(searchNow("soi", "soil"), "soil", "while typing, the last paused search stands");
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
  assert.equal(publicProjectsPath("soil", { cursor: "abc", limit: 3, organizationType: "nonprofit" }),
    "/api/public-projects?q=soil&organizationType=nonprofit&cursor=abc&limit=3");
  assert.equal(publicProjectsPath("", { organizationType: "community-group" }), "/api/public-projects?organizationType=community-group");
  for (const unreadable of ["Nonprofit", "non profit", "", "x".repeat(41), null])
    assert.equal(publicProjectsPath("", { organizationType: unreadable }), "/api/public-projects", String(unreadable));
  assert.equal(chosenOrganizationType("?q=soil&organizationType=nonprofit"), "nonprofit");
  // An address shared before the Portuguese spellings were read as Community group opens on Community group (DL-123).
  assert.equal(chosenOrganizationType("?organizationType=grupo-comunit%C3%A1rio"), "community-group");
  assert.equal(chosenOrganizationType("?organizationType=grupo-comunitario"), "community-group");
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
  assert.equal(organizationTypeLabel("grupo-comunitário"), "Grupo comunitário");
  assert.equal(organizationTypeLabel("ngo"), "NGO");
});

test("a kind of work goes into the page's address beside the kind of group, as Focus in the bar (DL-123)", () => {
  assert.equal(publicProjectsPath("soil", { organizationType: "nonprofit", workScope: "restoration", sort: "name", cursor: "abc" }),
    "/api/public-projects?q=soil&organizationType=nonprofit&workScope=restoration&sort=name&cursor=abc");
  for (const unreadable of ["Restoration", "forest_protection", "", "x".repeat(61), null])
    assert.equal(publicProjectsPath("", { workScope: unreadable }), "/api/public-projects", String(unreadable));
  assert.equal(chosenWorkScope("?workScope=biodiversity-monitoring"), "biodiversity-monitoring");
  for (const search of ["", "?workScope=", "?workScope=Water", "?focus=water"]) assert.equal(chosenWorkScope(search), null, search);
  assert.deepEqual(workScopeFacets(undefined, null), [], "a list from before the filter has none");
  const [facet] = workScopeFacets(["restoration", "biodiversity-monitoring", "disaster-relief", "other"], "water");
  assert.deepEqual(facet, {
    key: "workScope", label: "Focus", kind: "one", chosen: ["water"],
    options: [{ value: "", label: "Any focus" }, { value: "restoration", label: "Restoration" },
      { value: "biodiversity-monitoring", label: "Biodiversity monitoring" }, { value: "disaster-relief", label: "Disaster relief" },
      { value: "other", label: "Other" }, { value: "water", label: "Water" }],
  });
  const [waiting] = workScopeFacets("waiting", null);
  assert.deepEqual([waiting?.label, waiting?.options.map(({ label }) => label)], ["Focus", ["Any focus"]]);
  assert.equal(keyLabel("ngo-network"), "NGO network");
  // A late page for another kind of work is dropped, like one for another search or kind of group.
  const restoring = firstPage("", page([card(1)], 1), { workScope: "restoration" });
  assert.equal(sameAsk(restoring, { q: "", workScope: "restoration" }), true);
  assert.equal(sameAsk(restoring, { q: "" }), false);
  assert.equal(filtersChosen(restoring), 1);
  assert.equal(filtersChosen(firstPage("", page([], 0), { workScope: "water", organizationType: "nonprofit" })), 2);
  assert.equal(showsIndex(firstPage("", page([], 0), { workScope: "water" })), true, "an empty filtered list still shows the index");
});

test("a list narrowed by a kind of group says so, and an empty one offers to clear it", () => {
  assert.equal(countLine(3, false, 1), "3 projects match your filter.");
  assert.equal(countLine(1, true, 1), "1 project matches your search and filter.");
  assert.equal(countLine(2, false, 2), "2 projects match your filters.");
  assert.equal(countLine(1, true, 2), "1 project matches your search and filters.");
  assert.equal(countLine(1208, false, 0), "1,208 projects shared on Certified.");
  assert.deepEqual(emptyList(true, 0), { title: "No projects match your search",
    body: "Try other words, or clear the search to see every project.", action: "Clear Search" });
  assert.deepEqual(emptyList(false, 1), { title: "No projects match this filter",
    body: "Try another choice, or clear the filters to see every project.", action: "Clear Filters" });
  assert.deepEqual(emptyList(false, 2), { title: "No projects match these filters",
    body: "Try fewer filters, or clear them to see every project.", action: "Clear Filters" });
  assert.equal(emptyList(true, 1).title, "No projects match your search and filter");
  assert.equal(emptyList(true, 2).title, "No projects match your search and filters");
  // A kind that matches nothing still shows the index and its empty state, not the starter list.
  const none = firstPage("", page([], 0), { organizationType: "dao" });
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

test("the list can be read newest first, oldest first or by name, and the order lives in the address (DL-121)", () => {
  assert.deepEqual(PUBLIC_PROJECT_SORT_OPTIONS.map(({ value, label }) => `${value}: ${label}`),
    ["newest: Newest first", "oldest: Oldest first", "name: Name A to Z"]);
  // Newest first is the list's own order, so its pages keep the addresses they had.
  assert.equal(publicProjectsPath("soil", { sort: "newest" }), "/api/public-projects?q=soil");
  assert.equal(publicProjectsPath("soil", { cursor: "abc", limit: 3, organizationType: "nonprofit", sort: "name" }),
    "/api/public-projects?q=soil&organizationType=nonprofit&sort=name&cursor=abc&limit=3");
  assert.equal(chosenSort("?sort=oldest"), "oldest");
  for (const search of ["", "?sort=", "?sort=Name", "?sort=fit"]) assert.equal(chosenSort(search), "newest", search);
  // A late page for another order is dropped, like one for another search or kind.
  const named = firstPage("", page([card(1)], 1), { sort: "name" });
  assert.equal(named.status === "ready" && named.sort, "name");
  assert.equal(sameAsk(named, { q: "", sort: "name" }), true);
  assert.equal(sameAsk(named, { q: "" }), false);
  assert.equal("sort" in firstPage("", page([card(1)], 1), { sort: "newest" }), false);
});
