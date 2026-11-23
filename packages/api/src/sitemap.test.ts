import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_ORIGIN, type PagePreview } from "./page-preview.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";
import { parseRecordPreviews } from "./record-page-http.ts";
import { createSitemapHandler, sitemapEntries, sitemapXml } from "./sitemap-http.ts";
import { allProjects } from "./sitemap.ts";
import { encodePublicProjectCursor, type PublicProjectPage } from "./public-projects-contract.ts";

const section = (name: string): PagePreview => ({
  title: `${name} | Weave`, description: `${name} on Weave.`, url: `${PUBLIC_ORIGIN}/${name}`, image: `${PUBLIC_ORIGIN}/share/${name}.png`,
  imageAlt: `${name}. Weave, part of Regen Commons.`,
});
const PREVIEWS = parseRecordPreviews({
  sections: { funding: section("funding"), initiatives: section("initiatives") },
  crumbs: { funding: { trail: [{ label: "Funding", href: "/funding" }], current: "Opportunity" }, initiatives: { trail: [{ label: "Initiatives", href: "/initiatives" }], current: "Initiative" } },
  pages: [`${PUBLIC_ORIGIN}/`, `${PUBLIC_ORIGIN}/initiatives`, `${PUBLIC_ORIGIN}/funding`],
  funds: {
    zeta: { name: "Zeta Fund", description: "", programs: [] },
    alpha: { name: "Alpha & Co", description: "", programs: [{ id: "seed", name: "Seed" }, { id: "grow", name: "Grow" }] },
  },
});
const project = (uri: string, sharedAt = "2026-11-21T13:30:53.072000Z"): PublicProjectCard => ({
  uri, name: "A project", passages: ["Words."], sharedAt, checkedAt: "2026-11-22T04:18:29.205000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri)}`,
});
const PROJECTS = [
  project("at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/3n2t7jfkyl72j"),
  // No Weave address of the shape every listed project has: it has no page, so it is not listed.
  project("at://did:web:example.org/org.hypercerts.collection/3n2t7jfkyl72j"),
];

test("the sitemap lists the public pages and each record at its one address", () => {
  assert.deepEqual(sitemapEntries(PREVIEWS, PROJECTS), [
    { loc: `${PUBLIC_ORIGIN}/` },
    { loc: `${PUBLIC_ORIGIN}/initiatives` },
    { loc: `${PUBLIC_ORIGIN}/funding` },
    // A fund with programs is listed through them, since its bare address opens its first program.
    { loc: `${PUBLIC_ORIGIN}/funding/alpha?program=seed` },
    { loc: `${PUBLIC_ORIGIN}/funding/alpha?program=grow` },
    { loc: `${PUBLIC_ORIGIN}/funding/zeta` },
    { loc: `${PUBLIC_ORIGIN}/initiatives/c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j` },
  ]);
  const xml = sitemapXml([{ loc: `${PUBLIC_ORIGIN}/funding/alpha?program=seed&x=1` }, { loc: `${PUBLIC_ORIGIN}/` }]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes("<loc>https://weave.regencommons.com/funding/alpha?program=seed&amp;x=1</loc>"), "written as XML");
  assert.ok(xml.includes(`<url><loc>${PUBLIC_ORIGIN}/</loc></url>`) && !xml.includes("lastmod"), "no date that does not follow changes");
});

test("the sitemap is served as XML and cached, and goes out without initiatives when the list fails or stalls", async () => {
  const handler = (over: Partial<Parameters<typeof createSitemapHandler>[0]> = {}) =>
    createSitemapHandler({ previews: async () => PREVIEWS, projects: async () => PROJECTS, ...over });
  const get = (h = handler(), method = "GET") => h(new Request(`${PUBLIC_ORIGIN}/api/sitemap`, { method }));
  const whole = await get();
  assert.deepEqual([whole.status, whole.headers.get("content-type"), whole.headers.get("cdn-cache-control")],
    [200, "application/xml; charset=utf-8", "public, max-age=3600, stale-while-revalidate=86400"]);
  assert.equal((await whole.text()).match(/<url>/g)?.length, 7);

  let aborted = false;
  const stalls = (signal: AbortSignal) => new Promise<PublicProjectCard[]>(() => { signal.addEventListener("abort", () => { aborted = true; }); });
  for (const projects of [async () => { throw Error("public_projects_unavailable"); }, stalls]) {
    const started = Date.now();
    const partial = await get(handler({ projects, projectsTimeoutMs: 50 }));
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual([partial.status, partial.headers.get("cdn-cache-control")], [200, "public, max-age=300"]);
    const text = await partial.text();
    assert.equal(text.match(/<url>/g)?.length, 6, "pages and funds still listed");
    assert.ok(!text.includes("/initiatives/"));
  }
  assert.ok(aborted, "a walk past the deadline is told to stop");

  const missing = await get(handler({ previews: async () => { throw Error("missing"); } }));
  assert.deepEqual([missing.status, missing.headers.get("cache-control")], [503, "no-store"]);
  const head = await get(handler(), "HEAD");
  assert.deepEqual([head.status, head.headers.get("content-type"), await head.text()], [200, "application/xml; charset=utf-8", ""]);
  const post = await get(handler(), "POST");
  assert.deepEqual([post.status, post.headers.get("allow")], [405, "GET, HEAD"]);
});

test("the sitemap walks the whole list a page at a time, and never in a circle", async () => {
  const cards = Array.from({ length: 5 }, (_, n) => project(`at://did:plc:${"a".repeat(23)}${"bcdef"[n]}/org.hypercerts.collection/3n2t7jfkyl72j`));
  const cursor = (n: number) => encodePublicProjectCursor({ key: "2026-11-21T13:30:53.072000Z", uri: cards[n]!.uri });
  const pages = (next: (n: number) => string | null, total = cards.length) => async (request: Request) => {
    const asked = new URL(request.url).searchParams.get("cursor");
    const from = asked === null ? 0 : cards.findIndex((card) => cursor(cards.indexOf(card)) === asked) + 1;
    const page: PublicProjectPage = { index: { status: "bounded", checkedAt: null, total }, projects: cards.slice(from, from + 2), next: next(from + 1) };
    return Response.json(page);
  };
  const signal = new AbortController().signal;
  const all = await allProjects(signal, pages((last) => (last < cards.length - 1 ? cursor(last) : null)));
  assert.deepEqual(all.map(({ uri }) => uri), cards.map(({ uri }) => uri));
  // It stops once it has as many as the list counts, whatever the cursor says.
  assert.equal((await allProjects(signal, pages((last) => cursor(Math.min(last, cards.length - 1)), 2))).length, 2);
  // A cursor that comes round again is refused rather than followed for ever.
  await assert.rejects(allProjects(signal, pages(() => cursor(0), 99)), /public_projects_cursor_repeated/);
  await assert.rejects(allProjects(signal, async () => new Response("", { status: 503 })), /public_projects_unavailable/);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(allProjects(stopped.signal, pages(() => null)), /abort/iu);
});
