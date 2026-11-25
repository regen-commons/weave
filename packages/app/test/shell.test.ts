// The app shell: the order of the sections and the pages that leave the footer out on a phone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ROUTES } from "../src/routes.ts";
import { SECTIONS } from "../src/ui/sections.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const css = (file: string) => read(`../../design-system/css/${file}`).replace(/\/\*[\s\S]*?\*\//gu, "");

test("the tabs follow Home: Funding comes before Initiatives", () => {
  assert.deepEqual(SECTIONS.map((section) => section.route), ["home", "funding", "initiatives", "your-initiatives"]);
  const home = read("../src/pages/Home.tsx");
  assert.ok(home.indexOf('id="soon"') < home.indexOf('id="recent"'), "Home shows funding before shared initiatives");
});

test("describing an initiative and the Your Initiatives tab leave the footer out on a phone", () => {
  const phoneless = ROUTES.filter((route) => route.footer === "wide").map((route) => route.name);
  assert.deepEqual(phoneless, ["new-initiative", "initiative", "needs", "offers", "your-initiatives"]);
  // Every other page keeps it, Settings and the initiative's own page included.
  for (const name of ["home", "funding", "initiatives", "your-initiative", "settings"] as const) {
    assert.equal(ROUTES.find((route) => route.name === name)?.footer, undefined, name);
  }
  assert.match(read("../src/ui/Page.tsx"), /<Footer current=\{current\} from=\{route\?\.footer\}/u);
  assert.match(read("../src/ui/Footer.tsx"), /<footer className="rc-footer" data-from=\{from\}>/u);
  assert.match(
    css("organisms.css"),
    /@media \(width < 56\.25rem\) \{\s*\.rc-footer\[data-from="wide"\] \{ display: none; \}\s*\}/u,
  );
});

test("the app shell omits the site banner unless it supplies an announcement (DL-132)", () => {
  const header = read("../src/ui/AppHeader.tsx");
  assert.match(header, /<header className="rc-app-head">\s*\{banner && <p className="rc-site-banner">\{banner\}<\/p>\}\s*\{bar\}\s*<\/header>/u);
  assert.match(header, /const bar = \(\s*<div className="rc-app-header">/u);
  const page = read("../src/ui/Page.tsx");
  assert.doesNotMatch(page, /\bbanner\s*=|className="rc-site-banner"/u);
});

test("a form step keeps the mycelium off its words (DL-135)", () => {
  assert.match(read("../src/ui/Page.tsx"), /<Mycelium extent="page" home=\{route\?\.name === "home"\} quiet=\{form\} \/>/u);
  assert.match(read("../src/ui/Mycelium.tsx"), /growMycelium\(canvas, \{ depth: \(\) => depth\.current, quiet: \(\) => still\.current \}\)/u);
});

test("Home's funding strip reads only its cards and count, never the whole catalog (Q-01)", () => {
  const home = read("../src/pages/Home.tsx");
  assert.match(home, /const catalog = useClosingSoon\(fundingExample, \{ idle: true \}\);/u);
  assert.doesNotMatch(home, /useCatalogBundle|catalogEntries|fundingPreviews/u);
});
