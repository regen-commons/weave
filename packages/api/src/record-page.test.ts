import assert from "node:assert/strict";
import test from "node:test";
import { previewLine, previewTags, PUBLIC_ORIGIN, withPagePreview, type PagePreview } from "./page-preview.ts";
import { projectPassages, projectSlug, projectUriOf, type PublicProjectCard } from "./public-projects-contract.ts";
import { createRecordPageHandler, parseRecordPreviews, recordAsk, type RecordPreviews } from "./record-page-http.ts";

const URI = "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/3n2t7jfkyl72j";
const SLUG = "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j";

// The built page as the app's build hands it over: Home's preview after the description, then the assets.
const home: PagePreview = {
  title: "Weave: find partners and funding for regenerative work", description: "Describe your initiative once.",
  url: `${PUBLIC_ORIGIN}/`, image: `${PUBLIC_ORIGIN}/share/home.png`, imageAlt: "Find partners. Weave, part of Regen Commons.",
};
const TEMPLATE = withPagePreview(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="description" content="Find partners and funding for regenerative work.">
    <title>Weave</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`, home);

const section = (name: "funding" | "initiatives", title: string): PagePreview => ({
  title, description: `${title} on Weave.`, url: `${PUBLIC_ORIGIN}/${name}`, image: `${PUBLIC_ORIGIN}/share/${name}.png`,
  imageAlt: `${title}. Weave, part of Regen Commons.`,
});
const PREVIEWS: RecordPreviews = parseRecordPreviews({
  sections: { funding: section("funding", "Funding | Weave"), initiatives: section("initiatives", "Initiatives | Weave") },
  funds: {
    "local-people-powered": {
      name: "People Powered", description: "Participatory climate policy training with conditional implementation funding.",
      programs: { "people-powered-cda-2027": "Climate Democracy Accelerator, March 2027 cohort" },
    },
    recxmWk9XCOOqAGIH: { name: "A Team Foundation (UK)", description: "", programs: {} },
  },
});
const card: PublicProjectCard = {
  uri: URI, name: "Serpentine <Food> Forest",
  passages: ["Rewilding degraded farm land into a self sustaining fo...", "Rewilding degraded farm land into a self sustaining food forest."],
  sharedAt: "2026-11-21T13:30:53.072000Z", checkedAt: "2026-11-22T04:18:29.205000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(URI)}`, publisher: "Matt",
};

const meta = (html: string, key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];
const handler = (over: Partial<Parameters<typeof createRecordPageHandler>[0]> = {}) => createRecordPageHandler({
  template: async () => TEMPLATE, previews: async () => PREVIEWS, project: async (uri) => (uri === URI ? card : null), ...over,
});
const get = (search: string, h = handler()) => h(new Request(`${PUBLIC_ORIGIN}/api/record-page${search}`));

test("a page's preview replaces the one it had, ahead of the assets, with every word written safely", () => {
  const page = withPagePreview(TEMPLATE, { ...home, title: `Seeds & "soil" <now>`, url: `${PUBLIC_ORIGIN}/funding/x` });
  assert.equal(page.match(/property="og:title"/g)?.length, 1, "Home's preview is gone");
  assert.equal(page.match(/name="twitter:image"/g)?.length, 1);
  assert.ok(page.includes("<title>Seeds &amp; &quot;soil&quot; &lt;now&gt;</title>"));
  assert.equal(meta(page, "og:url"), `${PUBLIC_ORIGIN}/funding/x`);
  assert.ok(page.indexOf('property="og:image"') < page.indexOf("<script"), "the preview comes before the scripts");
  assert.equal(previewTags(home).length, 15);
  assert.throws(() => withPagePreview("<html><head></head></html>", home), /Expected one match/);
  assert.equal(previewLine("  a   b "), "a b");
  assert.ok(previewLine("word ".repeat(80)).endsWith("…") && previewLine("word ".repeat(80)).length <= 160);
});

test("a project's address names it back, and its words are said once", () => {
  assert.equal(projectSlug(URI), SLUG);
  assert.equal(projectUriOf(SLUG), URI);
  for (const other of ["at://did:web:example.org/org.hypercerts.collection/3n2t7jfkyl72j", `${URI}/x`, "https://example.org"])
    assert.equal(projectSlug(other), null, other);
  for (const slug of ["orchard", `${SLUG}-x`, SLUG.toUpperCase()]) assert.equal(projectUriOf(slug), null, slug);
  assert.deepEqual(projectPassages(card), ["Rewilding degraded farm land into a self sustaining food forest."]);
});

test("only an address the app could open names a record, and a program only when it is well formed", () => {
  const ask = (search: string) => recordAsk(new URL(`${PUBLIC_ORIGIN}/api/record-page${search}`));
  assert.deepEqual(ask("?kind=funding&id=local-people-powered&program=people-powered-cda-2027"),
    { kind: "funding", id: "local-people-powered", program: "people-powered-cda-2027" });
  assert.deepEqual(ask("?kind=funding&id=recxmWk9XCOOqAGIH&program=%3Cx%3E"), { kind: "funding", id: "recxmWk9XCOOqAGIH", program: null });
  assert.deepEqual(ask(`?kind=initiative&id=${SLUG}`), { kind: "initiative", id: SLUG, uri: URI });
  for (const bad of ["", "?kind=funding", "?kind=funding&id=a/b", "?kind=funding&id=..", "?kind=initiative&id=orchard", "?kind=other&id=x"])
    assert.equal(ask(bad), null, bad);
});

test("a fund, a program and an initiative each get their own words at their own address", async () => {
  const program = await get("?kind=funding&id=local-people-powered&program=people-powered-cda-2027&sort=fit");
  assert.equal(program.status, 200);
  assert.equal(program.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(program.headers.get("cdn-cache-control"), "public, max-age=300, stale-while-revalidate=600");
  const programPage = await program.text();
  assert.equal(meta(programPage, "og:title"), "Climate Democracy Accelerator, March 2027 cohort | Weave");
  assert.equal(meta(programPage, "og:description"), "People Powered: Participatory climate policy training with conditional implementation funding.");
  assert.equal(meta(programPage, "og:url"), `${PUBLIC_ORIGIN}/funding/local-people-powered?program=people-powered-cda-2027`, "no working query");
  assert.equal(meta(programPage, "og:image"), `${PUBLIC_ORIGIN}/share/funding.png`);
  assert.ok(programPage.includes('<script type="module" crossorigin src="/assets/index-abc.js"></script>'), "the same app");

  const fund = await (await get("?kind=funding&id=recxmWk9XCOOqAGIH&program=gone")).text();
  assert.equal(meta(fund, "og:title"), "A Team Foundation (UK) | Weave", "a program this catalog lacks shows its fund");
  assert.equal(meta(fund, "og:description"), "Funding for regenerative work from A Team Foundation (UK).");
  assert.equal(meta(fund, "og:url"), `${PUBLIC_ORIGIN}/funding/recxmWk9XCOOqAGIH`);

  const initiative = await get(`?kind=initiative&id=${SLUG}`);
  assert.equal(initiative.status, 200);
  const initiativePage = await initiative.text();
  assert.equal(meta(initiativePage, "og:title"), "Serpentine &lt;Food&gt; Forest | Weave");
  assert.equal(meta(initiativePage, "og:description"), "Rewilding degraded farm land into a self sustaining food forest.");
  assert.equal(meta(initiativePage, "og:url"), `${PUBLIC_ORIGIN}/initiatives/${SLUG}`);
  assert.equal(meta(initiativePage, "og:image"), `${PUBLIC_ORIGIN}/share/initiatives.png`);
});

test("a record that is not there gets its section's preview with 404, and a failed lookup is tried again", async () => {
  const gone = await get("?kind=funding&id=not-in-catalog");
  assert.equal(gone.status, 404);
  assert.equal(meta(await gone.text(), "og:title"), "Funding | Weave");
  const withdrawn = await get("?kind=initiative&id=vxghsglzk24hbujvq6mvgsp5-3n2r2joirt226");
  assert.equal(withdrawn.status, 404);
  assert.equal(meta(await withdrawn.text(), "og:title"), "Initiatives | Weave");
  const nothing = await get("?kind=initiative&id=orchard");
  assert.equal(nothing.status, 404);
  assert.equal(meta(await nothing.text(), "og:title"), home.title, "the app's own page, unchanged");

  const down = await get(`?kind=initiative&id=${SLUG}`, handler({ project: async () => { throw Error("public_projects_unavailable"); } }));
  assert.deepEqual([down.status, down.headers.get("cache-control"), down.headers.get("cdn-cache-control")], [200, "no-store", null]);
  assert.equal(meta(await down.text(), "og:title"), "Initiatives | Weave");
  const noPreviews = await get("?kind=funding&id=local-people-powered", handler({ previews: async () => { throw Error("missing"); } }));
  assert.deepEqual([noPreviews.status, noPreviews.headers.get("cache-control")], [200, "no-store"]);
  assert.equal(meta(await noPreviews.text(), "og:title"), home.title);
  const oddPage = await get("?kind=funding&id=local-people-powered", handler({ template: async () => "<html>no head</html>" }));
  assert.deepEqual([oddPage.status, oddPage.headers.get("cache-control"), await oddPage.text()], [200, "no-store", "<html>no head</html>"]);
  const noPage = await get("?kind=funding&id=local-people-powered", handler({ template: async () => { throw Error("missing"); } }));
  assert.deepEqual([noPage.status, noPage.headers.get("location"), noPage.headers.get("cache-control")], [307, "/funding", "no-store"]);
  const noPageInitiative = await get(`?kind=initiative&id=${SLUG}`, handler({ template: async () => { throw Error("missing"); } }));
  assert.equal(noPageInitiative.headers.get("location"), "/initiatives", "the list the person was going to see");
  const post = await handler()(new Request(`${PUBLIC_ORIGIN}/api/record-page?kind=funding&id=x`, { method: "POST" }));
  assert.deepEqual([post.status, post.headers.get("allow")], [405, "GET"]);
});

test("the build's record previews are read only as the build writes them", () => {
  const base = { sections: { funding: section("funding", "Funding | Weave"), initiatives: section("initiatives", "Initiatives | Weave") }, funds: {} };
  assert.deepEqual(Object.keys(parseRecordPreviews(base).funds), []);
  for (const bad of [
    null, {}, { ...base, funds: null },
    { ...base, funds: { "a/b": { name: "x", description: "", programs: {} } } },
    { ...base, funds: { a: { name: "", description: "", programs: {} } } },
    { ...base, funds: { a: { name: "x", description: "", programs: { "<p>": "y" } } } },
    { ...base, sections: { ...base.sections, funding: { ...section("funding", "Funding"), image: "https://evil.example/x.png" } } },
  ]) assert.throws(() => parseRecordPreviews(bad), /invalid_record_previews|Invalid URL/u, JSON.stringify(bad));
  // An identifier that names a property every object has is still only a fund the build wrote.
  assert.equal(parseRecordPreviews(base).funds["constructor"], undefined);
});
