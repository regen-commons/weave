import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lint } from "@google/design.md/linter";
import { buildTokens, readDesign, readRamps } from "../scripts/generate-tokens.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const designSource = read("DESIGN.md");
const { design } = readDesign(designSource);
const tokens = JSON.parse(read("packages/design-system/tokens/tokens.generated.json"));
const tokensCss = read("packages/design-system/tokens/tokens.generated.css");

const CSS_FILES = ["base", "atoms", "molecules", "organisms", "templates"].map((name) => `packages/design-system/css/${name}.css`);
const LIBRARY_CSS = "packages/design-system/patterns/library.css";
const PAGE_NAMES = readdirSync(join(ROOT, "packages/design-system/patterns/pages")).filter((file) => file.endsWith(".html"));
const PAGES = Object.fromEntries(PAGE_NAMES.map((file) => [file.replace(".html", ""), read(`packages/design-system/patterns/pages/${file}`)]));
const LIBRARY = read("packages/design-system/patterns/index.html");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const classesIn = (html) => new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)).filter((name) => name.startsWith("rc-")));
const cssClasses = () => new Set(CSS_FILES.flatMap((file) => [...stripComments(read(file)).matchAll(/\.(rc-[a-z0-9-]+)/g)].map((match) => match[1])));

function walk(dir, predicate) {
  return readdirSync(join(ROOT, dir)).filter((name) => name !== "node_modules").flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) return walk(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

const channel = (value) => {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(clean.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("generated tokens match DESIGN.md", () => {
  const { css, json } = buildTokens(designSource);
  assert.equal(tokensCss, css, "Run: bun run design:tokens");
  assert.equal(read("packages/design-system/tokens/tokens.generated.json"), json, "Run: bun run design:tokens");
});

test("DESIGN.md and the dialects pass the DesignMD linter with no warnings", () => {
  const files = ["DESIGN.md", ...walk("packages/design-system/dialects", (path) => path.endsWith(".md") && !path.endsWith("README.md"))];
  for (const file of files) {
    const report = lint(read(file));
    assert.deepEqual(report.findings.filter((finding) => finding.severity !== "info"), [], file);
  }
});

test("every colour token comes from the ramp table", () => {
  const ramps = readRamps(designSource);
  for (const [name, value] of Object.entries(design.colors)) {
    if (value.startsWith("{")) continue;
    assert.equal(value, ramps[name], `${name} must match the ramp table in DESIGN.md`);
  }
});

test("website token values are preserved under their website names", () => {
  const source = read("packages/design-system/source/website-design-tokens.css");
  const blocks = [...stripComments(source).matchAll(/(:root|\[data-theme="light"\])\s*\{([\s\S]*?)\}/g)];
  const parse = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  const [layout, dark, light] = blocks.map((block) => parse(block[2]));
  const normal = (value) => String(value).toLowerCase().replace(/\s+/g, "").replace(/0?\.(\d)0\)/, ".$1)");
  // The token file's dim ink fails contrast. Public pages override it, and the override became the token (DL-003).
  const publicOverride = { dark: { "ink-dim": "#A49A87" }, light: { "ink-dim": "#5D503B" } };
  for (const [theme, values] of [["dark", dark], ["light", light]]) {
    for (const [name, value] of Object.entries(values)) {
      const expected = publicOverride[theme][name] ?? value;
      assert.equal(normal(tokens.themes[theme][name]), normal(expected), `${theme} --${name}`);
    }
  }
  for (const name of ["font-serif", "font-display", "font-sans"]) {
    assert.equal(tokens.shared[name].split(",")[0].replaceAll("'", ""), layout[name].split(",")[0].replaceAll("'", ""), `--${name} keeps its family`);
  }
  assert.equal(tokens.shared["font-mono"], layout["font-mono"]);
  assert.equal(tokens.spacing.pad, layout.pad);
  assert.equal(tokens.sizes["card-radius"], "var(--radius-sm)");
  assert.equal(design.rounded.sm, layout["card-radius"]);
});

for (const theme of ["light", "dark"]) {
  const roles = tokens.themes[theme];

  test(`${theme} theme: text meets 4.5:1 on every surface`, () => {
    for (const surface of ["surface", "surface-raised", "surface-overlay", "surface-tint", "field"]) {
      const text = [`on-${surface}`, "text-secondary", "text-muted", "text-accent", "text-danger", "link", "link-hover", "link-visited"];
      for (const role of text) {
        const ratio = contrast(roles[role], roles[surface]);
        assert.ok(ratio >= 4.5, `${role} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme} theme: filled pairs meet 4.5:1`, () => {
    const pairs = Object.keys(roles).filter((name) => name.startsWith("on-")).map((name) => name.slice(3));
    assert.ok(pairs.length >= 15);
    for (const pair of pairs) {
      const ratio = contrast(roles[`on-${pair}`], roles[pair]);
      assert.ok(ratio >= 4.5, `on-${pair} on ${pair} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${theme} theme: boundaries, focus and state marks meet 3:1 on every surface`, () => {
    const marks = ["control-line", "focus", "state-success", "state-warning", "state-danger", "state-info", "stage-seed", "stage-sprout", "stage-flowering", "stage-tree", "action"];
    for (const surface of ["surface", "surface-raised", "surface-overlay", "surface-tint"]) {
      for (const mark of marks) {
        const ratio = contrast(roles[mark], roles[surface]);
        assert.ok(ratio >= 3, `${mark} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme} theme: raised cards are lighter than the page`, () => {
    assert.ok(luminance(roles["surface-raised"]) > luminance(roles.surface));
  });
}

test("CSS uses tokens instead of raw values", () => {
  for (const file of [...CSS_FILES, LIBRARY_CSS]) {
    const css = stripComments(read(file));
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b(?![\w-]*\s*\{)/, `${file} has a hex colour`);
    assert.doesNotMatch(css, /\b(?:rgba?|hsla?|oklch|oklab|hwb)\(\s*\d/, `${file} has a raw colour`);
    const withoutHidden = css.replace(/\.rc-visually-hidden\s*\{[\s\S]*?\}/, "");
    assert.doesNotMatch(withoutHidden, /\b\d+(?:\.\d+)?px\b/, `${file} has a raw pixel value`);
    for (const match of css.matchAll(/\b(font-size|border-radius|box-shadow|font):\s*([^;]+);/g)) {
      const [, property, value] = match;
      if (value.trim() === "inherit" || value.trim() === "none") continue;
      assert.match(value, /var\(--/, `${file}: ${property}: ${value} must use a token`);
    }
    for (const match of css.matchAll(/\b(?:padding|margin|gap)(?:-[a-z-]+)?:\s*([^;]+);/g)) {
      assert.doesNotMatch(match[1], /\b(?!0\b)\d+(?:\.\d+)?r?em\b/, `${file}: ${match[0]} must use a spacing token`);
    }
  }
});

test("every custom property used is defined", () => {
  const defined = new Set([...tokensCss.matchAll(/--([\w-]+):/g)].map((match) => match[1]));
  const sources = [...CSS_FILES, LIBRARY_CSS].map(read).concat(LIBRARY, Object.values(PAGES));
  for (const source of sources) for (const match of stripComments(source).matchAll(/--([\w-]+):/g)) defined.add(match[1]);
  for (const source of sources) {
    for (const match of source.matchAll(/var\(--([\w-]+)/g)) assert.ok(defined.has(match[1]), `--${match[1]} is not defined`);
  }
});

test("every class is defined, documented and shown", () => {
  const defined = cssClasses();
  const used = classesIn([LIBRARY, ...Object.values(PAGES)].join("\n"));
  assert.deepEqual([...defined].filter((name) => !used.has(name)), [], "CSS classes with no example");
  assert.deepEqual([...used].filter((name) => !defined.has(name)), [], "Classes used without CSS");
  const inventory = read("packages/design-system/COMPONENTS.md");
  const documented = [...inventory.matchAll(/`(rc-[a-z0-9-]+)`/g)].map((match) => match[1]);
  for (const name of documented) assert.ok(defined.has(name), `COMPONENTS.md lists ${name}, which has no CSS`);
  for (const name of defined) assert.ok(documented.some((doc) => name === doc || name.startsWith(`${doc}-`)), `${name} is not documented`);
});

test("the inventory's lineage and status match the example pages", () => {
  const inventory = read("packages/design-system/COMPONENTS.md");
  const rows = [...inventory.matchAll(/^\| [^|]+ \| `(rc-[a-z0-9-]+)` \| (stable|candidate|deprecated) \|.*\| ([^|]+) \|$/gm)];
  assert.ok(rows.length > 40, "Expected the pattern tables to parse");
  const sectionOf = (index) => [...inventory.slice(0, index).matchAll(/^## (\w+)/gm)].at(-1)[1];
  for (const row of rows) {
    const [, name, status, usedIn] = row;
    const actual = Object.entries(PAGES).filter(([, html]) => classesIn(html).has(name)).map(([page]) => page).sort();
    const listed = usedIn.trim() === "library only" ? [] : usedIn.trim().split(", ").sort();
    assert.deepEqual(listed, actual, `${name} used-in column`);
    if (status === "stable" && sectionOf(row.index) !== "Atoms") assert.ok(actual.length >= 2, `${name} is stable with fewer than two uses`);
  }
});

test("example pages use plain copy and honest controls", () => {
  const banned = /create (?:an|your) account|sign up|\bregister\b|log in|hurry|don'?t miss|limited time|last chance|\bstreak|leaderboard|countdown|lorem ipsum/i;
  for (const [page, html] of Object.entries({ ...PAGES, library: LIBRARY })) {
    const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, banned, page);
    assert.doesNotMatch(text, /—/, `${page} has an em dash`);
    assert.doesNotMatch(text, /→|·/, `${page} has an arrow or a middle dot`);
  }
  for (const [page, html] of Object.entries(PAGES)) {
    assert.match(html, /<html lang="/, `${page} sets a language`);
    assert.match(html, /<meta name="color-scheme" content="light dark">/, `${page} declares both themes`);
    assert.match(html, /rc-skip-link/, `${page} has a skip link`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page} has one page title`);
    assert.doesNotMatch(html, /type="checkbox"[^>]*\bchecked\b/, `${page} pre-checks a box`);
    for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
      const tag = match[0];
      if (/type="(radio|checkbox)"/.test(tag)) {
        assert.ok(html.slice(0, match.index).lastIndexOf("<label") > html.slice(0, match.index).lastIndexOf("</label"), `${page}: ${tag} is not inside a label`);
        continue;
      }
      const id = /\bid="([^"]+)"/.exec(tag)?.[1];
      assert.ok(id && html.includes(`for="${id}"`), `${page}: ${tag} has no visible label`);
      assert.doesNotMatch(tag, /placeholder=/, `${page}: hints go above the control`);
    }
    for (const match of html.matchAll(/<button\b[^>]*>/g)) assert.match(match[0], /type="/, `${page}: ${match[0]} needs a type`);
    assert.equal((html.match(/<svg(?![^>]*aria-hidden="true")/g) ?? []).length, 0, `${page}: decorative icons are hidden from assistive technology`);
  }
});

test("each focused region has at most one primary action", () => {
  for (const [page, html] of Object.entries(PAGES)) {
    const regions = html.split(/<(?:section|article|aside|form)\b/);
    for (const region of regions) {
      const primaries = region.match(/data-variant="primary"/g) ?? [];
      assert.ok(primaries.length <= 1, `${page} has two primary actions in one region`);
    }
  }
});

test("fonts, licenses and icons referenced by the system exist", () => {
  const fontsCss = read("packages/design-system/fonts/fonts.css");
  for (const match of fontsCss.matchAll(/url\("\.\/([^"]+)"\)/g)) assert.ok(existsSync(join(ROOT, "packages/design-system/fonts", match[1])), match[1]);
  for (const family of ["fraunces", "source-serif-4", "space-grotesk"]) assert.ok(existsSync(join(ROOT, `packages/design-system/fonts/${family}-OFL.txt`)), family);
  const icons = new Set([...read("packages/design-system/brand/icons.svg").matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
  for (const html of [LIBRARY, ...Object.values(PAGES)]) {
    for (const match of html.matchAll(/icons\.svg#([\w-]+)/g)) assert.ok(icons.has(match[1]), `Missing icon: ${match[1]}`);
  }
});

test("design documents have working relative links and no em dashes", () => {
  const docs = ["DESIGN.md", ...walk("packages/design-system", (path) => path.endsWith(".md")), "docs/platform/07-agent-scaffolding.md", "docs/platform/08-accounts-and-saving.md", "docs/platform/open-decisions.md"];
  // GitHub's heading anchors, as scripts/quality/check-guidance.mjs computes them.
  const slug = (heading) => heading.replace(/\s+#+\s*$/, "").trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
  for (const doc of docs) {
    const text = read(doc);
    assert.doesNotMatch(text, /—/, `${doc} has an em dash`);
    const body = text.replace(/```[\s\S]*?```/g, "");
    for (const match of body.matchAll(/\]\((?!https?:|mailto:)([^)\s]+)\)/g)) {
      const [path, anchor] = match[1].split("#");
      const target = path ? resolve(dirname(join(ROOT, doc)), path) : join(ROOT, doc);
      assert.ok(existsSync(target), `${doc} links to a missing file: ${match[1]}`);
      if (anchor && target.endsWith(".md")) {
        const headings = [...readFileSync(target, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map((heading) => slug(heading[1]));
        assert.ok(headings.includes(anchor), `${doc} links to a missing heading: ${match[1]}`);
      }
    }
  }
});
