import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_ORIGIN, withPagePreview, type PagePreview } from "./page-preview.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";
import { FIRST_VIEW_SUMMARY_MAX, RECORD_FIRST_VIEW_ID, withRecordFirstView, type RecordFirstView } from "./record-first-view.ts";
import { createRecordPageHandler, parseRecordPreviews } from "./record-page-http.ts";

const URI = "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/3n2t7jfkyl72j";
const SLUG = "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j";
const EMPTY_ROOT = '<div id="root"></div>';

const home: PagePreview = {
  title: "Weave", description: "Describe your initiative once.", url: `${PUBLIC_ORIGIN}/`,
  image: `${PUBLIC_ORIGIN}/share/home.png`, imageAlt: "Weave, part of Regen Commons.",
};
const shell = (root = EMPTY_ROOT) => withPagePreview(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="description" content="Weave.">
    <title>Weave</title>
  </head>
  <body>
    ${root}
  </body>
</html>`, home);
const section = (name: string): PagePreview => ({
  title: `${name} | Weave`, description: `${name} on Weave.`, url: `${PUBLIC_ORIGIN}/${name.toLowerCase()}`,
  image: `${PUBLIC_ORIGIN}/share/${name.toLowerCase()}.png`, imageAlt: `${name}.`,
});
const previews = parseRecordPreviews({
  sections: { funding: section("Funding"), initiatives: section("Initiatives") },
  crumbs: { funding: { trail: [{ label: "Funding", href: "/funding" }], current: "Opportunity" }, initiatives: { trail: [{ label: "Initiatives", href: "/initiatives" }], current: "Initiative" } },
  pages: [`${PUBLIC_ORIGIN}/`],
  funds: {
    "local-people-powered": {
      name: "People Powered", description: "Participatory climate policy training & <b>implementation</b> funding.",
      programs: [{ id: "people-powered-cda-2027", name: "Climate Democracy Accelerator: March 2027 cohort" }],
    },
    quiet: { name: "Quiet Fund", description: "", programs: [] },
  },
});
const hostile = `Forest </script><script>alert(1)</script> & "roots" \u2028 <!-- end`;
// Spaces are made single in a heading and a summary, as in a preview; the line separator is one of them.
const flat = hostile.replace(/\s+/gu, " ");
const card: PublicProjectCard = {
  uri: URI, name: hostile,
  passages: [`First words ${hostile}`, "Second words."],
  sharedAt: "2026-11-21T13:30:53.072000Z", checkedAt: "2026-11-22T04:18:29.205000Z",
  sourceUrl: "https://api.hypercerts.dev/xrpc/x", publisher: "Matt",
};
const handler = (over: Partial<Parameters<typeof createRecordPageHandler>[0]> = {}) => createRecordPageHandler({
  template: async () => shell(), previews: async () => previews, project: async (uri) => (uri === URI ? card : null), ...over,
});
const get = async (search: string, h = handler(), method = "GET") => h(new Request(`${PUBLIC_ORIGIN}/api/record-page${search}`, { method }));

/** The page's root as the browser reads it, the view's words and the JSON beside them. */
function root(html: string) {
  const open = html.indexOf('<div id="root"');
  const json = new RegExp(`<script type="application/json" id="${RECORD_FIRST_VIEW_ID}">([^<]*)</script>`).exec(html)?.[1];
  return {
    tag: /<div id="root"[^>]*>/.exec(html.slice(open))?.[0],
    heading: /<h1 class="rc-heading" data-size="page">([^<]*)<\/h1>/.exec(html)?.[1],
    summary: /<p class="rc-prose">([^<]*)<\/p>/.exec(html)?.[1],
    words: json === undefined ? undefined : JSON.parse(json) as unknown,
    scripts: html.match(/<script/g)?.length ?? 0,
  };
}

test("a fund's page arrives with its heading and summary where the app draws them, and their words for the app", async () => {
  const response = await get("?kind=funding&id=local-people-powered&program=people-powered-cda-2027");
  assert.equal(response.status, 200);
  const html = await response.text();
  const page = root(html);
  assert.equal(page.tag, '<div id="root" data-first-view="/funding/local-people-powered">');
  assert.equal(page.heading, "Climate Democracy Accelerator: March 2027 cohort");
  assert.equal(page.summary, "Participatory climate policy training &amp; &lt;b&gt;implementation&lt;/b&gt; funding.");
  assert.deepEqual(page.words, {
    path: "/funding/local-people-powered", program: "people-powered-cda-2027",
    title: "Climate Democracy Accelerator: March 2027 cohort",
    summary: "Participatory climate policy training & <b>implementation</b> funding.",
  });
  // On a wide screen the app's breadcrumbs sit above the heading, so the view draws them too, as links.
  assert.ok(html.includes('<main class="rc-main"><nav class="rc-breadcrumbs" aria-label="Breadcrumb" data-from="wide"><ol><li><a href="/funding">Funding</a></li><li aria-current="page">Opportunity</li></ol></nav><div class="rc-narrow"><h1'));
  // The line a loaded fund shows under its heading keeps its room, unseen and unread, so the summary does not move.
  assert.match(html, /<\/h1><p class="rc-card-meta" aria-hidden="true"><span class="rc-skeleton" data-shape="hold">[^<]+<\/span><\/p><p class="rc-prose">/);
  // The program the address asked for is the one the words are for: none asked, none named.
  const first = root(await (await get("?kind=funding&id=local-people-powered")).text());
  assert.equal((first.words as { program: unknown }).program, null);
  assert.equal(first.heading, "Climate Democracy Accelerator: March 2027 cohort", "the fund's first program, as the app opens");
  // A fund with no words of its own has a heading and no summary.
  const quiet = root(await (await get("?kind=funding&id=quiet")).text());
  assert.deepEqual([quiet.heading, quiet.summary, (quiet.words as { summary: unknown }).summary], ["Quiet Fund", undefined, ""]);
});

test("a member's words are text in the view and data in the JSON, never markup or script", async () => {
  const html = await (await get(`?kind=initiative&id=${SLUG}`)).text();
  const page = root(html);
  assert.equal(page.tag, `<div id="root" data-first-view="/initiatives/${SLUG}">`);
  assert.equal(page.heading, "Forest &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;roots&quot; &lt;!-- end");
  assert.ok(page.summary?.startsWith("First words Forest &lt;/script&gt;"), "the first passage, as the app shows first");
  // The page's scripts are its JSON-LD and the view's JSON, and no word opens or closes another.
  assert.equal(page.scripts, 2);
  assert.deepEqual(html.match(/<script[^>]*>/g), ['<script type="application/ld+json">', `<script type="application/json" id="${RECORD_FIRST_VIEW_ID}">`]);
  assert.equal(html.match(/<\/script>/g)?.length, 2);
  assert.ok(!html.includes("<!-- end") && !html.includes("\u2028"), "no comment opens and no line separator is left raw");
  assert.deepEqual(page.words, { path: `/initiatives/${SLUG}`, program: null, title: flat, summary: `First words ${flat}` });
});

test("a record that is not there, or not looked up, has no first view, and the app draws the page as before", async () => {
  for (const search of ["?kind=funding&id=nope", "?kind=funding&id=local-people-powered&program=other", "?kind=other&id=x"]) {
    const html = await (await get(search)).text();
    assert.ok(html.includes(EMPTY_ROOT) && !html.includes("data-first-view") && !html.includes(RECORD_FIRST_VIEW_ID), search);
  }
  const missing = await (await get(`?kind=initiative&id=${SLUG}`, handler({ project: async () => null }))).text();
  assert.ok(missing.includes(EMPTY_ROOT) && !missing.includes("data-first-view"));
  const down = await (await get(`?kind=initiative&id=${SLUG}`, handler({ project: async () => { throw Error("down"); } }))).text();
  assert.ok(down.includes(EMPTY_ROOT) && !down.includes("data-first-view"));
  // HEAD carries no body at all.
  assert.equal(await (await get("?kind=funding&id=local-people-powered", handler(), "HEAD")).text(), "");
});

test("a page whose root is not the shell's one empty root goes as it came", async () => {
  // Home's own first view, as index.html will carry it, is left for the app to clear.
  const homeView = '<div id="root" data-first-view="/" inert><main><h1>Home</h1></main></div>';
  const html = await (await get("?kind=funding&id=local-people-powered", handler({ template: async () => shell(homeView) }))).text();
  assert.ok(html.includes(homeView) && !html.includes(RECORD_FIRST_VIEW_ID));
  assert.ok(html.includes(`<link rel="canonical" href="${PUBLIC_ORIGIN}/funding/local-people-powered?program=people-powered-cda-2027">`), "the head is still the record's");
  // Two empty roots, or none, name no place to draw.
  const view: RecordFirstView = { section: "funding", crumbs: previews.crumbs.funding, path: "/funding/x", program: null, title: "X", summary: "" };
  for (const page of [`${EMPTY_ROOT}${EMPTY_ROOT}`, "<div id='root'></div>", ""]) assert.equal(withRecordFirstView(page, view), page);
  // Nor is a view drawn for a path no record has, or without a heading.
  for (const bad of [{ path: "/settings" }, { path: "/funding/../x" }, { path: '/funding/x"' }, { title: "  " }])
    assert.equal(withRecordFirstView(EMPTY_ROOT, { ...view, ...bad }), EMPTY_ROOT, JSON.stringify(bad));
});

test("long words are cut at a word to the lengths the app reads", () => {
  const view: RecordFirstView = {
    section: "funding", crumbs: previews.crumbs.funding, path: "/funding/x", program: null, title: "Name", summary: "word ".repeat(2000),
  };
  const json = new RegExp(`id="${RECORD_FIRST_VIEW_ID}">([^<]*)<`).exec(withRecordFirstView(EMPTY_ROOT, view))?.[1];
  const words = JSON.parse(json ?? "null") as { summary: string };
  assert.ok(words.summary.length <= FIRST_VIEW_SUMMARY_MAX && words.summary.endsWith("…"));
});
