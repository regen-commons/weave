import assert from "node:assert/strict";
import test from "node:test";
import {
  encodePublicProjectCursor, parsePublicProjectPage, parsePublicProjectQuery, PUBLIC_PROJECT_PAGE_SIZE, searchTerms,
  type PublicProjectCard,
} from "./public-projects-contract.ts";
import { createPublicProjectsHandler, indexStatus } from "./public-projects-http.ts";
import type { PublicProjectReader, PublicProjectSnapshot } from "./public-projects-store.ts";
import { projectUri } from "./test-data/public-projects.ts";

const url = (search: string) => new URL(`https://weave.example/api/public-projects${search}`);
const card = (n: number): PublicProjectCard => ({
  uri: projectUri(n), name: `Watershed circle ${n}`, passages: ["We restore wetlands along the river."],
  sharedAt: "2026-10-02T12:00:00.000000Z", checkedAt: "2026-11-15T04:01:00.000000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(projectUri(n))}`,
});

test("the query accepts only a bounded search, a kind of group, an opaque cursor and a page size", () => {
  assert.deepEqual(parsePublicProjectQuery(url("")),
    { q: "", terms: [], organizationType: null, sort: "newest", cursor: null, limit: PUBLIC_PROJECT_PAGE_SIZE });
  assert.deepEqual(["oldest", "name", "newest"].map((sort) => parsePublicProjectQuery(url(`?sort=${sort}`)).sort), ["oldest", "name", "newest"]);
  // A cursor carries its order's key: a share date for newest and oldest, a name for name A to Z.
  const named = encodePublicProjectCursor({ key: "Community seed library", uri: projectUri(2) });
  assert.deepEqual(parsePublicProjectQuery(url(`?sort=name&cursor=${named}`)).cursor, { key: "Community seed library", uri: projectUri(2) });
  assert.throws(() => parsePublicProjectQuery(url(`?cursor=${named}`)), /invalid_project_query/u, "a name cursor is not a date cursor");
  assert.equal(parsePublicProjectQuery(url("?q=soil&organizationType=community-group")).organizationType, "community-group");
  assert.equal(parsePublicProjectQuery(url("?organizationType=grupo-comunit%C3%A1rio")).organizationType, "grupo-comunitário");
  const search = parsePublicProjectQuery(url("?q=%20S%C3%A3o%20%20Paulo%20soil%20soil&limit=3"));
  assert.deepEqual([search.q, search.terms, search.limit], ["São Paulo soil soil", ["sao", "paulo", "soil"], 3]);
  assert.deepEqual(searchTerms("a b c d e f g h"), ["a", "b", "c", "d", "e", "f"]);
  // The longest address a project can have still makes a cursor the list accepts.
  const longest = `at://did:web:${"a".repeat(253)}/org.hypercerts.collection/${"k".repeat(128)}`;
  const far = encodePublicProjectCursor({ key: "2026-10-02T12:00:00.000000Z", uri: longest });
  assert.ok(far.length > 512);
  assert.equal(parsePublicProjectQuery(url(`?cursor=${far}`)).cursor?.uri, longest);
  const cursor = encodePublicProjectCursor({ key: "2026-10-02T12:00:00.000000Z", uri: projectUri(4) });
  assert.deepEqual(parsePublicProjectQuery(url(`?cursor=${cursor}`)).cursor,
    { key: "2026-10-02T12:00:00.000000Z", uri: projectUri(4) });
  for (const bad of [
    "?limit=0", "?limit=25", "?limit=2.5", "?limit=-1", "?other=1", "?q=a&q=b", `?q=${"x".repeat(101)}`, "?q=%00",
    "?q=%E2%80%AE", "?cursor=", "?cursor=***", `?cursor=${"A".repeat(1100)}`,
    `?cursor=${encodePublicProjectCursor({ key: "2026-10-02", uri: projectUri(1) })}`,
    `?cursor=${encodePublicProjectCursor({ key: "2026-10-02T12:00:00.000000Z", uri: "at://did:web:x/other/key" })}`,
    `?cursor=${Buffer.from(JSON.stringify({ sharedAt: "x" })).toString("base64url")}`,
    "?organizationType=", "?organizationType=Nonprofit", "?organizationType=non%20profit", "?organizationType=non_profit",
    "?organizationType=-lead", `?organizationType=${"x".repeat(41)}`, "?organizationType=a&organizationType=b",
    "?organizationType=Grupo-comunit%C3%A1rio", "?organizationType=grupo-comunita%CC%81rio", "?organizationType=a.b",
    "?organizationtype=nonprofit", "?type=nonprofit", "?sort=", "?sort=Name", "?sort=fit", "?sort=name&sort=oldest",
    `?sort=oldest&cursor=${encodePublicProjectCursor({ key: "Seed library", uri: projectUri(1) })}`,
    `?sort=name&cursor=${encodePublicProjectCursor({ key: "", uri: projectUri(1) })}`,
  ]) assert.throws(() => parsePublicProjectQuery(url(bad)), /invalid_project_query/u, bad);
});

test("the app accepts a page only from the expected source, with bounded cards", () => {
  const page = { index: { status: "bounded", checkedAt: "2026-11-15T04:01:00.000000Z", total: 2 }, projects: [card(1), card(2)], next: "abc" };
  assert.deepEqual(parsePublicProjectPage(page), page);
  for (const broken of [
    { ...page, projects: [{ ...card(1), sourceUrl: "https://elsewhere.example/x" }, card(2)] },
    { ...page, projects: [{ ...card(1), sourceUrl: "http://api.hypercerts.dev/x" }, card(2)] },
    { ...page, projects: [card(1), card(1)] },
    { ...page, projects: [{ ...card(1), passages: ["one", "two", "three"] }] },
    { ...page, projects: [{ ...card(1), name: "" }] },
    { ...page, projects: [{ ...card(1), uri: "https://example.org" }] },
    { ...page, index: { ...page.index, total: 1 } },
    { ...page, index: { ...page.index, status: "current" } },
    { ...page, next: 5 },
  ]) assert.throws(() => parsePublicProjectPage(broken), /invalid_public_projects/u);
});

test("the list is overdue after 26 hours and partial while a sweep is unfinished", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(indexStatus(null, now), "partial");
  assert.equal(indexStatus({ completedAt: null, offset: 0 }, now), "partial");
  assert.equal(indexStatus({ completedAt: "2026-11-15T04:00:00.000000Z", offset: 12 }, now), "partial");
  assert.equal(indexStatus({ completedAt: "2026-11-15T04:00:00.000000Z", offset: 0 }, now), "bounded");
  assert.equal(indexStatus({ completedAt: "2026-11-14T09:59:00.000000Z", offset: 0 }, now), "stale");
});

test("pages come from a copy read once a minute, are cacheable and link the next page", async () => {
  let clock = Date.parse("2026-11-15T06:00:00Z");
  const cards = [1, 2, 3, 4, 5].map((n) => ({ ...card(n), sharedAt: `2026-10-0${n}T12:00:00.000000Z`, organizationTypes: [],
    text: n === 2 ? "Guardamos sementes crioulas em São Paulo." : "We restore wetlands along the river." }));
  const snapshot: PublicProjectSnapshot = { cards, checkpoint: { completedAt: "2026-11-15T04:01:00.000000Z", offset: 0 } };
  let loads = 0;
  const reader: PublicProjectReader = { load: async () => { loads++; return snapshot; }, close: async () => undefined };
  const handler = createPublicProjectsHandler({ reader: async () => reader, now: () => clock });
  const get = async (search: string) => {
    const response = await handler(new Request(url(search)));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.equal(response.headers.get("cdn-cache-control"), "public, max-age=300, stale-while-revalidate=600");
    assert.equal(response.headers.get("set-cookie"), null);
    return parsePublicProjectPage(await response.json());
  };
  const first = await get("?limit=2");
  assert.deepEqual(first.index, { status: "bounded", checkedAt: "2026-11-15T04:01:00.000000Z", total: 5 });
  assert.deepEqual(first.projects.map(({ name }) => name), ["Watershed circle 5", "Watershed circle 4"]);
  assert.ok(!("text" in first.projects[0]!) && !("search" in first.projects[0]!));
  const second = await get(`?limit=2&cursor=${first.next}`);
  assert.deepEqual(second.projects.map(({ name }) => name), ["Watershed circle 3", "Watershed circle 2"]);
  const last = await get(`?limit=2&cursor=${second.next}`);
  assert.deepEqual([last.projects.map(({ name }) => name), last.next], [["Watershed circle 1"], null]);
  const found = await get("?q=SAO%20sementes");
  assert.deepEqual([found.index.total, found.projects.map(({ name }) => name)], [1, ["Watershed circle 2"]]);
  assert.equal((await get("?q=circle%205")).index.total, 1);
  assert.equal((await get("?q=nothing%20like%20this")).index.total, 0);
  assert.equal(loads, 1, "every search and page in the minute used one read");
  clock += 61_000;
  await get("");
  assert.equal(loads, 2);
});

test("before the list is switched on it answers an empty off page, and errors are stable and never cached", async () => {
  const off = await createPublicProjectsHandler({ reader: async () => null })(new Request(url("?q=soil")));
  assert.equal(off.status, 200);
  assert.equal(off.headers.get("cache-control"), "no-store");
  assert.deepEqual(parsePublicProjectPage(await off.json()), { index: { status: "off", checkedAt: null, total: 0 }, projects: [], next: null });

  const expect = async (response: Response, status: number, error: string) => {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cdn-cache-control"), null);
    assert.deepEqual(await response.json(), { error });
  };
  const reader: PublicProjectReader = { load: async () => ({ cards: [], checkpoint: null }), close: async () => undefined };
  const handler = createPublicProjectsHandler({ reader: async () => reader });
  await expect(await handler(new Request(url(""), { method: "POST" })), 405, "method_not_allowed");
  await expect(await handler(new Request(url("?limit=99"))), 400, "invalid_project_query");
  await expect(await createPublicProjectsHandler({ reader: async () => { throw Error("connect ECONNREFUSED db.internal"); } })(
    new Request(url(""))), 503, "public_projects_unavailable");
  let attempts = 0;
  const flaky = createPublicProjectsHandler({ reader: async () => ({ ...reader, load: async () => {
    if (++attempts === 1) throw Error("relation private.weave_project_index_source permission denied");
    return { cards: [{ ...card(1), text: "", organizationTypes: [] }], checkpoint: null };
  } }) });
  await expect(await flaky(new Request(url(""))), 503, "public_projects_unavailable");
  // A database that stops answering gives a quick 503, and the next request reads again.
  let hung = 0;
  const stalled = createPublicProjectsHandler({ loadTimeoutMs: 20, reader: async () => ({ ...reader, load: () => {
    hung++;
    return new Promise<never>(() => undefined);
  } }) });
  await expect(await stalled(new Request(url(""))), 503, "public_projects_unavailable");
  await expect(await stalled(new Request(url(""))), 503, "public_projects_unavailable");
  assert.equal(hung, 2);
  const recovered = parsePublicProjectPage(await (await flaky(new Request(url("")))).json());
  assert.deepEqual([recovered.index.status, recovered.index.total, attempts], ["partial", 1, 2], "a failed read is not kept");
});

test("a card may say who shared it and where, and a page and an app of either age read each other", () => {
  const named = { ...card(1), publisher: "Lagoa Seed Library", place: "São Paulo, Brazil" };
  const page = {
    index: { status: "bounded", checkedAt: "2026-11-19T04:01:00.000000Z", total: 2, organizationTypes: ["nonprofit", "cooperative"] },
    projects: [named, { ...card(2), place: "Awka, Nigeria" }], next: null,
  };
  assert.deepEqual(parsePublicProjectPage(page), page);
  // A server from before these facts sends none of them, and the page reads as it did.
  const older = { index: { status: "bounded", checkedAt: "2026-11-19T04:01:00.000000Z", total: 1 }, projects: [card(1)], next: null };
  const read = parsePublicProjectPage(older);
  assert.deepEqual(read, older);
  assert.ok(!("publisher" in read.projects[0]!) && !("organizationTypes" in read.index));
  // A server newer than this app may add more; what this app does not know is dropped, as an older app drops these.
  const newer = { ...page, index: { ...page.index, kinds: ["x"] }, projects: [{ ...named, banner: "https://cdn.example/x.jpg" }, page.projects[1]] };
  assert.deepEqual(parsePublicProjectPage(newer), page);
  for (const broken of [
    { publisher: "" }, { publisher: "   " }, { publisher: 5 }, { publisher: null }, { publisher: "x".repeat(121) },
    { place: "Awka\u0000" }, { place: "‮akwa" }, { place: ["Awka"] },
  ]) assert.throws(() => parsePublicProjectPage({ ...page, projects: [{ ...named, ...broken }] }), /invalid_public_projects/u,
    JSON.stringify(broken));
  for (const organizationTypes of ["nonprofit", ["Nonprofit"], ["nonprofit", "nonprofit"], [""], [5], null,
    Array.from({ length: 25 }, (_, n) => `kind${n}`)])
    assert.throws(() => parsePublicProjectPage({ ...page, index: { ...page.index, organizationTypes } }), /invalid_public_projects/u,
      JSON.stringify(organizationTypes));
});

test("search reads the publisher and the place, and a kind of group narrows the list to the publishers that name it", async () => {
  const facts: [Partial<PublicProjectCard>, string[]][] = [
    [{ publisher: "Lagoa Seed Library", place: "São Paulo, Brazil" }, ["nonprofit"]],
    [{ publisher: "Riverkeepers" }, ["cooperative", "nonprofit"]],
    [{}, ["nonprofit"]],
    [{ place: "Awka, Nigeria" }, ["community-group", "cooperative"]],
    [{}, ["other"]],
    [{ publisher: "Orchard Circle" }, ["other"]],
  ];
  const cards = facts.map(([fact, organizationTypes], index) => ({
    ...card(index + 1), ...fact, organizationTypes, sharedAt: `2026-10-0${index + 1}T12:00:00.000000Z`, text: "We restore wetlands.",
  }));
  const handler = createPublicProjectsHandler({ reader: async () => ({
    load: async () => ({ cards, checkpoint: { completedAt: "2026-11-19T04:01:00.000000Z", offset: 0 } }), close: async () => undefined,
  }), now: () => Date.parse("2026-11-19T06:00:00Z") });
  const get = async (search: string) => {
    const response = await handler(new Request(url(search)));
    assert.equal(response.status, 200, search);
    const body = await response.json() as { projects: Record<string, unknown>[] };
    for (const project of body.projects)
      assert.deepEqual(Object.keys(project).filter((key) => ["text", "search", "organizationTypes"].includes(key)), []);
    return parsePublicProjectPage(body);
  };
  const all = await get("");
  // Most common first, ties by name, whatever the search or filter, and "other" always last.
  assert.deepEqual(all.index.organizationTypes, ["nonprofit", "cooperative", "community-group", "other"]);
  assert.deepEqual(all.projects.map(({ publisher, place }) => [publisher ?? null, place ?? null]), [
    ["Orchard Circle", null], [null, null], [null, "Awka, Nigeria"], [null, null], ["Riverkeepers", null],
    ["Lagoa Seed Library", "São Paulo, Brazil"],
  ]);
  const name = (n: number) => `Watershed circle ${n}`;
  assert.deepEqual((await get("?q=lagoa%20seed")).projects.map((project) => project.name), [name(1)]);
  assert.deepEqual((await get("?q=sao%20paulo")).projects.map((project) => project.name), [name(1)]);
  assert.deepEqual((await get("?q=awka")).projects.map((project) => project.name), [name(4)]);
  const nonprofit = await get("?organizationType=nonprofit&limit=2");
  assert.deepEqual([nonprofit.index.total, nonprofit.projects.map((project) => project.name)], [3, [name(3), name(2)]]);
  const rest = await get(`?organizationType=nonprofit&limit=2&cursor=${nonprofit.next}`);
  assert.deepEqual([rest.projects.map((project) => project.name), rest.next], [[name(1)], null]);
  const both = await get("?q=riverkeepers&organizationType=cooperative");
  assert.deepEqual([both.index.total, both.projects.map((project) => project.name), both.index.organizationTypes],
    [1, [name(2)], ["nonprofit", "cooperative", "community-group", "other"]]);
  // A kind no publisher names is an empty list, not an error.
  assert.deepEqual([(await get("?organizationType=dao")).index.total, (await get("?organizationType=dao")).projects], [0, []]);
  // A list whose publishers name no kind offers none, as a server from before the filter did.
  const plain = createPublicProjectsHandler({ reader: async () => ({
    load: async () => ({ cards: [{ ...card(1), organizationTypes: [], text: "" }], checkpoint: null }), close: async () => undefined,
  }) });
  const quiet = await (await plain(new Request(url("")))).json() as { index: Record<string, unknown> };
  assert.ok(!("organizationTypes" in quiet.index));
});

test("a stored value the app would refuse is left out of its card, so one bad row cannot empty the list", async () => {
  const cards = [
    { ...card(1), publisher: "", place: "x".repeat(121), organizationTypes: ["Bad Kind", "nonprofit", "nonprofit"], text: "" },
    { ...card(2), publisher: "Lagoa\u0000Seed", place: "Awka, Nigeria", organizationTypes: ["community-group"], text: "" },
  ];
  const handler = createPublicProjectsHandler({ reader: async () => ({
    load: async () => ({ cards, checkpoint: null }), close: async () => undefined,
  }) });
  const response = await handler(new Request(url("")));
  assert.equal(response.status, 200);
  const page = parsePublicProjectPage(await response.json());
  assert.deepEqual(page.projects.map(({ uri, publisher, place }) => [uri, publisher, place]).sort(),
    [[projectUri(1), undefined, undefined], [projectUri(2), undefined, "Awka, Nigeria"]].sort());
  assert.deepEqual(page.index.organizationTypes, ["community-group", "nonprofit"]);
});

test("the list reads newest first, oldest first or by name, and every order pages without gaps or repeats", async () => {
  const names = ["école verte", "Orchard 10", "Orchard 9", "acequia keepers", "Bee Commons", "Ecole Verte"];
  const cards = names.map((name, n) => ({ ...card(n + 1), name, organizationTypes: [], text: "",
    sharedAt: `2026-10-0${[3, 1, 6, 2, 5, 4][n]}T12:00:00.000000Z` }));
  const handler = createPublicProjectsHandler({ reader: async () => ({
    load: async () => ({ cards, checkpoint: null }), close: async () => undefined,
  }) });
  const pages = async (sort: string) => {
    const seen: string[] = [];
    let next: string | null = null;
    for (let request = 0; request < 10; request++) {
      const response = await handler(new Request(url(`?limit=2${sort ? `&sort=${sort}` : ""}${next ? `&cursor=${next}` : ""}`)));
      assert.equal(response.status, 200, sort);
      const page = parsePublicProjectPage(await response.json());
      seen.push(...page.projects.map(({ name }) => name));
      next = page.next;
      if (!next) return seen;
    }
    throw Error("too_many_pages");
  };
  assert.deepEqual(await pages(""), ["Orchard 9", "Bee Commons", "Ecole Verte", "école verte", "acequia keepers", "Orchard 10"]);
  assert.deepEqual(await pages("oldest"), ["Orchard 10", "acequia keepers", "école verte", "Ecole Verte", "Bee Commons", "Orchard 9"]);
  // Case and accents aside, numbers by value, and a tie keeps one fixed order by address.
  assert.deepEqual(await pages("name"), ["acequia keepers", "Bee Commons", "école verte", "Ecole Verte", "Orchard 9", "Orchard 10"]);
  // A search keeps the order it was asked for.
  const response = await handler(new Request(url("?q=orchard&sort=name")));
  assert.deepEqual(parsePublicProjectPage(await response.json()).projects.map(({ name }) => name), ["Orchard 9", "Orchard 10"]);
});
