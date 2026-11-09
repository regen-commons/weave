import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentTitle,
  fixtureHref,
  INTAKE_STEPS,
  matchRoute,
  pathTo,
  recordPath,
  ROUTES,
} from "../src/routes.ts";

test("each page has a unique path, name and title", () => {
  for (const key of ["path", "name", "title"] as const)
    assert.equal(new Set(ROUTES.map((route) => route[key])).size, ROUTES.length, key);
  assert.deepEqual(
    INTAKE_STEPS.map((step) => step.route),
    ["initiative", "needs", "offers"],
  );
});
test("the frame has four browsing sections, detail pages, finish and Settings; saving is no longer a page", () => {
  for (const path of ["/", "/partners", "/funding", "/initiatives", "/settings", "/start/finish"])
    assert.ok(matchRoute(path), path);
  assert.equal(matchRoute("/save"), undefined);
  assert.equal(matchRoute("/start/finish")?.title, "Your first matches");
  assert.equal(matchRoute("/start/finish")?.section, "partners");
  assert.equal(matchRoute("/start/initiative/check")?.name, "check-card");
  assert.deepEqual(
    ROUTES.filter((route) => route.form).map((route) => route.name),
    ["initiative", "check-card", "needs", "offers"],
  );
});
test("details resolve validated identifiers, preserve section cues and accept a trailing slash", () => {
  assert.equal(matchRoute("/initiatives/orchard/")?.id, "orchard");
  assert.equal(matchRoute("/initiatives/orchard")?.section, "initiatives");
  assert.equal(matchRoute("/funding/water")?.name, "opportunity");
  assert.equal(matchRoute("/funding/recCapital_ID")?.id, "recCapital_ID");
  for (const path of ["/initiatives/a/b", "/funding/%2F", "/start", "/funding-commons"])
    assert.equal(matchRoute(path), undefined, path);
  assert.equal(recordPath("initiative", "orchard"), "/initiatives/orchard");
  assert.throws(() => recordPath("funding", "../outside"));
  assert.throws(() => pathTo("opportunity"));
});
test("earlier browsing links still resolve to their new section", () => {
  assert.equal(matchRoute("/matches")?.name, "partners");
  assert.equal(matchRoute("/directory")?.name, "funding");
  assert.equal(pathTo("funding"), "/funding");
  assert.equal(documentTitle(matchRoute("/partners")), "Partners | Weave");
  assert.equal(documentTitle(matchRoute("/")), "Weave");
  assert.equal(documentTitle(undefined), "Page not found | Weave");
});
test("fixture navigation preserves only example controls on internal development links", () => {
  assert.equal(
    fixtureHref("/settings", "?fixture=private&state=long&secret=not-forwarded", true),
    "/settings?fixture=private&state=long",
  );
  assert.equal(
    fixtureHref("/funding?state=ready", "?fixture=shared&state=error", true),
    "/funding?state=ready&fixture=shared",
  );
  assert.equal(
    fixtureHref("/start/initiative/check", "?fixture=draft&view=correcting", true),
    "/start/initiative/check?fixture=draft&view=correcting",
  );
  for (const href of ["https://example.org", "//example.org", "#main"])
    assert.equal(fixtureHref(href, "?fixture=shared", true), href);
  assert.equal(fixtureHref("/settings", "?fixture=shared", false), "/settings");
});
