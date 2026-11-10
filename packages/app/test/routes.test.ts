import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentTitle,
  fixtureHref,
  INTAKE_STEPS,
  matchRoute,
  pathTo,
  recordPath,
  routeFromFragment,
  routeWith,
  ROUTES,
  splitRoute,
} from "../src/routes.ts";

test("each page has a unique path, name and title", () => {
  for (const key of ["path", "name", "title"] as const)
    assert.equal(new Set(ROUTES.map((route) => route[key])).size, ROUTES.length, key);
  assert.deepEqual(
    INTAKE_STEPS.map((step) => step.route),
    ["initiative", "needs", "your-initiative"],
  );
});
test("the frame has four browsing sections, detail pages, the person's initiative pages and Settings; saving is no longer a page", () => {
  for (const path of ["/", "/partners", "/funding", "/initiatives", "/settings", "/your-initiative", "/your-initiatives"])
    assert.ok(matchRoute(path), path);
  assert.equal(matchRoute("/save"), undefined);
  assert.equal(matchRoute("/your-initiative")?.title, "Your initiative");
  assert.equal(matchRoute("/your-initiative")?.section, undefined);
  assert.equal(matchRoute("/start/finish")?.name, "your-initiative");
  assert.equal(matchRoute("/your-initiatives")?.title, "Your initiatives");
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
  assert.equal(
    fixtureHref("/your-initiative", "?fixture=published&certified=fail", true),
    "/your-initiative?fixture=published&certified=fail",
  );
  assert.equal(
    fixtureHref("/your-initiatives", "?fixture=returning&projects=none", true),
    "/your-initiatives?fixture=returning&projects=none",
  );
  for (const href of ["https://example.org", "//example.org", "#main"])
    assert.equal(fixtureHref(href, "?fixture=shared", true), href);
  assert.equal(fixtureHref("/settings", "?fixture=shared", false), "/settings");
});
test("the prototype build reads its route from the fragment and never leaves the app", () => {
  assert.equal(routeFromFragment("#/your-initiative?fixture=draft"), "/your-initiative?fixture=draft");
  assert.equal(routeFromFragment("/partners"), "/partners");
  for (const fragment of ["", "#", "#keep-card", "#//example.org/path", "#https://example.org"])
    assert.equal(routeFromFragment(fragment), "/", fragment);
  assert.deepEqual(splitRoute("/funding?q=water&fixture=draft"), { pathname: "/funding", search: "?q=water&fixture=draft" });
  assert.deepEqual(splitRoute("/"), { pathname: "/", search: "" });
  assert.equal(routeWith("/partners?fixture=private&state=error", "state", "ready"), "/partners?fixture=private&state=ready");
  assert.equal(
    routeWith("/start/initiative?fixture=draft", "view", "review", "/start/initiative/check"),
    "/start/initiative/check?fixture=draft&view=review",
  );
});

test("a team workspace opens only from a canonical workspace identifier", async () => {
  const { teamWorkspacePath } = await import("../src/routes.ts");
  const { returnTask } = await import("../../api/src/sign-in.ts");
  const id = "31000000-0000-4000-8000-000000000001";
  const path = teamWorkspacePath(id);
  assert.equal(matchRoute(path)?.name, "team-workspace");
  assert.equal(matchRoute(path)?.id, id);
  assert.equal(documentTitle(matchRoute(path)), "Team workspace | Weave");
  assert.equal(returnTask(path), path);
  for (const value of ["/workspaces/unknown", `${path}/other`, `${path}?return=//example.org`]) {
    assert.equal(matchRoute(value), undefined);
    assert.throws(() => returnTask(value), { code: "invalid_return_task" });
  }
});
