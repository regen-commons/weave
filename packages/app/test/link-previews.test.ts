import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  LINK_PREVIEWS,
  previewAddresses,
  previewAlt,
  previewFile,
  previewTags,
  withPreview,
  withoutPreview,
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
  for (const name of ["og:type", "og:site_name", "og:title", "og:description", "og:image:height", "og:image:alt"])
    assert.ok(tags.includes(`property="${name}"`), name);
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

test("one section's preview can be taken out again and another's put in, whatever else joined the page", () => {
  const [home, , funding] = LINK_PREVIEWS as [typeof LINK_PREVIEWS[number], typeof LINK_PREVIEWS[number], typeof LINK_PREVIEWS[number]];
  // A later build step adds its own line after Home's preview is in, as the service worker's does.
  const built = withPreview(index, home).replace("</head>", `  <script id="later" src="/later.js"></script>\n  </head>`);
  const copy = withPreview(withoutPreview(built, home), funding);
  assert.ok(copy.includes('<script id="later" src="/later.js"></script>'), "what joined the page later is kept");
  assert.match(copy, /<title>Funding \| Weave<\/title>/);
  assert.equal(copy.match(/property="og:title"/g)?.length, 1);
  assert.ok(!copy.includes(home.description), "none of Home's words are left");
  assert.throws(() => withoutPreview(index, home), /Expected one/, "a page that never had the preview is refused");
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
