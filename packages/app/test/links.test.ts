import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUILDER, CERTIFIED, COMMONS, EIGHT_FORMS_OF_CAPITAL, FUNDING_COMMONS, leavesWeave } from "../src/links.ts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const markup = readdirSync(SRC, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
  .map((entry) => join(entry.parentPath, entry.name));

test("a link to another site leaves Weave; a page, a mail link and a download do not", () => {
  for (const href of [...Object.values(COMMONS), BUILDER.href, CERTIFIED, EIGHT_FORMS_OF_CAPITAL, FUNDING_COMMONS])
    assert.equal(leavesWeave(href), true, href);
  for (const href of ["/funding", "/initiatives?q=water", "#main", "mailto:hello@example.org", "blob:abc", ""])
    assert.equal(leavesWeave(href), false, href);
});

test("the router's Link opens another site in a new tab, without giving it this page", () => {
  const router = readFileSync(join(SRC, "router.tsx"), "utf8");
  assert.match(router, /outside \? \{ target: "_blank", rel: "noopener noreferrer" \}/u);
  assert.match(router, /opens in a new tab/u, "and says so to assistive technology");
});

test("no page links to another site in the same tab", () => {
  for (const path of markup) {
    if (path.endsWith("router.tsx")) continue;
    const text = readFileSync(path, "utf8");
    // A raw anchor is for a place on the same page only. Every other link goes through Link, which
    // opens another site in a new tab and says so, so no page writes its own `target` and forgets one.
    for (const [tag] of text.matchAll(/<a\b[^>]*>/gu))
      assert.match(tag, /href="#/u, `${path.slice(SRC.length)}: ${tag} is a raw anchor; use Link`);
    assert.doesNotMatch(text, /href="https?:\/\//u, `${path.slice(SRC.length)} writes an outside address into a page; name it in links.ts`);
  }
});

test("the footer's Regen Commons links go through Link", () => {
  const footer = readFileSync(join(SRC, "ui/Footer.tsx"), "utf8");
  assert.match(footer, /<Link className="rc-footer-link" href=\{link\.href\}>/u);
});
