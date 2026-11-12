import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FIRST_FACES, builtFontHrefs, devFontHrefs, fontPreloadTags, type BuildBundle } from "../dev/font-preloads.ts";

const fontsCss = fileURLToPath(import.meta.resolve("@regen-commons/design-system/fonts.css"));

function bundle(files: Record<string, string[]>): BuildBundle {
  return Object.fromEntries(Object.entries(files).map(([fileName, originalFileNames]) =>
    [fileName, { type: "asset", fileName, originalFileNames }])) as unknown as BuildBundle;
}

test("every preloaded face is one the design system declares optional, so a preload never causes a swap", () => {
  const css = readFileSync(fontsCss, "utf8");
  for (const face of FIRST_FACES) {
    const rule = css.split("@font-face").find((block) => block.includes(`url("./${face}")`));
    assert.ok(rule, `${face} has no @font-face`);
    assert.match(rule, /font-display: optional;/u, `${face} must not swap`);
  }
});

test("the build preloads each face at the address it emitted, under the configured base", () => {
  const emitted = bundle({
    "assets/index-a1.js": [],
    "assets/space-grotesk-latin-b2.woff2": ["/repo/packages/design-system/fonts/space-grotesk-latin.woff2"],
    "assets/fraunces-latin-c3.woff2": ["/repo/packages/design-system/fonts/fraunces-latin.woff2"],
    "assets/fraunces-italic-latin-d4.woff2": ["/repo/packages/design-system/fonts/fraunces-italic-latin.woff2"],
    "assets/source-serif-4-latin-e5.woff2": ["/repo/packages/design-system/fonts/source-serif-4-latin.woff2"],
  });
  assert.deepEqual(builtFontHrefs(emitted, "/"), [
    "/assets/space-grotesk-latin-b2.woff2",
    "/assets/fraunces-latin-c3.woff2",
    "/assets/fraunces-italic-latin-d4.woff2",
    "/assets/source-serif-4-latin-e5.woff2",
  ]);
});

test("a face the build did not emit stops the build instead of shipping a broken preload", () => {
  const emitted = bundle({ "assets/space-grotesk-latin-b2.woff2": ["/repo/packages/design-system/fonts/space-grotesk-latin.woff2"] });
  assert.throws(() => builtFontHrefs(emitted, "/"), /fraunces-latin\.woff2/u);
});

test("the dev server preloads the files it serves from outside the app's root", () => {
  assert.deepEqual(devFontHrefs("/repo/packages/design-system/fonts/fonts.css", ["fraunces-latin.woff2"]),
    ["/@fs/repo/packages/design-system/fonts/fraunces-latin.woff2"]);
  assert.deepEqual(devFontHrefs("C:\\repo\\packages\\design-system\\fonts\\fonts.css", ["fraunces-latin.woff2"]),
    ["/@fs/C:/repo/packages/design-system/fonts/fraunces-latin.woff2"]);
});

test("each preload is a CORS font preload, so the stylesheet's request reuses it", () => {
  assert.deepEqual(fontPreloadTags(["/assets/fraunces-latin-c3.woff2"]), [{
    tag: "link",
    attrs: { rel: "preload", href: "/assets/fraunces-latin-c3.woff2", as: "font", type: "font/woff2", crossorigin: true },
    injectTo: "head",
  }]);
});
