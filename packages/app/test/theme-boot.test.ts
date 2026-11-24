// A pinned theme is drawn from the first paint (DL-097) by a file of the site's own, read before
// the page is drawn. This runs that file against a stand-in page, and holds it to the theme module
// it repeats and to the security policy it must not need changing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { themeBootTag, themeColorTags } from "../dev/theme-color.ts";
import { SCHEMES, themeColorMedia } from "../src/theme-color.ts";
import { THEME_KEY } from "../src/theme.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const BOOT = read("../public/theme-boot.js");

function meta(attributes: Record<string, string>) {
  return {
    attributes,
    getAttribute: (name: string) => attributes[name] ?? null,
    setAttribute: (name: string, value: string) => void (attributes[name] = value),
  };
}
/** The head as index.html has it when the script runs, and what the script did to it. */
function boot(stored: () => string | null, pathname = "/", page: { root?: unknown } = {}) {
  const timers: (() => void)[] = [];
  const marks: Record<string, string> = {};
  const root = { dataset: {} as Record<string, string>, setAttribute: (name: string, value: string) => void (marks[name] = value) };
  const scheme = meta({ name: "color-scheme", content: "light dark" });
  const colours = SCHEMES.map((name) => meta({ name: "theme-color", "data-scheme": name, media: themeColorMedia(null, name) }));
  const document = {
    documentElement: root,
    querySelector: (selector: string) => (selector === 'meta[name="color-scheme"]' ? scheme : null),
    querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"][data-scheme]' ? colours : []),
    getElementById: (id: string) => (id === "root" ? page.root ?? null : null),
  };
  vm.runInNewContext(BOOT, {
    document,
    location: { pathname },
    localStorage: { getItem: (key: string) => (key === THEME_KEY ? stored() : null) },
    setTimeout: (run: () => void, ms: number) => void timers.push(() => { assert.equal(ms, 8000); run(); }),
  });
  return { theme: root.dataset.theme, scheme: scheme.attributes.content, media: colours.map((colour) => colour.attributes.media), home: "data-home" in marks, later: () => timers.forEach((run) => run()) };
}

test("the page is marked as Home at / alone, so Home's first view shows nowhere else", () => {
  assert.equal(boot(() => null, "/").home, true);
  for (const pathname of ["/funding", "/settings", "/funding/some-fund", "/start/needs", "//"]) assert.equal(boot(() => null, pathname).home, false, pathname);
  // The mark does not depend on the theme, or on storage being readable.
  assert.equal(boot(() => { throw new Error("storage is closed"); }, "/").home, true);
});

test("a first view the app never replaced has its links working after a while, and one it replaced is left alone", () => {
  const attributes = new Set(["data-first-view", "inert"]);
  const root = { hasAttribute: (name: string) => attributes.has(name), removeAttribute: (name: string) => void attributes.delete(name) };
  const stuck = boot(() => null, "/settings", { root });
  assert.ok(attributes.has("inert"), "inert until the wait is over");
  stuck.later();
  assert.deepEqual([...attributes], ["data-first-view"]);
  // The app started: it took the first view's mark off, so nothing changes.
  const started = new Set(["inert"]);
  boot(() => null, "/settings", { root: { hasAttribute: (name: string) => started.has(name) && name !== "inert", removeAttribute: (name: string) => void started.delete(name) } }).later();
  assert.deepEqual([...started], ["inert"]);
  // No root at all, as on a page that is not the app's.
  assert.doesNotThrow(() => boot(() => null, "/").later());
});

test("a pinned theme is on the page, its colour scheme and its bar colours before anything is drawn", () => {
  for (const pinned of SCHEMES) {
    const page = boot(() => pinned);
    assert.equal(page.theme, pinned);
    assert.equal(page.scheme, pinned);
    // Exactly what the app's own applyTheme sets a moment later.
    assert.deepEqual(page.media, SCHEMES.map((scheme) => themeColorMedia(pinned, scheme)));
  }
});

test("with nothing pinned, or nothing it can read, the page follows the system as before", () => {
  const untouched = { theme: undefined, scheme: "light dark", media: SCHEMES.map((scheme) => themeColorMedia(null, scheme)), home: true };
  const page = (stored: () => string | null) => { const { later: _later, ...rest } = boot(stored); return rest; };
  for (const stored of [null, "system", "", "DARK", "blue"]) assert.deepEqual(page(() => stored), untouched, String(stored));
  assert.deepEqual(page(() => { throw new Error("storage is closed"); }), untouched);
});

test("it reads the place the theme module writes, and is a file of the site's own with nothing inline", () => {
  assert.ok(BOOT.includes(`localStorage.getItem("${THEME_KEY}")`));
  const tag = themeBootTag();
  assert.deepEqual(tag, { tag: "script", attrs: { src: "/theme-boot.js" }, injectTo: "head" });
  assert.equal("children" in tag, false, "no inline script");
  // After the theme colours, which it sets, and in the head, so it runs before the body is drawn.
  assert.ok(read("../dev/theme-color.ts").includes("handler: () => [...themeColorTags(), themeBootTag()]"));
  assert.equal(themeColorTags().every((colour) => colour.injectTo === tag.injectTo), true);
});

test("the security policy is what it was: scripts from the site itself, and nothing else", () => {
  const config = JSON.parse(read("../vercel.json")) as { headers: { headers: { key: string; value: string }[] }[] };
  const policy = config.headers.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  const scripts = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));
  assert.equal(scripts, "script-src 'self'");
  assert.doesNotMatch(policy, /unsafe-inline|sha256-|nonce-/u);
  // index.html itself carries no script but the app's module.
  assert.equal(read("../index.html").split("<script").length - 1, 1);
});

test("a visit the service worker does not control yet is marked a first visit, and one it controls is not", () => {
  const marked = (navigator: unknown) => {
    const marks: Record<string, string> = {};
    const document = {
      documentElement: { dataset: {}, setAttribute: (name: string, value: string) => void (marks[name] = value) },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
    };
    vm.runInNewContext(BOOT, { document, navigator, location: { pathname: "/funding" }, localStorage: { getItem: () => null }, setTimeout: () => 0 });
    return "data-first-visit" in marks;
  };
  assert.equal(marked({ serviceWorker: { controller: null } }), true, "not controlled yet");
  assert.equal(marked({}), true, "no service workers");
  assert.equal(marked({ serviceWorker: { controller: {} } }), false, "controlled: the faces are stored");
  // The mark only swaps the reading face for its size-matched fallback.
  const base = read("../../design-system/css/base.css");
  assert.ok(base.includes(':root[data-first-visit] { --font-serif: "Source Serif 4 Fallback", Georgia, serif; }'));
});

test("Home's address coming back from Certified is marked as returning, not Home, so its loading view shows", () => {
  const marks = (pathname: string, search: string) => {
    const set: Record<string, string> = {};
    const document = {
      documentElement: { dataset: {}, setAttribute: (name: string, value: string) => void (set[name] = value) },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
    };
    vm.runInNewContext(BOOT, { document, navigator: {}, location: { pathname, search }, localStorage: { getItem: () => null }, setTimeout: () => 0 });
    return { home: "data-home" in set, returning: "data-returning" in set };
  };
  assert.deepEqual(marks("/", "?projectConsent=ready"), { home: false, returning: true });
  assert.deepEqual(marks("/", "?projectConsent=denied&x=1"), { home: false, returning: true });
  assert.deepEqual(marks("/", ""), { home: true, returning: false });
  assert.deepEqual(marks("/", "?q=projectConsent"), { home: true, returning: false });
  assert.deepEqual(marks("/funding", "?projectConsent=ready"), { home: false, returning: false });
  const base = read("../../design-system/css/base.css");
  assert.ok(base.includes("[data-returning-view] { display: none; }"));
  assert.ok(base.includes(":root[data-returning] [data-returning-view] { display: block; }"));
});
