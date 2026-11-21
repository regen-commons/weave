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
      const text = [`on-${surface}`, "text-secondary", "text-muted", "text-accent", "text-danger", "link", "link-hover", "link-visited", "text-home", "text-initiatives", "text-funding", "text-yours"];
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
    const marks = ["control-line", "focus", "state-success", "state-warning", "state-danger", "state-info", "stage-seed", "stage-sprout", "stage-flowering", "stage-tree", "action", "accent-home", "accent-initiatives", "accent-funding", "accent-yours"];
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

test("the app bars keep their place between pages, above the page's cross-fade (DL-058)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  // A rule inside an at-rule applies at some widths only; the bars must be named at every width.
  const depthAt = (css, index) => [...css.slice(0, index)].reduce((depth, char) => depth + (char === "{") - (char === "}"), 0);
  // The dock stands in for the tab bar on a focused step, so it changes as the bars do (DL-089).
  // A wide screen's step bar sticks under the app bar, so it changes as the bars do too (DL-124).
  for (const [bar, name] of [[".rc-app-header", "rc-app-header"], [".rc-bottom-nav", "rc-bottom-nav"], [".rc-dock", "rc-dock"], [".rc-step-bar", "rc-step-bar"]]) {
    const named = organisms.match(new RegExp(`\\${bar} \\{ view-transition-name: ${name}; \\}`));
    assert.ok(named, `${bar} has its own view transition name`);
    assert.equal(depthAt(organisms, named.index), 0, `${bar} is named at every width`);
    assert.match(organisms, new RegExp(`::view-transition-old\\(${name}\\)[^{]*\\{ display: none; \\}`), `${bar} changes at once`);
    assert.match(organisms, new RegExp(`::view-transition-group\\(${name}\\)[^{]*\\{ z-index: var\\(--layer-sticky\\); animation: none; \\}`),
      `${bar} is drawn above the page`);
  }
  // Any other named part of a page would be drawn over the bars while the page changes.
  const names = CSS_FILES.flatMap((file) => [...stripComments(read(file)).matchAll(/view-transition-name:\s*([a-z-]+)/g)].map((match) => match[1]));
  assert.deepEqual(names.sort(), ["rc-app-header", "rc-bottom-nav", "rc-dock", "rc-step-bar"]);
});

test("a side panel stays beside its page and never traps the wheel (DL-085)", () => {
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const panel = templates.match(/\.rc-step-layout > \.rc-step-aside \{([^}]*)\}/)?.[1] ?? "";
  assert.match(panel, /position: sticky/);
  assert.match(panel, /overflow-y: auto/, "a panel taller than the window scrolls inside itself");
  // Containing the overscroll stops the page under a pointer that rests on a panel with nothing to scroll.
  assert.doesNotMatch(panel, /overscroll-behavior/);
  // The panel sits next to its column: space between the two would grow with the window.
  assert.doesNotMatch(templates.match(/\.rc-step-layout \{[^}]*grid-template-columns[^}]*\}/)?.[0] ?? "", /space-between/);
  // Work that follows the panel on a phone sits under the first column, with the panel beside both.
  assert.match(templates, /\.rc-step-layout:has\(> \.rc-step-main ~ \.rc-step-main\) > \.rc-step-aside \{ grid-row: 1 \/ span 2; \}/);
});

test("every custom property used is defined", () => {
  const defined = new Set([...tokensCss.matchAll(/--([\w-]+):/g)].map((match) => match[1]));
  const sources = [...CSS_FILES, LIBRARY_CSS].map(read).concat(LIBRARY, Object.values(PAGES));
  for (const source of sources) for (const match of stripComments(source).matchAll(/--([\w-]+):/g)) defined.add(match[1]);
  for (const source of sources) {
    for (const match of source.matchAll(/var\(--([\w-]+)/g)) assert.ok(defined.has(match[1]), `--${match[1]} is not defined`);
  }
});

test("a menu opens beside its trigger and never over it, scrolling inside when the window is short", async () => {
  const { blockPlacement } = await import("../behaviors/overlays.js");
  const at = (panelHeight, triggerTop = 380) => blockPlacement({ triggerTop, triggerBottom: triggerTop + 48, panelHeight, windowHeight: 800, gap: 12 });
  assert.deepEqual(at(200), { top: 440, maxBlock: 348 }, "under the trigger when it fits");
  assert.deepEqual(at(350), { top: 380 - 12 - 350, maxBlock: 356 }, "over the trigger when it fits only there");
  assert.deepEqual(at(500, 300), { top: 360, maxBlock: 428 }, "a long menu under a trigger near the top fits whole");
  const long = at(752);
  assert.deepEqual(long, { top: 440, maxBlock: 348 }, "too tall for either side: under the trigger while a few rows fit there");
  assert.ok(long.top >= 428 && long.top + long.maxBlock <= 800, "it starts under its trigger and ends inside the window");
  const low = at(752, 600);
  assert.deepEqual(low, { top: 12, maxBlock: 576 }, "with little room under the trigger it takes the room above");
  assert.ok(low.top + low.maxBlock <= 600, "it ends above the trigger it opened from");
  assert.deepEqual(blockPlacement({ triggerTop: 4, triggerBottom: 796, panelHeight: 300, windowHeight: 800, gap: 12 }).maxBlock, 0, "no room is no height, never a negative one");
});

test("a menu starts at its trigger's edge, or ends at it when asked, and stays inside the window (DL-070)", async () => {
  const { inlinePlacement } = await import("../behaviors/overlays.js");
  const account = { triggerLeft: 1108, triggerRight: 1152, panelWidth: 288, windowWidth: 1280, gap: 12 };
  assert.equal(inlinePlacement({ ...account, align: "end" }), 1152 - 288, "the account's menu ends under its button's edge, at the page's edge");
  assert.equal(inlinePlacement(account), 1280 - 12 - 288, "started at that button it would leave the window, so it is held inside");
  assert.equal(inlinePlacement({ triggerLeft: 200, triggerRight: 300, panelWidth: 288, windowWidth: 1280, gap: 12 }), 200, "a filter's menu starts at its button");
  assert.equal(inlinePlacement({ triggerLeft: 20, triggerRight: 64, panelWidth: 288, windowWidth: 360, gap: 12, align: "end" }), 12, "ending at a button near the start would leave the window too");
  assert.equal(inlinePlacement({ triggerLeft: 300, triggerRight: 344, panelWidth: 348, windowWidth: 360, gap: 12, align: "end" }), 12, "a menu wider than the room keeps its start in view");
  assert.equal(inlinePlacement({ ...account, align: undefined }), inlinePlacement(account), "a panel that asks for nothing starts at its trigger");
});

test("the header's name and sections share a baseline, and are centred where a browser cannot align them (DL-070)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  const lead = organisms.match(/\.rc-app-header-lead \{([^}]*)\}/)?.[1] ?? "";
  const aligns = [...lead.matchAll(/align-items:\s*([^;]+);/g)].map((match) => match[1].trim());
  // Two values on purpose: a browser that does not know the second keeps the first.
  assert.deepEqual(aligns, ["center", "last baseline"], "the fallback comes first, so the baseline wins wherever it is understood");
  assert.match(organisms, /\.rc-app-nav > a \{[^}]*border-block: var\(--border-edge\) solid transparent;/, "a section's box has the same edge above as below, so the fallback centres its word");
  assert.match(organisms, /\.rc-app-header-state \{[^}]*min-block-size: var\(--control-height\);/, "the bar keeps one height whatever its far end holds");
  assert.match(organisms, /@media \(width < 20rem\) \{\s*\.rc-app-header \{ flex-wrap: wrap; \}/, "zoomed to twice its size on a phone, the bar's ends take a line each and never overlap");
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
    // A docked action is in the markup twice and on screen once: in the dock on a phone, and in
    // its place on the page on a wide screen (DL-089). The copy on the page is counted there.
    const dock = /<div class="rc-dock">.*?<\/div>/s.exec(html)?.[0] ?? "";
    const twins = [...html.matchAll(/<[^>]*data-variant="primary"[^>]*data-from="wide"[^>]*>/g)];
    assert.equal(twins.length, dock ? 1 : 0, `${page}: a primary action waits for a wide screen only when the dock holds it on a phone`);
    if (dock) assert.equal((dock.match(/data-variant="primary"/g) ?? []).length, 1, `${page} docks one primary action`);
    const regions = html.replace(dock, "").split(/<(?:section|article|aside|form)\b/);
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

test("hover styles are asked for only where the device hovers, and a press has its own state (DL-087)", () => {
  // Takes out every block of the at-rule, braces matched, so what is left is outside it.
  const without = (css, atRule) => {
    let rest = css;
    for (let start = rest.indexOf(atRule); start !== -1; start = rest.indexOf(atRule)) {
      let depth = 0;
      let end = rest.indexOf("{", start);
      do depth += rest[end] === "{" ? 1 : rest[end] === "}" ? -1 : 0;
      while (depth > 0 && ++end < rest.length);
      rest = rest.slice(0, start) + rest.slice(end + 1);
    }
    return rest;
  };
  for (const file of CSS_FILES) {
    const outside = without(without(stripComments(read(file)), "@media (hover: hover)"), "@media (hover: none)");
    // A selector may still say what is not hovered, as the page's fill under an outlined button does.
    assert.doesNotMatch(outside.replace(/:not\([^{]*\)/g, ""), /:hover/, `${file} has a hover style outside @media (hover: hover)`);
  }
  const base = stripComments(read("packages/design-system/css/base.css"));
  assert.match(base, /-webkit-tap-highlight-color: transparent;\s*touch-action: manipulation;/, "base.css clears the tap flash and the double-tap delay once");
  const atoms = stripComments(read("packages/design-system/css/atoms.css"));
  for (const variant of ["primary", "secondary", "quiet", "danger"])
    assert.ok(atoms.includes(`.rc-button[data-variant="${variant}"]:active:not(:disabled, [aria-busy="true"])`), `a pressed ${variant} button has a state`);
  assert.match(stripComments(read("packages/design-system/css/organisms.css")), /\.rc-bottom-nav > a:active \{/, "a pressed tab has a state");
});

test("a chip's remove button is a full target at the same chip width, and a footer button wraps from the start edge (DL-088)", () => {
  const rule = (file, selector) => {
    const found = stripComments(read(file)).split("}").find((part) => part.slice(0, part.indexOf("{")).trim() === selector);
    assert.ok(found, `${selector} has a rule in ${file}`);
    return found.slice(found.indexOf("{") + 1);
  };
  const atoms = "packages/design-system/css/atoms.css";
  // 44 px is the smallest target, and it is the chip's own height.
  assert.match(tokensCss, /--chip-height: 2\.75rem;/);
  const remove = rule(atoms, ".rc-chip-remove");
  assert.match(remove, /min-inline-size: var\(--chip-height\);/);
  assert.match(remove, /min-block-size: var\(--chip-height\);/);
  // The button takes up the chip's own gap and end padding, so a removable chip is no wider for it.
  const chip = rule(atoms, ".rc-chip");
  assert.match(chip, /gap: var\(--space-2\);/);
  assert.match(chip, /padding-inline: var\(--chip-padding\);/);
  assert.match(remove, /margin-inline: calc\(var\(--space-2\) \* -1\) calc\(var\(--chip-padding\) \* -1\);/);
  assert.ok(stripComments(read(atoms)).includes(".rc-chip-remove:active:not(:disabled) {"), "a pressed remove button has a state");
  // The button starts where the chip's words end, so its ring is drawn inside it and never over them.
  assert.match(rule(atoms, ".rc-chip-remove:focus-visible"), /outline-offset: calc\(var\(--border-edge\) \* -1\);/);
  assert.match(rule("packages/design-system/css/organisms.css", ".rc-footer-link"), /text-align: start;/);
});

test("on a phone a focused step docks its way forward where the tab bar would be (DL-089)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const phone = (css) => css.split("@media (width < 56.25rem) {").slice(1).join("\n");
  // Not drawn on a wide screen, nor when it holds nothing.
  assert.match(organisms, /\n\.rc-dock \{ display: none; \}/);
  const dock = /\.rc-dock:not\(:empty\) \{([^}]*)\}/.exec(phone(organisms))?.[1] ?? "";
  for (const declaration of ["position: fixed;", "inset-block-end: 0;", "z-index: var(--layer-sticky);", "background: var(--surface);"])
    assert.ok(dock.includes(declaration), `the dock has ${declaration}`);
  assert.match(dock, /padding-block: var\(--space-2\) calc\(var\(--space-2\) \+ env\(safe-area-inset-bottom\)\);/, "the dock keeps clear of the home indicator");
  // It is built as the tab bar is, and changes at once above the cross-fade as the bars do.
  assert.match(organisms, /\.rc-dock \{ view-transition-name: rc-dock; \}/);
  // The page keeps room for it, and what takes the focus stops clear of it.
  assert.match(templates, /\.rc-page \{ --dock-height: calc\(var\(--control-height\) \+ 2 \* var\(--space-2\) \+ var\(--border-thin\)\); \}/);
  assert.ok(phone(templates).includes(".rc-page:has(> .rc-dock:not(:empty)) { padding-block-end: calc(var(--dock-height) + env(safe-area-inset-bottom)); }"));
  assert.ok(phone(templates).includes(":root:has(.rc-dock:not(:empty)) { scroll-padding-block-end:"));
  // Every example page that docks an action keeps the dock in the page shell, outside the main column.
  for (const [page, html] of Object.entries(PAGES)) {
    const at = html.indexOf('class="rc-dock"');
    if (at === -1) continue;
    assert.ok(at > html.indexOf("</main>"), `${page}: the dock is outside the main column, which would hold a fixed bar inside itself`);
    assert.ok(at < html.indexOf('class="rc-footer"'), `${page}: the dock reads before the footer`);
    assert.doesNotMatch(html, /class="rc-bottom-nav"/, `${page}: a page has the tab bar or the dock, never both`);
  }
});

test("on a wide screen a step's map and its way forward share one bar under the app bar (DL-124)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const molecules = stripComments(read("packages/design-system/css/molecules.css"));
  const wide = (css) => css.split("@media (min-width: 56.25rem) {").slice(1).join("\n");
  // Not drawn on a phone, nor when it holds nothing.
  assert.match(organisms, /\n\.rc-step-bar \{ display: none; \}/);
  const bar = /\.rc-step-bar:not\(:empty\) \{([^}]*)\}/.exec(wide(organisms))?.[1] ?? "";
  for (const declaration of ["position: sticky;", "inset-block-start: var(--app-header-height);", "z-index: var(--layer-sticky);", "background: var(--surface);"])
    assert.ok(bar.includes(declaration), `the step bar has ${declaration}`);
  // The page gives it a row under the app bar, though it comes after the page body in the markup,
  // and whatever sticks under the bars or fills the window below them counts its height.
  assert.match(templates, /\.rc-page \{ --step-bar-height: 0rem; \}/);
  assert.ok(wide(templates).includes(".rc-page > .rc-step-bar { grid-row: 2; }"));
  assert.ok(wide(templates).includes(".rc-page:has(> .rc-site-banner) > .rc-step-bar { grid-row: 3; }"));
  assert.match(templates, /\.rc-step-layout > \.rc-step-aside \{[^}]*inset-block-start: calc\(var\(--app-header-height\) \+ var\(--step-bar-height\) \+ var\(--space-5\)\);/);
  assert.match(templates, /min-block-size: calc\(100dvh - var\(--site-banner-height\) - var\(--app-header-height\) - var\(--step-bar-height\)\);/);
  assert.ok(wide(templates).includes(":root:has(.rc-step-bar:not(:empty)) { scroll-padding-block-start:"));
  // The steps and the end-of-step actions a wide screen shows in the bar are a phone's on the page.
  assert.ok(wide(molecules).includes('.rc-stepper[data-until="wide"] { display: none; }'));
  assert.ok(wide(molecules).includes('.rc-action-bar[data-until="wide"] { display: none; }'));
  for (const [page, html] of Object.entries(PAGES)) {
    const at = html.indexOf('class="rc-step-bar"');
    if (at === -1) continue;
    assert.ok(at > html.indexOf("</main>"), `${page}: the step bar comes after the page body, so its actions are reached after the step's fields`);
    assert.ok(at < html.indexOf('class="rc-footer"'), `${page}: the step bar reads before the footer`);
    assert.match(html, /class="rc-stepper" aria-label="Steps" data-until="wide"/, `${page}: the steps on the page are a phone's`);
    assert.match(html.slice(at), /^class="rc-step-bar">\s*<ol class="rc-stepper" aria-label="Steps">/, `${page}: the bar opens with the steps`);
  }
});

test("marking a field invalid changes neither its size nor the place of anything under it (DL-124)", () => {
  const atoms = stripComments(read("packages/design-system/css/atoms.css"));
  const invalid = /\.rc-input\[aria-invalid="true"\] \{([^}]*)\}/.exec(atoms)?.[1] ?? "";
  assert.match(invalid, /border: var\(--border-thick\) solid var\(--state-danger\);/);
  assert.match(invalid, /padding: calc\(var\(--space-3\) - \(var\(--border-thick\) - var\(--border-thin\)\)\);/, "the thicker edge comes out of the padding");
});

test("on a phone a preview is a row that swipes, and a list card holds only what it has (DL-090)", () => {
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const molecules = stripComments(read("packages/design-system/css/molecules.css"));
  // The row is a preview's one-column stage. From two columns up it is the grid of whole rows it was.
  const start = templates.indexOf("@container (width < 37.5rem) {\n  .rc-card-grid[data-preview] {");
  const end = templates.indexOf("@container (37.5rem <= width < 56.25rem)", start);
  assert.ok(start !== -1 && end > start, "a preview has its own rules on a phone");
  const phone = templates.slice(start, end);
  const row = phone.match(/\.rc-card-grid\[data-preview\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(row, /grid-auto-flow: column/);
  assert.match(row, /overflow-x: auto/);
  assert.match(row, /scroll-snap-type: inline mandatory/);
  assert.match(phone, /\.rc-card-grid\[data-preview\] > li \{ scroll-snap-align: start; \}/);
  // The next card shows at the edge: a card is never as wide as the row, unless it is the only one.
  assert.match(row, /grid-auto-columns: min\(100% - var\(--space-8\), var\(--card-min-width\)\)/);
  assert.match(phone, /\.rc-card-grid\[data-preview\]:has\(> li:only-child\) \{ grid-auto-columns: 100%; \}/);
  // It runs through the gutter to both edges of the screen, and a card rests at the gutter.
  assert.match(row, /margin: calc\(var\(--space-2\) \* -1\) calc\(var\(--gutter\) \* -1\)/);
  assert.match(row, /padding: var\(--space-2\) var\(--gutter\)/);
  assert.match(row, /scroll-padding-inline: var\(--gutter\)/);
  // Only the row's own axis is held, so a finger that starts on a card still scrolls the page.
  assert.match(row, /overscroll-behavior-x: contain/);
  assert.doesNotMatch(row, /overscroll-behavior:|touch-action/);
  // A row has no short last row, so it hides no card. Its loading shapes do not move.
  assert.doesNotMatch(phone, /display: none/);
  assert.match(phone, /\.rc-card-grid\[data-preview\]\[aria-hidden="true"\] \{ overflow-x: hidden; \}/);
  // A mouse keeps the scrollbar as its way along the row.
  assert.match(phone, /@media \(pointer: coarse\) \{\s*\.rc-card-grid\[data-preview\] \{ scrollbar-width: none; \}/);
  for (const preview of ["row", "rows"]) assert.ok(PAGES.home.includes(`class="rc-card-grid" data-preview="${preview}"`), `Home's ${preview} is a preview`);

  // A list card on a phone: these rules apply under 900 px and nowhere else.
  const onPhone = (rule) => {
    const at = molecules.indexOf(rule);
    const open = molecules.lastIndexOf("@media (width < 56.25rem) {", at);
    return at !== -1 && open !== -1 && !molecules.slice(open, at).includes("\n}");
  };
  // No room for a picture it does not have, nor for the shape that held its place. A picture shows.
  assert.ok(onPhone('.rc-card[data-layout="listing"] > :is(.rc-media:not(:has(> img)), .rc-skeleton[data-shape="media"]) { display: none; }'));
  // A tag is a label under the card's link only where the card opens. A tag in a card that does
  // not open is the only target there, and a fit line is no tag: both keep their buttons.
  const opens = '.rc-card[data-layout="listing"]:has(.rc-card-title > :is(a, button)) .rc-tag-list';
  assert.ok(onPhone(`${opens} .rc-tooltip-wrap { position: static; }`));
  assert.ok(onPhone(`${opens} .rc-tooltip-trigger { min-block-size: 0; }`));
  assert.doesNotMatch(molecules, /\.rc-fit[^{]*\{[^}]*min-block-size: 0/);
});

test("a phone's sheet stands on the on-screen keyboard and fits in what is left (DL-091)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  // With no keyboard the sheet is at the bottom edge and the whole window is in view.
  const dialog = organisms.match(/\n\.rc-dialog \{([^}]*)\}/)?.[1] ?? "";
  assert.match(dialog, /--sheet-keyboard: 0;/);
  assert.match(dialog, /--sheet-room: 100dvh;/);
  const sheet = organisms.match(/@media \(max-width: 37\.5rem\) \{\s*\.rc-dialog\[data-presentation\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(sheet, /inset: auto 0 var\(--sheet-keyboard\);/, "its bottom edge is the keyboard's top");
  // Two thirds of the window still (DL-060), or what the keyboard leaves less a little of the page above.
  assert.match(sheet, /max-block-size: min\(100dvh \* 2 \/ 3, var\(--sheet-room\) - var\(--space-5\)\);/);
  // A wide screen's dialog is centred and reads neither.
  const wide = organisms.replace(/@media \(max-width: 37\.5rem\)[^{]*\{[\s\S]*?\n\}/g, "");
  assert.doesNotMatch(wide, /var\(--sheet-(keyboard|room)\)/);
  // The behaviour that writes them is the one module both the app and the library connect.
  const behaviour = read("packages/design-system/behaviors/sheet.js");
  for (const property of ["--sheet-keyboard", "--sheet-room"]) {
    assert.ok(behaviour.includes(`setProperty("${property}"`), `sheet.js writes ${property}`);
    assert.ok(behaviour.includes(`removeProperty("${property}"`), `sheet.js clears ${property}`);
  }
});

test("Home's hero keeps room for both of its counts, so nothing moves when the second arrives (DL-092)", () => {
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  // One count a line on a phone, so two lines; a line that is short of that stays at the top.
  assert.match(templates, /\n\.rc-home-live \{ display: grid; justify-items: center; align-content: start; min-block-size: calc\(2 \* var\(--control-sm-height\)\); \}/);
  // Side by side when wide, so one line.
  const wide = templates.match(/@container \(min-width: 37\.5rem\) \{\s*\.rc-home-hero \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(wide, /\.rc-home-live \{[^}]*display: flex;[^}]*min-block-size: var\(--control-sm-height\); \}/);
});

test("a phone's footer leaves out the pages its tab bar already lists (DL-093)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  // Only on a phone, and only where the bar shows: a focused step keeps the list as its way out.
  assert.match(organisms, /@media \(width < 56\.25rem\) \{\s*\.rc-page:has\(> \.rc-bottom-nav\) \.rc-footer-grid > \[data-repeats="tabs"\] \{ display: none; \}\s*\}/);
  assert.equal((organisms.match(/\[data-repeats="tabs"\]/g) ?? []).length, 1, "nothing else hides it");
  // Every footer in the library marks that one list, and no other.
  for (const [page, html] of [...Object.entries(PAGES), ["library", LIBRARY]]) {
    const footer = /<div class="rc-footer-grid">[\s\S]*?<\/div>/.exec(html)?.[0];
    if (!footer) continue;
    assert.match(footer, /<section data-repeats="tabs">\s*<h[24] class="rc-footer-title">Weave<\/h[24]>/, `${page} marks Weave's pages`);
    assert.equal((footer.match(/data-repeats/g) ?? []).length, 1, `${page} marks one list`);
  }
});

test("on a phone a page deeper in is pushed on and the way back pops it off, a short way (DL-094)", () => {
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const phone = templates.match(/@media \(width < 56\.25rem\) and \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  // The page that arrives and the one that leaves move the same way: on from the end, off to the start.
  const moves = { push: ["rc-page-out-start", "rc-page-in-end"], pop: ["rc-page-out-end", "rc-page-in-start"] };
  for (const [move, [leaves, arrives]] of Object.entries(moves)) {
    assert.ok(phone.includes(`:root[data-page-move="${move}"]::view-transition-old(root) { animation-name: ${leaves}; }`), `${move}: the old page`);
    assert.ok(phone.includes(`:root[data-page-move="${move}"]::view-transition-new(root) { animation-name: ${arrives}; }`), `${move}: the new page`);
  }
  // Nothing names a move on a wide screen or under reduced motion, so pages cross-fade there.
  assert.equal((templates.match(/data-page-move/g) ?? []).length, 4);
  // It is a shift and a fade, in the cross-fade's own time: no keyframe carries a duration or a whole screen.
  for (const name of ["rc-page-in-end", "rc-page-out-start", "rc-page-in-start", "rc-page-out-end"]) {
    const frames = templates.match(new RegExp(`@keyframes ${name} \\{ (?:from|to) \\{ opacity: 0; translate: ([^;]+) 0; \\} \\}`))?.[1];
    assert.ok(frames === "var(--page-shift)" || frames === "calc(var(--page-shift) * -1)", name);
  }
  assert.match(templates, /\n:root \{ --page-shift: var\(--space-7\); \}/);
  assert.match(templates, /\n:root:dir\(rtl\) \{ --page-shift: calc\(var\(--space-7\) \* -1\); \}/);
  // The bars keep their own names, so they hold still above the page (DL-058).
  assert.doesNotMatch(phone, /view-transition-(?:old|new|group)\(rc-/);
});

test("a tab is pressed, not held like a link (DL-095)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  assert.match(organisms, /\n\.rc-bottom-nav > a \{ -webkit-touch-callout: none; user-select: none; \}/);
  // Links in the page keep the phone's own menu: only the tab bar's are controls.
  assert.equal((CSS_FILES.map(read).join("\n").match(/-webkit-touch-callout/g) ?? []).length, 1);
});

test("a page never moves sideways, and a trackpad keeps its swipe back (DL-098)", () => {
  const base = stripComments(read("packages/design-system/css/base.css"));
  // Clip, not hidden: hidden would make a scrolling box of the page and the app bar would stop sticking.
  assert.match(base, /\n:where\(html, body\) \{ overflow-x: clip; \}/);
  assert.doesNotMatch(base, /overflow(?:-x)?: hidden/);
  // The root gives up its sideways bounce under a finger only.
  assert.match(base, /@media \(pointer: coarse\) \{\s*:where\(html\) \{ overscroll-behavior-x: none; \}\s*\}/);
  assert.equal((base.match(/overscroll-behavior/g) ?? []).length, 1);
  // The page's push and pop are drawn by the view transition's own layer, which is fixed to the
  // window: nothing in the page itself is moved sideways to draw them.
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  for (const [, selector] of templates.matchAll(/([^{}]+)\{[^{}]*animation-name: rc-page-(?:in|out)-(?:start|end);[^{}]*\}/g)) {
    assert.match(selector, /::view-transition-(?:old|new)\(root\)\s*$/, selector.trim());
  }
});

test("a filter's menu scrolls to its last row: scrolling inside it never places it again (DL-100)", async () => {
  const { scrollMovesPanel } = await import("../behaviors/overlays.js");
  const row = { name: "a row in the menu" };
  const panel = { contains: (node) => node === row };
  assert.equal(scrollMovesPanel(panel, panel), false, "the menu's own scroll");
  assert.equal(scrollMovesPanel(row, panel), false, "a scroll inside the menu");
  assert.equal(scrollMovesPanel({ name: "the page" }, panel), true, "the page under it still moves it with its button");
  // Placing measures the menu at its full height. Without the two guards below, every scroll inside
  // a menu taller than its room sent it back to its first row.
  const source = read("packages/design-system/behaviors/overlays.js");
  assert.match(source, /if \(isOpen\(\) && scrollMovesPanel\(event\.target, panel\)\) place\(trigger, panel\);/);
  assert.match(source, /const scrolledTo = panel\.scrollTop;[\s\S]*if \(panel\.scrollTop !== scrolledTo\) panel\.scrollTop = scrolledTo;\n\}/);
});

test("a panel keeps a block's rhythm and paints nothing, at any width (DL-099)", () => {
  const molecules = stripComments(read("packages/design-system/css/molecules.css"));
  const rules = [...molecules.matchAll(/\.rc-panel[^{]*\{([^}]*)\}/g)].map((match) => match[1].trim());
  assert.deepEqual(rules, ["display: grid; align-content: start; gap: var(--space-5); min-inline-size: 0;"]);
});

test("what every page shares is in title case: the footer's links, the dialogs' titles and the way in (DL-105)", () => {
  // A word that starts small, once tags and entities are set aside.
  const small = (words) => words.replace(/<[^>]*>/g, " ").replace(/&#?\w+;/g, "&").split(/[\s/-]+/).map((word) => word.replace(/^[^\p{L}\p{N}]+/u, "")).find((word) => /^\p{Ll}/u.test(word));
  for (const [page, html] of Object.entries(PAGES)) {
    const shared = [
      ...html.matchAll(/<(?:a|button)\b[^>]*class="rc-footer-link"[^>]*>([\s\S]*?)<\/(?:a|button)\s*>/g),
      ...html.matchAll(/<h[1-4]\b[^>]*class="rc-footer-title"[^>]*>([\s\S]*?)<\/h[1-4]>/g),
    ].map((match) => match[1].replace(/<span class="rc-visually-hidden">[\s\S]*?<\/span>/g, "").trim());
    assert.ok(shared.length >= 8, `${page} has a footer`);
    // The three things the footer opens, each under its own name.
    for (const title of ["What We Store", "What The Assistant Did", "Data Policy"]) {
      assert.match(html, new RegExp(`<h2 class="rc-dialog-title"[^>]*>\\s*${title}\\s*</h2>`), `${page}: ${title}`);
    }
    for (const words of shared) assert.equal(small(words), undefined, `${page}: "${words}"`);
    // The header's way in, where the page has one.
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    for (const [, words] of header.matchAll(/<button\b[^>]*class="rc-(?:button|menu-item)"[^>]*>\s*(Sign [a-zA-Z]+)\s*<\/button>/g)) {
      assert.equal(small(words), undefined, `${page}: "${words}"`);
    }
  }
});

test("behind a page the mycelium is fixed to the window and shows only through the page body (DL-106)", () => {
  const templates = stripComments(read("packages/design-system/css/templates.css"));
  const page = templates.match(/\.rc-mycelium\[data-extent="page"\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(page, /position: fixed;/);
  // The window's largest height: a phone's address bar coming and going must not resize the canvas.
  assert.match(page, /block-size: 100lvh;/);
  assert.match(page, /inline-size: 100%;/);
  // The page body clips it, so the banner, the bars and the footer have no thread behind them.
  assert.match(templates, /\n\.rc-page-body:has\(> \.rc-mycelium\[data-extent="page"\]\) \{ clip-path: inset\(0\); \}/);
  // It stays behind the page's content and takes no pointer.
  const base = templates.match(/\n\.rc-mycelium \{([^}]*)\}/)?.[1] ?? "";
  assert.match(base, /z-index: -1;/);
  assert.match(base, /pointer-events: none;/);
});

test("a fixed-row card keeps set lines for every part, so its height does not depend on its words (DL-108)", () => {
  const molecules = stripComments(read("packages/design-system/css/molecules.css"));
  const has = (rule) => assert.ok(molecules.includes(rule), rule);
  has('.rc-card[data-rows="fixed"] > .rc-card-title { min-block-size: 2lh; }');
  has('.rc-card[data-rows="fixed"] > .rc-card-summary { min-block-size: 3lh; }');
  // The clamps that cap the same parts are the listing card's own: two lines and three.
  assert.match(molecules, /\.rc-card\[data-layout="listing"\] \.rc-card-title \{[^}]*line-clamp: 2;/);
  assert.match(molecules, /\.rc-card-summary \{[^}]*line-clamp: 3;/);
  assert.match(molecules, /\.rc-card\[data-rows="fixed"\] > :is\(\.rc-eyebrow, \.rc-card-meta, \.rc-time\) \{[^}]*min-block-size: 1lh; max-block-size: 1lh; overflow: hidden; white-space: nowrap;/);
  assert.match(molecules, /\.rc-card\[data-rows="fixed"\]\[data-kind="initiative"\] > \.rc-meta \{[^}]*min-block-size: 2lh;[^}]*line-clamp: 2;/);
  assert.match(molecules, /\.rc-card\[data-rows="fixed"\] > \.rc-tag-list \{[^}]*grid-template-rows: repeat\(2, var\(--tag-height\)\);[^}]*block-size: calc\(2 \* var\(--tag-height\) \+ var\(--space-1\)\); overflow: hidden;/);
});

test("the count line and the list end keep set room, and no section is a band (DL-108, DL-109)", () => {
  const organisms = stripComments(read("packages/design-system/css/organisms.css"));
  assert.ok(organisms.includes(".rc-filter-bar > .rc-meta > :not(.rc-visually-hidden) { min-block-size: 1lh; }"));
  assert.match(organisms, /@container \(width < 37\.5rem\) \{\s*\.rc-filter-bar > \.rc-meta > \[data-part="note"\] \{ min-block-size: 2lh; \}\s*\}/);
  assert.match(organisms, /@container \(width < 37\.5rem\) \{\s*\.rc-list-end \{[^}]*grid-template-rows: minmax\(var\(--control-height\), auto\) var\(--control-height\);/);
  for (const file of CSS_FILES) assert.doesNotMatch(read(file), /data-band/, file);
});

test("on a phone a fixed-row card keeps two summary lines, kept and cut alike (DL-109)", () => {
  const molecules = stripComments(read("packages/design-system/css/molecules.css"));
  assert.match(molecules, /@container \(width < 37\.5rem\) \{\s*\.rc-card\[data-rows="fixed"\] > \.rc-card-summary \{ min-block-size: 2lh; -webkit-line-clamp: 2; line-clamp: 2; \}\s*\}/);
});
