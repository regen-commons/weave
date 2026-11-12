import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backTarget,
  documentTitle,
  fixtureHref,
  INTAKE_STEPS,
  matchRoute,
  navLabel,
  nextVisit,
  pathTo,
  readVisit,
  recordPath,
  routeFromFragment,
  routeWith,
  ROUTES,
  sheetBackground,
  splitRoute,
} from "../src/routes.ts";

test("each route has a unique path and name; device and team routes use the same initiative page title", () => {
  for (const key of ["path", "name"] as const)
    assert.equal(new Set(ROUTES.map((route) => route[key])).size, ROUTES.length, key);
  assert.deepEqual(ROUTES.filter(route => route.title === "Your initiative").map(route => route.name), ["your-initiative", "team-workspace"]);
  const otherTitles = ROUTES.filter(route => route.title !== "Your initiative").map(route => route.title);
  assert.equal(new Set(otherTitles).size, otherTitles.length);
  assert.deepEqual(
    INTAKE_STEPS.map((step) => step.route),
    ["initiative", "needs", "your-initiative"],
  );
});
test("the frame has four tabs, detail sheets, the person's initiative pages and Settings; saving is no longer a page", () => {
  for (const path of ["/", "/partners", "/funding", "/initiatives", "/settings", "/your-initiative", "/your-initiatives"])
    assert.ok(matchRoute(path), path);
  assert.equal(matchRoute("/save"), undefined);
  assert.equal(matchRoute("/your-initiative")?.title, "Your initiative");
  assert.equal(matchRoute("/start/finish")?.name, "your-initiative");
  assert.equal(matchRoute("/your-initiatives")?.title, "Your Initiatives");
  assert.equal(matchRoute("/start/initiative/check")?.name, "check-card");
  assert.deepEqual(
    ROUTES.filter((route) => route.form).map((route) => route.name),
    ["initiative", "check-card", "needs", "offers"],
  );
  // A tab is a page with a section and no page above it. Pages under a tab keep it marked.
  assert.deepEqual(
    ROUTES.filter((route) => route.section && !route.parent).map((route) => route.name),
    ["home", "your-initiatives", "funding", "initiatives"],
  );
  for (const name of ["your-initiative", "partners", "settings"] as const)
    assert.equal(matchRoute(pathTo(name))?.section, "your-initiatives", name);
  assert.deepEqual(
    ROUTES.filter((route) => route.sheet).map((route) => route.name),
    ["initiative-detail", "opportunity"],
  );
});
test("navigation names a page by its short label where the title is a sentence", () => {
  assert.equal(navLabel("home"), "Home");
  assert.equal(navLabel("initiative"), "Describe your initiative");
  assert.equal(navLabel("funding"), "Funding");
  assert.equal(navLabel("your-initiatives"), "Your Initiatives");
});
test("a history entry's visit is read only when it names a page inside the app", () => {
  assert.deepEqual(readVisit({ from: "/funding?q=water", hops: 2 }), { from: "/funding?q=water", hops: 2 });
  for (const state of [
    null,
    undefined,
    "text",
    {},
    { from: "/funding" },
    { from: "/funding", hops: 0 },
    { from: "/funding", hops: 1.5 },
    { from: "//example.org", hops: 1 },
    { from: "https://example.org", hops: 1 },
    { from: 7, hops: 1 },
  ])
    assert.equal(readVisit(state), null, JSON.stringify(state));
});
test("a move records where it came from, and staying on a page keeps the first origin", () => {
  assert.deepEqual(nextVisit("/funding?q=water", null, "/funding/water", false), {
    from: "/funding?q=water",
    hops: 1,
  });
  // Another sheet over the same page, or a new query on the same page, is one more entry back to the same place.
  assert.deepEqual(nextVisit("/funding/water", { from: "/funding", hops: 1 }, "/funding/tools", false), {
    from: "/funding",
    hops: 2,
  });
  assert.deepEqual(
    nextVisit("/partners?state=ready", { from: "/your-initiative", hops: 1 }, "/partners?state=error", false),
    { from: "/your-initiative", hops: 2 },
  );
  // Replacing an entry leaves the page before it unchanged.
  const visit = { from: "/", hops: 1 };
  assert.equal(nextVisit("/funding", visit, "/funding?q=water", true), visit);
  assert.equal(nextVisit("/funding", null, "/funding?q=water", true), null);
});
test("a sheet sits over the page it opened from, or over its list when opened from a link", () => {
  const fund = matchRoute("/funding/water")!;
  assert.deepEqual(sheetBackground(fund, { from: "/?fixture=draft", hops: 1 }), { route: "/?fixture=draft", hops: 1 });
  assert.deepEqual(sheetBackground(fund, null), { route: "/funding", hops: 0 });
  // Another sheet cannot be the page underneath.
  assert.deepEqual(sheetBackground(fund, { from: "/initiatives/orchard", hops: 1 }), { route: "/funding", hops: 0 });
  assert.deepEqual(sheetBackground(matchRoute("/initiatives/orchard")!, null), { route: "/initiatives", hops: 0 });
});
test("the back link returns to where the person came from, otherwise one level up", () => {
  // Tabs have no back link, and a sheet closes instead.
  for (const path of ["/", "/funding", "/initiatives", "/your-initiatives", "/funding/water"])
    assert.equal(backTarget(matchRoute(path), { from: "/", hops: 1 }), null, path);
  assert.equal(backTarget(undefined, null), null);
  // Opened from a link: one level up, as a new page.
  assert.deepEqual(backTarget(matchRoute("/settings"), null), {
    label: "Your Initiatives",
    href: "/your-initiatives",
    hops: 0,
  });
  assert.deepEqual(backTarget(matchRoute("/start/needs"), null), {
    label: "Check your card",
    href: "/start/initiative/check",
    hops: 0,
  });
  // Reached from another page: back to it, by as many entries as the visit counted.
  assert.deepEqual(backTarget(matchRoute("/settings"), { from: "/funding?q=water", hops: 2 }), {
    label: "Funding",
    href: "/funding?q=water",
    hops: 2,
  });
  // Reached from a sheet: the link names the page under it.
  assert.deepEqual(backTarget(matchRoute("/start/initiative"), { from: "/funding/water", hops: 1 }), {
    label: "Funding",
    href: "/funding/water",
    hops: 1,
  });
  // A visit that names the page itself says nothing about where the person came from.
  assert.deepEqual(backTarget(matchRoute("/partners"), { from: "/partners?state=error", hops: 1 }), {
    label: "Your initiative",
    href: "/your-initiative",
    hops: 0,
  });
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
  assert.equal(documentTitle(matchRoute(path)), "Your initiative | Weave");
  assert.equal(returnTask(path), path);
  for (const value of ["/workspaces/unknown", `${path}/other`, `${path}?return=//example.org`]) {
    assert.equal(matchRoute(value), undefined);
    assert.throws(() => returnTask(value), { code: "invalid_return_task" });
  }
});
