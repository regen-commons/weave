import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LINK_PREVIEWS,
  previewAddresses,
  previewAlt,
  previewFile,
  previewTags,
  recordPreviews,
  withPreview,
} from "../dev/link-previews.ts";
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";
import { ROUTES } from "../src/routes.ts";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("each section has one link preview, Home's first, with words that fit where they are shown (DL-068)", () => {
  assert.deepEqual(LINK_PREVIEWS.map(({ route }) => route), ["home", "initiatives", "funding", "initiative", "your-initiatives"]);
  assert.equal(new Set(LINK_PREVIEWS.map(({ image }) => image)).size, LINK_PREVIEWS.length);
  for (const preview of LINK_PREVIEWS) {
    const route = ROUTES.find(({ name }) => name === preview.route);
    assert.ok(route && !route.path.includes(":"), `${preview.route} is a page with one address`);
    assert.ok(preview.title.length <= 60, `${preview.route}: a title is cut off after about 60 characters`);
    assert.ok(preview.description.length >= 70 && preview.description.length <= 160, `${preview.route}: description is ${preview.description.length} characters`);
    assert.match(preview.title, /Weave/);
    assert.doesNotMatch(`${preview.title} ${preview.description}`, /[—→·]/, "plain words, as everywhere");
    assert.ok(preview.headline.accent.length === 1 && preview.headline.lines.length >= 1 && preview.headline.lines.length <= 2);
    assert.match(previewAlt(preview), /Weave, part of Regen Commons\.$/);
  }
});

test("every preview's picture exists at the size link previews use", () => {
  for (const preview of LINK_PREVIEWS) {
    const file = new URL(`../public/share/${preview.image}.png`, import.meta.url);
    assert.ok(existsSync(file), `${preview.image}.png: run scripts/share-images/render.mjs`);
    const png = readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "a PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
    assert.ok(png.length < 300_000, `${preview.image}.png is ${png.length} bytes`);
  }
});

test("a preview gives its page and its picture as full addresses on the public site", () => {
  const funding = LINK_PREVIEWS.find(({ route }) => route === "funding")!;
  assert.deepEqual(previewAddresses(funding), { page: `${PUBLIC_ORIGIN}/funding`, image: `${PUBLIC_ORIGIN}/share/funding.png` });
  assert.equal(previewAddresses(LINK_PREVIEWS[0]!).page, `${PUBLIC_ORIGIN}/`);
  const tags = previewTags(funding, "https://example.test").join("\n");
  assert.match(tags, /<meta property="og:url" content="https:\/\/example\.test\/funding">/);
  assert.match(tags, /<meta property="og:image" content="https:\/\/example\.test\/share\/funding\.png">/);
  assert.match(tags, /<meta property="og:image:width" content="1200">/);
  assert.match(tags, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(tags, /<meta property="og:image:type" content="image\/png">/);
  for (const name of ["og:type", "og:site_name", "og:title", "og:description", "og:image:height", "og:image:alt"])
    assert.ok(tags.includes(`property="${name}"`), name);
  // Readers that only know Twitter cards, as Telegram's falls back to, get the same words and picture.
  assert.match(tags, /<meta name="twitter:title" content="Funding \| Weave">/);
  assert.match(tags, /<meta name="twitter:image" content="https:\/\/example\.test\/share\/funding\.png">/);
  for (const name of ["twitter:description", "twitter:image:alt"]) assert.ok(tags.includes(`name="${name}"`), name);
});

test("a copy's preview sits straight after its description, ahead of every script, style and font", () => {
  const funding = LINK_PREVIEWS.find(({ route }) => route === "funding")!;
  // As the build hands it over: scripts, styles and font preloads already in the head.
  const built = index.replace("</head>", `  <script type="module" src="/assets/app.js"></script>\n    <link rel="stylesheet" href="/assets/app.css">\n  </head>`);
  const page = withPreview(built, funding);
  const head = page.slice(0, page.indexOf("</head>"));
  const last = Math.max(...previewTags(funding).map((tag) => head.indexOf(tag)));
  assert.ok(head.indexOf('<meta name="description"') < head.indexOf('property="og:type"'));
  for (const later of ["<script", "<link rel=\"stylesheet\"", "<link rel=\"icon\""])
    assert.ok(last < head.indexOf(later), `the preview comes before ${later}`);
  assert.match(page, /\n {4}<meta property="og:title" content="Funding \| Weave">\n/, "one tag a line, at the head's indent");
});

test("a section's copy of the app's page changes its title, description and preview, and nothing else", () => {
  const funding = LINK_PREVIEWS.find(({ route }) => route === "funding")!;
  const page = withPreview(index, funding);
  assert.match(page, /<title>Funding \| Weave<\/title>/);
  assert.equal(page.match(/<title>/g)?.length, 1);
  assert.equal(page.match(/<meta name="description"/g)?.length, 1);
  assert.ok(page.includes(`<meta name="description" content="${funding.description}">`));
  assert.equal(page.match(/property="og:image"/g)?.length, 1);
  assert.ok(page.indexOf('property="og:title"') < page.indexOf("</head>"), "the tags are in the head");
  // Taking the new head lines away again leaves the page the app is built from.
  const added = previewTags(funding);
  const without = added.reduce((text, tag) => text.replace(new RegExp(`\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), ""), page);
  const restore = (text: string) => text.replace(/<title>[^<]*<\/title>/, "").replace(/<meta name="description" content="[^"]*">/, "").replace(/\s+/g, " ");
  assert.equal(restore(without), restore(index));
});

test("a section's copy is made from the built page, Home's preview and all, whatever else joined it", () => {
  const [home, , funding] = LINK_PREVIEWS as [typeof LINK_PREVIEWS[number], typeof LINK_PREVIEWS[number], typeof LINK_PREVIEWS[number]];
  // A later build step adds its own line after Home's preview is in, as the service worker's does.
  const built = withPreview(index, home).replace("</head>", `  <script id="later" src="/later.js"></script>\n  </head>`);
  const copy = withPreview(built, funding);
  assert.ok(copy.includes('<script id="later" src="/later.js"></script>'), "what joined the page later is kept");
  assert.match(copy, /<title>Funding \| Weave<\/title>/);
  assert.equal(copy.match(/property="og:title"/g)?.length, 1);
  assert.equal(copy.match(/name="twitter:card"/g)?.length, 1);
  assert.ok(!copy.includes(home.description), "none of Home's words are left");
  // Each page names its own address as canonical: Home its own, and a section's copy never Home's.
  assert.equal(built.match(/rel="canonical"/g)?.length, 1);
  assert.ok(built.includes(`<link rel="canonical" href="${PUBLIC_ORIGIN}/">`));
  assert.equal(copy.match(/rel="canonical"/g)?.length, 1);
  assert.ok(copy.includes(`<link rel="canonical" href="${PUBLIC_ORIGIN}/funding">`));
});

test("a person's own page is left out of search: noindex and no canonical, but still a preview", () => {
  const own = LINK_PREVIEWS.find(({ route }) => route === "your-initiatives")!;
  const page = withPreview(index, own);
  assert.ok(page.includes('<meta name="robots" content="noindex">'));
  assert.ok(!page.includes('rel="canonical"'));
  assert.match(page, /<meta property="og:title" content="Your Initiatives \| Weave">/);
  for (const preview of LINK_PREVIEWS.filter(({ indexed }) => indexed !== false))
    assert.ok(!withPreview(index, preview).includes('name="robots"'), `${preview.route} is indexed`);
});

test("the record page function is deployed with the built files it reads", async () => {
  const { RECORD_PREVIEWS_FILE, TEMPLATE_FILES } = await import("@weave/api/record-page-http");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    functions: Record<string, { includeFiles?: string }>; rewrites: { source: string; destination: string }[];
  };
  // The record page runs in the shared router function (23 November 2026), which bundles the files.
  const include = vercel.functions["api/router.ts"]?.includeFiles ?? "";
  const files = /^dist\/\{(.+)\}$/u.exec(include)?.[1]?.split(",") ?? [];
  assert.deepEqual(files.sort(), [...TEMPLATE_FILES, RECORD_PREVIEWS_FILE].sort(), include);
  // The record addresses and the sitemap go to the router, ahead of the rewrite that serves the app.
  const sources = vercel.rewrites.map(({ source }) => source);
  const catchAll = sources.indexOf("/((?!api/).*)");
  for (const [source, destination] of [
    ["/funding/:id", "/api/router?__route=record-page&kind=funding&id=:id"],
    ["/initiatives/:id", "/api/router?__route=record-page&kind=initiative&id=:id"],
    ["/sitemap.xml", "/api/router?__route=sitemap"],
  ] as const) {
    assert.equal(vercel.rewrites.find((candidate) => candidate.source === source)?.destination, destination);
    assert.ok(sources.indexOf(source) < catchAll, `${source} before the catch-all`);
  }
});

test("the build gives each fund's words and the two sections' previews to the record pages", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../dist/data/funders.json", import.meta.url), "utf8")) as { funds: { id: string }[] };
  const previews = recordPreviews(catalog);
  assert.equal(Object.keys(previews.funds).length, catalog.funds.length);
  assert.equal(previews.sections.funding.image, `${PUBLIC_ORIGIN}/share/funding.png`);
  assert.equal(previews.sections.initiatives.url, `${PUBLIC_ORIGIN}/initiatives`);
  const people = previews.funds["local-people-powered"];
  assert.ok(people && people.name && people.programs.length > 0, "a fund with its programs, in the catalog's order");
  assert.deepEqual(previews.pages, [`${PUBLIC_ORIGIN}/`, `${PUBLIC_ORIGIN}/initiatives`, `${PUBLIC_ORIGIN}/funding`, `${PUBLIC_ORIGIN}/start/initiative`],
    "the sitemap's pages: the public sections and describing an initiative, not the person's own");
  assert.ok(JSON.stringify(previews).length < 600_000, "small enough to read on every cold start");
});

test("words with marks that HTML reads are written safely", () => {
  const odd = { ...LINK_PREVIEWS[1]!, title: `Seeds & "soil" <now>`, description: "x".repeat(80) };
  const page = withPreview(index, odd);
  assert.ok(page.includes("<title>Seeds &amp; &quot;soil&quot; &lt;now&gt;</title>"));
  assert.ok(page.includes(`content="Seeds &amp; &quot;soil&quot; &lt;now&gt;"`));
});

test("a page with no title to change, or two, is refused, never half changed", () => {
  const preview = LINK_PREVIEWS[0]!;
  assert.throws(() => withPreview(index.replace(/<title>[^<]*<\/title>/, ""), preview), /Expected one match/);
  assert.throws(() => withPreview(index.replace("</head>", "<title>Again</title></head>"), preview), /Expected one match/);
  assert.throws(() => withPreview("<html></html>", preview), /Expected one match/);
});

test("Home's preview is the app's own page, and each other section's is a file at its address", () => {
  assert.deepEqual(LINK_PREVIEWS.map(previewFile), [
    "index.html",
    "initiatives/index.html",
    "funding/index.html",
    "start/initiative/index.html",
    "your-initiatives/index.html",
  ]);
});
