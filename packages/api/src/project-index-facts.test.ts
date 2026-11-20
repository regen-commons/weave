// Who shared a project, where it is and what kind of group shared it: read from the listing item, each
// optional, and never a reason to drop or change the project itself.
import assert from "node:assert/strict";
import test from "node:test";
import { extractCollection, NO_PROJECT_FACTS, type ProjectRead } from "./project-index-source.ts";
import { projectDid, projectUri, projectView, realisticProjectView } from "./test-data/public-projects.ts";

const fetchedAt = "2026-11-19T04:00:00.000Z";
type Indexed = Extract<ProjectRead, { status: "indexed" }>;
function indexed(view: unknown, uri: string): Indexed {
  const read = extractCollection(view, uri, fetchedAt);
  if (read.status !== "indexed") assert.fail(`expected an indexed project, got ${JSON.stringify(read)}`);
  return read;
}
/** The project as it would be read with none of the three facts. */
const bare = (n: number) => indexed(projectView(n), projectUri(n));

test("a realistic listing item gives the publisher, the pinned place and the kind of group, and nothing else", () => {
  const view = realisticProjectView();
  const read = indexed(view, view.uri);
  assert.deepEqual(read.facts, { publisher: "Lagoa Seed Library", place: "São Paulo, Brazil", organizationTypes: ["nonprofit"] });
  assert.deepEqual(read.passages.map(({ passage }) => passage),
    ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring and return seed after harvest."]);
  // The banner, the organization's links, the handle and the coordinates are never read.
  assert.doesNotMatch(JSON.stringify(read), /seeds\.example\.org|bafkrei|-46\.63|certified\.one|image\/jpeg/u);
  // The facts come from other records, so they change neither the passages nor the content hash.
  const { location: _location, ...rest } = view;
  const plain = indexed({ ...rest, author: { ...rest.author, profile: null, organization: null } }, view.uri);
  assert.deepEqual(plain.facts, NO_PROJECT_FACTS);
  assert.equal(plain.contentHash, read.contentHash);
  assert.deepEqual(plain.passages, read.passages);
});

test("a project with none of them is indexed exactly as before", () => {
  const read = bare(1);
  assert.deepEqual(read.facts, { publisher: null, place: null, organizationTypes: [] });
  const named = indexed(projectView(1, { publisher: "Riverkeepers", place: "Awka, Nigeria", organizationTypes: ["cooperative"] }), projectUri(1));
  assert.deepEqual(named.facts, { publisher: "Riverkeepers", place: "Awka, Nigeria", organizationTypes: ["cooperative"] });
  assert.equal(named.contentHash, read.contentHash);
  assert.deepEqual(named.passages, read.passages);
  assert.equal(named.cid, read.cid);
});

test("names and places are one line of plain text, and anything else is left out without failing the project", () => {
  const publisher = (value: unknown) => indexed(projectView(2, { publisher: value }), projectUri(2)).facts.publisher;
  const place = (value: unknown) => indexed(projectView(2, { place: value }), projectUri(2)).facts.place;
  assert.equal(publisher("  Lagoa   Seed\nLibrary "), "Lagoa Seed Library");
  assert.equal(publisher("Coletivo Ação Verde 🌱"), "Coletivo Ação Verde 🌱");
  assert.equal(publisher("x".repeat(120)), "x".repeat(120));
  assert.equal(place("Ciudad Autónoma de Buenos Aires, Argentina"), "Ciudad Autónoma de Buenos Aires, Argentina");
  const refused: unknown[] = [
    42, null, true, ["Lagoa"], { name: "Lagoa" }, "", "   ", "x".repeat(121), "x".repeat(10_000),
    "Write to someone@example.com", "See https://example.org", "www.example.org", "mailto:someone",
    "Call +55 11 91234 5678", "<b>Lagoa</b>", "Lagoa\u0000Seed", "Lagoa\u0007", "‮yrarbil", "Lagoa​Seed",
    "Lone \ud800 surrogate",
  ];
  for (const value of refused) {
    assert.equal(publisher(value), null, JSON.stringify(value));
    assert.equal(place(value), null, JSON.stringify(value));
  }
  // Each project is still indexed with the same words and hash.
  const read = indexed(projectView(2, { publisher: "See https://example.org", place: 5, organizationTypes: "nonprofit" }), projectUri(2));
  assert.deepEqual(read.facts, NO_PROJECT_FACTS);
  assert.equal(read.contentHash, bare(2).contentHash);
});

test("a profile that names another account, or is not a Certified profile, is not read", () => {
  const did = projectDid(3);
  const view = (profile: unknown) => ({ ...projectView(3), author: { did, organization: null, profile } });
  const record = { $type: "app.certified.actor.profile", displayName: "Riverkeepers" };
  const good = { did, uri: `at://${did}/app.certified.actor.profile/self`, record };
  assert.equal(indexed(view(good), projectUri(3)).facts.publisher, "Riverkeepers");
  // A hydrated profile that leaves out its own address or type is still the author's.
  assert.equal(indexed(view({ record: { displayName: "Riverkeepers" } }), projectUri(3)).facts.publisher, "Riverkeepers");
  for (const profile of [
    { ...good, did: projectDid(4) },
    { ...good, uri: `at://${projectDid(4)}/app.certified.actor.profile/self` },
    { ...good, uri: `at://${did}/app.bsky.actor.profile/self` },
    { ...good, record: { ...record, $type: "app.bsky.actor.profile" } },
    { ...good, record: null }, { ...good, record: "Riverkeepers" }, "Riverkeepers", [good], undefined,
  ]) assert.equal(indexed(view(profile), projectUri(3)).facts.publisher, null, JSON.stringify(profile));
});

test("a place is read only when the listing hydrated the exact version the record pins", () => {
  type Place = { uri: string; cid: string; did: string };
  const base = projectView(5, { place: "Awka, Nigeria" }) as ReturnType<typeof projectView> & {
    location: { uri: string; cid: string; record: Place };
    record: { location: { uri: string; cid: string } & Record<string, unknown> };
  };
  const place = (change: (view: typeof base) => void) => {
    const view = structuredClone(base);
    change(view);
    return indexed(view, projectUri(5)).facts.place;
  };
  assert.equal(place(() => undefined), "Awka, Nigeria");
  // A strong reference that names its own type is still a strong reference.
  assert.equal(place((view) => { view.record.location.$type = "com.atproto.repo.strongRef"; }), "Awka, Nigeria");
  const newer = `bafyrei${"z".repeat(52)}`;
  const elsewhere = `at://${projectDid(5)}/app.certified.location/elsewhere`;
  const refused: [string, (view: typeof base) => void][] = [
    ["a newer version of the place", (view) => { view.location.cid = newer; view.location.record.cid = newer; }],
    ["a view of a newer version under the pinned reference", (view) => { view.location.record.cid = newer; }],
    ["another place", (view) => { view.location.uri = elsewhere; view.location.record.uri = elsewhere; }],
    ["a view of another place under the pinned reference", (view) => { view.location.record.uri = elsewhere; }],
    ["a hydrated place the record does not pin", (view) => { delete (view.record as { location?: unknown }).location; }],
    ["a pinned place the listing did not hydrate", (view) => { delete (view as { location?: unknown }).location; }],
    ["a hydrated reference without a version", (view) => { delete (view.location as { cid?: string }).cid; }],
    ["a hydrated view without a version", (view) => { delete (view.location.record as { cid?: string }).cid; }],
    ["a pin without a version", (view) => { delete (view.record.location as { cid?: string }).cid; }],
    ["a record of another type", (view) => { (view.location.record as { record: unknown }).record = { $type: "app.certified.actor.profile", name: "Awka" }; }],
    ["a place with no record", (view) => { (view.location.record as { record: unknown }).record = null; }],
    ["a place with no name", (view) => { (view.location.record as { record: unknown }).record = { $type: "app.certified.location" }; }],
    // The flat shape first reported for 19 November; the listing nests the record one level deeper.
    ["a name one level up", (view) => { (view.location as { record: unknown }).record = { $type: "app.certified.location", name: "Awka" }; }],
    ["a location that is a list", (view) => { (view as { location: unknown }).location = [view.location]; }],
  ];
  for (const [what, change] of refused) assert.equal(place(change), null, what);
});

test("kinds of group are normalized words, unique and bounded, and anything else is left out", () => {
  const types = (value: unknown) => indexed(projectView(6, { organizationTypes: value }), projectUri(6)).facts.organizationTypes;
  assert.deepEqual(types(["nonprofit"]), ["nonprofit"]);
  assert.deepEqual(types(["Non_Profit", "non profit", "  NONPROFIT ", "nonprofit", "community-group"]),
    ["community-group", "non-profit", "nonprofit"]);
  assert.deepEqual(types([42, null, "", "dao!", "x".repeat(41), "1st", "-lead", "trailing-", "https://example.org", "nonprofit"]), ["nonprofit"]);
  // Free text in any language is kept as written, in one form: composed or not, "Grupo comunitário" is one kind.
  assert.deepEqual(types(["Grupo comunitário", "grupo comunita\u0301rio", "Coopérative"]), ["coopérative", "grupo-comunitário"]);
  // An interface string that leaked into the record is not a kind of group.
  assert.deepEqual(types(["upload.dashboardModals.orgType.suggestions.researchInstitute"]), []);
  assert.deepEqual(types(Array.from({ length: 30 }, (_, n) => `kind${n}`)), ["kind0", "kind1", "kind2", "kind3", "kind4"]);
  for (const value of ["nonprofit", null, 7, { nonprofit: true }, []]) assert.deepEqual(types(value), [], JSON.stringify(value));
  // An organization that asks to be unlisted is still not shown, whatever kind it says it is.
  assert.deepEqual(extractCollection(projectView(6, { unlisted: "organization", organizationTypes: ["nonprofit"] }), projectUri(6), fetchedAt),
    { status: "restricted", code: "not_discoverable" });
});
