import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicProjectCard, PublicProjectPage } from "@weave/api/public-projects-contract";
import {
  contactLine, missingLine, projectAddress, projectFit, projectPassages, projectSlug, projectUriOf, publicProjectPath, rememberedProject, rememberProject,
  requestPublicProject,
} from "../src/partners/public-project.ts";
import { matchRoute } from "../src/routes.ts";

// The shape every project the index listed on 22 November 2026 has: a PLC account and a timestamp record key.
const URI = "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/3n2t7jfkyl72j";
const card = (uri = URI, passages = ["We restore wetlands along the river and grow native seedlings."]): PublicProjectCard => ({
  uri, name: "Serpentine Food Forest", passages, sharedAt: "2026-11-21T13:30:53.072000Z", checkedAt: "2026-11-22T04:18:29.205000Z",
  sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri)}`,
  publisher: "Matt",
});
const page = (projects: PublicProjectCard[]): PublicProjectPage => ({
  index: { status: "bounded", checkedAt: "2026-11-22T04:19:17.171000Z", total: projects.length }, projects, next: null,
});

test("a public project has one Weave address, which the app opens as that project and nothing else", () => {
  assert.equal(projectSlug(URI), "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j");
  assert.equal(projectAddress(URI), "/initiatives/c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j");
  assert.equal(projectUriOf("c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j"), URI, "the address names the project back");
  const route = matchRoute(projectAddress(URI)!);
  assert.deepEqual([route?.name, route?.id], ["initiative-detail", "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j"]);
  // Addresses that are not a project's: an example's name, a short account, capitals, extra parts.
  for (const slug of ["orchard", "c5lypin6swijs33nusbbtxf-3n2t7jfkyl72j", "C5LYPIN6SWIJS33NUSBBTXFS-3N2T7JFKYL72J",
    "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j-x", "c5lypin6swijs33nusbbtxfs3n2t7jfkyl72j"])
    assert.equal(projectUriOf(slug), null, slug);
  // A project with no address of this shape has no page, and its card keeps its name unlinked.
  for (const other of [
    "at://did:web:example.org/org.hypercerts.collection/3n2t7jfkyl72j",
    "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/self",
    "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.claim.activity/3n2t7jfkyl72j",
    `${URI}/more`,
    "https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection",
  ]) assert.equal(projectAddress(other), null, other);
});

test("a project opened from a link is read from the list by its address, and only that project counts", async () => {
  assert.equal(publicProjectPath(URI), `/api/public-projects?uri=${encodeURIComponent(URI)}`);
  const asked: string[] = [];
  const answer = (body: PublicProjectPage, status = 200) => (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return Response.json(body, { status });
  }) as typeof fetch;
  const signal = new AbortController().signal;
  assert.deepEqual(await requestPublicProject(URI, signal, answer(page([card()]))), { status: "found", card: card() });
  assert.deepEqual(asked, [publicProjectPath(URI)]);
  // Withdrawn or never listed is not an error, and the list being off says so rather than "withdrawn".
  assert.deepEqual(await requestPublicProject(URI, signal, answer(page([]))), { status: "missing" });
  assert.deepEqual(await requestPublicProject(URI, signal, answer({ ...page([]), index: { status: "off", checkedAt: null, total: 0 } })),
    { status: "off" });
  // An answer about another project is not this one, as from a server that ignores the address.
  const other = "at://did:plc:vxghsglzk24hbujvq6mvgsp5/org.hypercerts.collection/3n2r2joirt226";
  assert.deepEqual(await requestPublicProject(URI, signal, answer(page([card(other)]))), { status: "missing" });
  await assert.rejects(requestPublicProject(URI, signal, answer(page([]), 503)), /public_projects_unavailable/);
  assert.match(missingLine("missing"), /may have withdrawn it, or Weave may not have read it yet/);
  assert.doesNotMatch(missingLine("off"), /withdrawn/, "a list that is off never reads as a withdrawal");
});

test("Get In Touch points to the publisher's own links, never to the record's raw data", () => {
  assert.equal(contactLine(null), "Weave makes no introductions yet.", "nothing is promised before the initiative answers");
  assert.match(contactLine(true), /Their own links may say how to reach them\.$/u);
  assert.match(contactLine(false), /has shared no links to reach it\.$/u);
  for (const line of [contactLine(null), contactLine(true), contactLine(false)])
    assert.doesNotMatch(line, /record|Certified/u, line);
});

test("a card opened from a list shows at once, and the tab keeps only a few pages of them", () => {
  rememberProject(card());
  assert.deepEqual(rememberedProject(URI), card());
  for (let n = 0; n < 130; n++) rememberProject(card(`at://did:plc:${"a".repeat(24)}/org.hypercerts.collection/${String(n).padStart(13, "a")}`));
  assert.equal(rememberedProject(URI), undefined, "the oldest card made room");
});

test("a project's words are said once, without the short description that only begins the long one", () => {
  const long = "Funds will support community-led restoration, including indigenous tree seedlings and monitoring of tree survival.";
  assert.deepEqual(projectPassages({ passages: ["Funds will support community-led restoration, including indigenous tree seedl...", long] }), [long]);
  assert.deepEqual(projectPassages({ passages: ["Funds will support community-led restoration…", long] }), [long]);
  assert.deepEqual(projectPassages({ passages: [long, long] }), [long], "the same words twice are said once");
  assert.deepEqual(projectPassages({ passages: ["Rewilding farm land.", "With neighbours."] }), ["Rewilding farm land.", "With neighbours."]);
});

test("fit with the person's initiative is worked out on the device from its open needs and offers", () => {
  const item = (id: string, title: string, status = "open") => ({ id, value: { title, status, description: null, purpose: null, placeScope: "anywhere" } });
  const initiative = (needs: ReturnType<typeof item>[], offers: ReturnType<typeof item>[] = []) =>
    ({ id: "6f1c5d6e-0d1b-4c8e-9a51-0f7f1e3f9a10", revision: 0, needs, offers });
  const fit = projectFit(card(), initiative([item("n1", "Native seedlings for wetland planting")], [item("o1", "Bookkeeping for small groups")]));
  assert.ok(fit);
  assert.deepEqual(fit.fits.map(({ query }) => query.entryId), ["n1"], "only the need its words share");
  assert.equal(fit.fits[0]!.match.evidenceKind, "inferred_capability", "read from its work, never an offer it made");
  assert.equal(fit.id, URI);
  // Nothing open to compare: no answer, so the page asks for needs and offers instead.
  assert.equal(projectFit(card(), initiative([])), null);
  assert.equal(projectFit(card(), initiative([item("n1", "Native seedlings", "closed")])), null);
  // Words that share nothing: a comparison with no fits, said as such.
  assert.deepEqual(projectFit(card(), initiative([item("n1", "Accounting software licences")]))?.fits, []);
});
