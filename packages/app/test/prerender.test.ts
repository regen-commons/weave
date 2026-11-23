import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FIRST_VIEWS, PAGE_MODULES, RESULT_MARK, pageChunks, readFirstViews, scriptsAfterFirstPaint, unlistedPage, withFirstView, withModuleHints } from "../dev/prerender.ts";
import { LINK_PREVIEWS, previewFile, withPreview } from "../dev/link-previews.ts";
import { ROUTES } from "../src/routes.ts";

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <title>Weave</title>
    <script type="module" crossorigin src="/assets/index-a1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/shared-b2.js">
    <link rel="stylesheet" crossorigin href="/assets/index-c3.css">
    <link rel="preload" href="/assets/face-d4.woff2" as="font" type="font/woff2" crossorigin>
    <script src="/theme-boot.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

test("every address with a page of its own and no changing part is drawn, each into the file the server sends for it", () => {
  assert.deepEqual(FIRST_VIEWS.find((view) => view.path === "/"), { path: "/", file: "index.html" });
  assert.deepEqual(FIRST_VIEWS.find((view) => view.path === "/funding"), { path: "/funding", file: "funding/index.html" });
  // GET /initiatives draws the first cards into the list's page, so it is not at the list's address.
  assert.deepEqual(FIRST_VIEWS.find((view) => view.path === "/initiatives"), { path: "/initiatives", file: "share/initiatives.html" });
  assert.deepEqual(FIRST_VIEWS.find((view) => view.path === "/start/needs"), { path: "/start/needs", file: "start/needs/index.html" });
  assert.equal(FIRST_VIEWS.some((view) => view.path.includes(":")), false, "records and workspaces are drawn in the browser");
  assert.equal(FIRST_VIEWS.length, ROUTES.filter((route) => !route.path.includes(":")).length);
});

test("the first view goes into the empty root, marked with its address and inert until the app replaces it", () => {
  const page = withFirstView(PAGE, "/funding", "<p>Funding $& $1</p>");
  assert.match(page, /<div id="root" data-first-view="\/funding" inert><p>Funding \$& \$1<\/p><\/div>/u);
  assert.throws(() => withFirstView(page, "/funding", "<p>again</p>"), /exactly one empty/u);
  assert.throws(() => withFirstView(PAGE, "/funding", "  "), /came out empty/u);
});

test("the stylesheet, fonts and theme script come before the app's script, which waits for the page anyway", () => {
  const page = scriptsAfterFirstPaint(PAGE);
  const order = ["index-c3.css", "face-d4.woff2", "theme-boot.js", "index-a1.js", "shared-b2.js"].map((file) => page.indexOf(file));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(order.every((at) => at !== -1));
  assert.ok(page.indexOf("shared-b2.js") < page.indexOf("</head>"));
  assert.equal(scriptsAfterFirstPaint(page), page, "already in order");
});

test("only the drawing process's result line is read, and every address must have a view", () => {
  const output = `vite says hello\n${RESULT_MARK}${JSON.stringify({ "/": "<p>Home</p>" })}\n`;
  assert.deepEqual(readFirstViews(output, ["/"]), { "/": "<p>Home</p>" });
  assert.throws(() => readFirstViews(output, ["/", "/funding"]), /No first view was drawn for \/funding/u);
  assert.throws(() => readFirstViews("nothing", ["/"]), /were not drawn/u);
});

test("the addresses with no link preview of their own are a person's pages and the steps, and search engines leave them out", () => {
  const previewed = new Set(LINK_PREVIEWS.map(previewFile));
  const unlisted = FIRST_VIEWS.filter((view) => !previewed.has(view.file)).map((view) => view.path).sort();
  assert.deepEqual(unlisted, ["/partners", "/settings", "/start/needs", "/start/new", "/start/offers", "/your-initiative"]);
  const home = withPreview(PAGE.replace("<title>Weave</title>", '<title>Weave</title>\n    <meta name="description" content="x">'), LINK_PREVIEWS[0]!);
  const page = unlistedPage(home);
  assert.match(page, /<meta name="robots" content="noindex">/u);
  assert.doesNotMatch(page, /rel="canonical"|application\/ld\+json/u);
  assert.match(home, /rel="canonical"/u, "Home itself keeps its canonical link");
});

test("each route's page module is the one App.tsx loads for it", () => {
  const app = readFileSync(fileURLToPath(new URL("../src/App.tsx", import.meta.url)), "utf8");
  for (const [route, module] of Object.entries(PAGE_MODULES)) {
    assert.ok(app.includes(`import("./pages/${module}")`), `${route}: ${module}`);
  }
});

test("a page names its own files that the app's script does not bring, and no other page's", () => {
  const chunk = (fileName: string, imports: string[], extra: { isEntry?: boolean; facade?: string } = {}) =>
    [fileName, { type: "chunk" as const, fileName, isEntry: extra.isEntry ?? false, facadeModuleId: extra.facade ?? null, imports }] as const;
  const bundle = Object.fromEntries([
    chunk("assets/index.js", ["assets/react.js", "assets/shared.js"], { isEntry: true, facade: "/r/src/main.tsx" }),
    chunk("assets/react.js", []),
    chunk("assets/shared.js", []),
    chunk("assets/Funding.js", ["assets/shared.js", "assets/cards.js"], { facade: "/r/src/pages/Funding.tsx" }),
    chunk("assets/cards.js", ["assets/tag.js"]),
    chunk("assets/tag.js", []),
    chunk("assets/Home.js", ["assets/hero.js"], { facade: "/r/src/pages/Home.tsx" }),
    chunk("assets/hero.js", []),
    ["assets/index.css", { type: "asset" as const }],
  ]);
  assert.deepEqual(pageChunks(bundle, "Funding.tsx"), ["assets/Funding.js", "assets/cards.js", "assets/tag.js"]);
  assert.deepEqual(pageChunks(bundle, "Home.tsx"), ["assets/Home.js", "assets/hero.js"]);
  assert.throws(() => pageChunks(bundle, "Settings.tsx"), /No built chunk for Settings\.tsx/u);
  const page = withModuleHints(PAGE, ["assets/Home.js"], "/");
  assert.match(page, /<link rel="modulepreload" crossorigin href="\/assets\/Home\.js">\n  <\/head>/u);
  assert.equal(withModuleHints(PAGE, [], "/"), PAGE);
});
