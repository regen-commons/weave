import assert from "node:assert/strict";
import test from "node:test";
import { createInitiativesPageHandler, LIST_LOOKUP_TIMEOUT_MS } from "./initiatives-page-http.ts";
import { asksFirstPage, LIST_FIRST_PAGE_ID, LIST_FIRST_PAGE_REQUEST, listCardHtml, withListFirstPage } from "./list-first-view.ts";
import { parsePublicProjectPage, type PublicProjectCard, type PublicProjectPage } from "./public-projects-contract.ts";

const uri = (n: number) => `at://did:plc:${"a".repeat(23)}${String.fromCharCode(97 + n)}/org.hypercerts.collection/3n2t7jfkyl72${String.fromCharCode(97 + n)}`;
const card = (n: number, over: Partial<PublicProjectCard> = {}): PublicProjectCard => ({
  uri: uri(n), name: `Watershed circle ${n}`, passages: ["We restore wetlands.", "And the river's banks."],
  sharedAt: "2026-10-02T23:30:00.000Z", checkedAt: "2026-11-15T04:01:00.000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri(n))}`,
  publisher: `Valley group ${n}`, place: "Upper valley", ...over,
});
const page = (cards: PublicProjectCard[], over: Partial<PublicProjectPage["index"]> = {}): PublicProjectPage =>
  parsePublicProjectPage({ index: { status: "bounded", checkedAt: "2026-11-15T04:01:00.000Z", total: 994, ...over }, projects: cards, next: null });

/** The build's page for the list, as dev/prerender.ts draws it: a view with a skeleton where the cards go. */
const BUILT = [
  "<!doctype html>", '<html lang="en">', "  <head>", '    <meta charset="utf-8">', "    <title>Initiatives | Weave</title>",
  '    <link rel="canonical" href="https://weave.regencommons.com/initiatives">',
  '    <script src="/assets/first-page-abc12345.js" async fetchpriority="high"></script>', "  </head>", "  <body>",
  '    <div id="root" data-first-view="/initiatives" inert><main><h1 class="rc-heading">Initiatives</h1>',
  '<ul class="rc-card-grid" aria-hidden="true"><li><article class="rc-card rc-skeleton"></article></li><li><article class="rc-card rc-skeleton"></article></li></ul>',
  '<div class="rc-list-end"></div></main></div>', "  </body>", "</html>",
].join("\n");

/** The JSON the page carries, read as the app reads it. */
function carried(html: string): unknown {
  const json = new RegExp(`<script type="application/json" id="${LIST_FIRST_PAGE_ID}">([^<]*)</script>`, "u").exec(html)?.[1];
  return json === undefined ? undefined : JSON.parse(json);
}

test("the list's page gets its first cards in place of the skeleton, and the same page as JSON before any script", () => {
  const first = page([card(1), card(2)]);
  const html = withListFirstPage(BUILT, first);
  assert.doesNotMatch(html, /rc-skeleton/u, "the skeleton is gone");
  assert.equal(html.match(/<li tabindex="-1"><article class="rc-card" data-layout="listing" data-kind="initiative" data-rows="fixed">/gu)?.length, 2);
  assert.deepEqual(carried(html), { path: LIST_FIRST_PAGE_REQUEST, page: first });
  assert.ok(html.indexOf(LIST_FIRST_PAGE_ID) < html.indexOf("<script src="), "before the first-page script, which looks for it");
  for (const kept of ['<link rel="canonical" href="https://weave.regencommons.com/initiatives">', '<div id="root" data-first-view="/initiatives" inert>',
    '<h1 class="rc-heading">Initiatives</h1>', '<div class="rc-list-end"></div>', "<title>Initiatives | Weave</title>"])
    assert.ok(html.includes(kept), `keeps ${kept}`);
});

test("a card is the app's card: its link, who and where, its words and its two days", () => {
  const html = listCardHtml(card(1));
  assert.match(html, /<h2 class="rc-card-title"><a href="\/initiatives\/[a-z0-9-]+">Watershed circle 1<\/a><\/h2>/u);
  assert.match(html, /<p class="rc-card-meta" title="Shared by Valley group 1\. Place: Upper valley\."><span class="rc-visually-hidden">Shared by <\/span>Valley group 1<svg class="rc-icon" data-size="sm" aria-hidden="true"><use href="\/brand\/icons\.svg#place"><\/use><\/svg><span class="rc-visually-hidden">\. Place: <\/span>Upper valley<\/p>/u);
  assert.match(html, /<p class="rc-card-summary">We restore wetlands\. And the river's banks\.<\/p>/u);
  assert.match(html, /checked on <time datetime="2026-11-15T04:01:00\.000Z">15 November 2026<\/time>\./u);
  assert.match(html, /Shared <time datetime="2026-10-02T23:30:00\.000Z">2 October 2026<\/time>/u, "the UTC day, as the app shows it");
  const bare = listCardHtml(card(2, { publisher: undefined, place: undefined }));
  assert.match(bare, /<p class="rc-card-meta"><\/p>/u, "an empty line that keeps its room, with no title");
  assert.match(listCardHtml(card(3, { publisher: undefined })), /<span class="rc-visually-hidden">Place: <\/span>Upper valley/u);
  // A project the index gave no Weave address shows its name alone, as the app's card does: its record's
  // raw data is no page to read (DL-152).
  const away = listCardHtml(card(4, { uri: "at://did:web:example.org/org.hypercerts.collection/x" }));
  assert.match(away, /<h2 class="rc-card-title">Watershed circle 4<\/h2>/u);
  assert.doesNotMatch(away, /api\.hypercerts\.dev/u, "no link to the raw record");
});

test("a project's own words are never markup, in the cards or in the JSON", () => {
  const hostile = '</script><script>alert(1)</script><img src=x onerror=alert(2)>"\'&\u2028\u2029';
  const first = page([card(1, { name: hostile, passages: [hostile], publisher: hostile, place: hostile })]);
  const html = withListFirstPage(BUILT, first);
  const body = html.slice(html.indexOf("<body>"));
  assert.doesNotMatch(body, /<script>|<img/u, "no element from the project's words");
  assert.ok(body.includes("&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&quot;'&amp;"));
  assert.doesNotMatch(body, /title="[^"]*"[^>]*onerror/u, "the title attribute ends where it should");
  // The JSON's text holds no tag, no ampersand and no line separator, and reads back as the same page.
  const json = new RegExp(`id="${LIST_FIRST_PAGE_ID}">([^<]*)</script>`, "u").exec(html)?.[1] ?? "";
  assert.doesNotMatch(json, /[<>&\u2028\u2029]/u);
  assert.deepEqual(carried(html), { path: LIST_FIRST_PAGE_REQUEST, page: first });
  assert.equal(html.match(/<script/gu)?.length, 2, "the page's own script and the JSON, nothing more");
  // Replacement patterns in a project's words are words too.
  const patterns = withListFirstPage(BUILT, page([card(1, { name: "$& $1 $` $' $$" })]));
  assert.ok(patterns.includes("<a href=\"/initiatives/") && patterns.includes(">$&amp; $1 $` $' $$</a>"));
  assert.doesNotMatch(patterns, /rc-skeleton/u);
  // A project with no Weave address links only to the public record's own site.
  const away = withListFirstPage(BUILT, page([card(1, { uri: "at://did:web:example.org/org.hypercerts.collection/x" })]));
  for (const href of away.matchAll(/<a href="([^"]*)"/gu)) assert.equal(new URL(href[1]!.replaceAll("&amp;", "&"), ORIGIN).origin, "https://api.hypercerts.dev");
});

test("a page that is not the build's view of the list gets the JSON and no cards; a list with no cards goes as it came", () => {
  const first = page([card(1)]);
  const emptyRoot = BUILT.replace(/<div id="root"[\s\S]*<\/main><\/div>/u, '<div id="root"></div>');
  const homeView = BUILT.replace('data-first-view="/initiatives"', 'data-first-view="/"');
  const twoGrids = BUILT.replace("</main>", '<ul class="rc-card-grid" aria-hidden="true"><li></li></ul></main>');
  const noGrid = BUILT.replace(/<ul class="rc-card-grid"[\s\S]*?<\/ul>/u, "");
  const gridOutsideRoot = BUILT.replace("<body>", '<body><ul class="rc-card-grid" aria-hidden="true"></ul>').replace(/(<div id="root"[^>]*>[\s\S]*?)<ul class="rc-card-grid" aria-hidden="true">[\s\S]*?<\/ul>/u, "$1");
  for (const [name, html] of Object.entries({ emptyRoot, homeView, twoGrids, noGrid, gridOutsideRoot })) {
    const served = withListFirstPage(html, first);
    assert.equal(served.slice(served.indexOf("<body>")), html.slice(html.indexOf("<body>")), `${name}: nothing drawn`);
    assert.deepEqual(carried(served), { path: LIST_FIRST_PAGE_REQUEST, page: first }, `${name}: the app still starts with the cards`);
  }
  assert.equal(withListFirstPage(BUILT, page([], { total: 0 })), BUILT, "an empty list shows the starter list");
  assert.equal(withListFirstPage(BUILT, page([], { status: "off", checkedAt: null, total: 0 })), BUILT, "a list that is off too");
  assert.equal(withListFirstPage(BUILT.replace("<head>", "<head><head>"), first), BUILT.replace("<head>", "<head><head>"), "one head");
});

test("only the list's own first page is drawn: a search, filter or order asks for other cards", () => {
  assert.equal(asksFirstPage(new URL("https://weave.example/api/initiatives-page")), true);
  assert.equal(asksFirstPage(new URL("https://weave.example/api/initiatives-page?utm_source=x")), true);
  for (const query of ["q=water", "organizationType=ngo", "workScope=restoration", "sort=name", "q="])
    assert.equal(asksFirstPage(new URL(`https://weave.example/api/initiatives-page?${query}`)), false, query);
});

const ORIGIN = "https://weave.example";
function handler(firstPage: () => Promise<PublicProjectPage>, { template = async () => BUILT, fallback = async () => "<html><head></head><body><div id=\"root\"></div></body></html>", lookupTimeoutMs = 50 } = {}) {
  let asked = 0;
  const serve = createInitiativesPageHandler({ template, fallback, firstPage: () => { asked += 1; return firstPage(); }, lookupTimeoutMs });
  return { serve, asked: () => asked };
}

test("the page goes with its cards, cached at the CDN, and with the build's skeleton when the list cannot answer in time", async () => {
  const { serve } = handler(async () => page([card(1)]));
  const drawn = await serve(new Request(`${ORIGIN}/api/initiatives-page`));
  assert.equal(drawn.status, 200);
  assert.match(drawn.headers.get("content-type") ?? "", /^text\/html/u);
  assert.match(drawn.headers.get("cdn-cache-control") ?? "", /max-age=300/u);
  assert.match(await drawn.text(), /Watershed circle 1/u);
  // A failing list, or one slower than the deadline, never holds the page: it goes as the build drew it, uncached.
  for (const firstPage of [() => Promise.reject(Error("down")), () => new Promise<PublicProjectPage>(() => {})]) {
    const started = Date.now();
    const response = await handler(firstPage).serve(new Request(`${ORIGIN}/api/initiatives-page`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), BUILT);
    assert.ok(Date.now() - started < 1000, "within the deadline");
  }
  assert.ok(LIST_LOOKUP_TIMEOUT_MS <= 1000, "a short wait, stated");
  // A list that answers but is off or empty leaves the page as the build drew it, and that is not kept either.
  for (const answer of [page([], { status: "off", checkedAt: null, total: 0 }), page([], { total: 0 })]) {
    const left = await handler(async () => answer).serve(new Request(`${ORIGIN}/api/initiatives-page`));
    assert.deepEqual([left.status, left.headers.get("cache-control"), left.headers.get("cdn-cache-control"), await left.text()], [200, "no-store", null, BUILT]);
  }
  // Cards that cannot be drawn (here a date that is no date) leave the page as the build drew it, not an error.
  const broken = { ...page([card(1)]) };
  broken.projects = [{ ...broken.projects[0]!, sharedAt: "not a date" }];
  const unbroken = await handler(async () => broken).serve(new Request(`${ORIGIN}/api/initiatives-page`));
  assert.deepEqual([unbroken.status, unbroken.headers.get("cache-control"), await unbroken.text()], [200, "no-store", BUILT]);
});

test("an address with a search gets the build's page and no lookup; a missing page falls back; other methods are refused", async () => {
  const searching = handler(async () => page([card(1)]));
  const response = await searching.serve(new Request(`${ORIGIN}/api/initiatives-page?q=water`));
  assert.equal(await response.text(), BUILT);
  assert.equal(searching.asked(), 0, "no lookup for cards the page will not draw");
  // The build's list page cannot be read: the app's own page goes, with no head of its own, uncached.
  const fallback = await handler(async () => page([card(1)]), { template: () => Promise.reject(Error("ENOENT")) })
    .serve(new Request(`${ORIGIN}/api/initiatives-page`));
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  assert.match(await fallback.text(), /<div id="root"><\/div>/u);
  const outage = await handler(async () => page([card(1)]), { template: () => Promise.reject(Error("x")), fallback: () => Promise.reject(Error("y")) })
    .serve(new Request(`${ORIGIN}/api/initiatives-page`));
  assert.deepEqual([outage.status, outage.headers.get("retry-after")], [503, "5"]);
  const head = await handler(async () => page([card(1)])).serve(new Request(`${ORIGIN}/api/initiatives-page`, { method: "HEAD" }));
  assert.deepEqual([head.status, await head.text()], [200, ""]);
  assert.deepEqual([head.headers.get("cache-control"), head.headers.get("cdn-cache-control")], ["no-store", null], "an empty answer is never kept");
  const post = await handler(async () => page([card(1)])).serve(new Request(`${ORIGIN}/api/initiatives-page`, { method: "POST" }));
  assert.deepEqual([post.status, post.headers.get("allow")], [405, "GET, HEAD"]);
});
