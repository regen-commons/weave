// Who shared a project, where it is and what kind of group shared it: read from the listing item, each
// optional, and never a reason to drop or change the project itself.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createHypercertsSource, extractCollection, NO_PROJECT_FACTS, ORGANIZATION_DESCRIPTION_MAX, type ProjectRead,
} from "./project-index-source.ts";
import {
  activityRecord, activityUri, notIndexed, projectDid, projectListing, projectUri, projectView, realisticProjectView, tagRecord, tagUri,
} from "./test-data/public-projects.ts";

const fetchedAt = "2026-11-19T04:00:00.000Z";
type Indexed = Extract<ProjectRead, { status: "indexed" }>;
function indexed(view: unknown, uri: string): Indexed {
  const read = extractCollection(view, uri, fetchedAt);
  if (read.status !== "indexed") assert.fail(`expected an indexed project, got ${JSON.stringify(read)}`);
  return read;
}
/** No facts from the listing. The work scope is not in the listing, so a listing read never looks at it. */
const NOTHING_LISTED = { ...NO_PROJECT_FACTS, workScope: null };
const bare = (n: number) => indexed(projectView(n), projectUri(n));

test("a realistic listing item gives the publisher, the pinned place, the kind of group and the organization's description, and nothing else", () => {
  const view = realisticProjectView();
  const read = indexed(view, view.uri);
  assert.deepEqual(read.facts, {
    publisher: "Lagoa Seed Library", place: "São Paulo, Brazil", organizationTypes: ["nonprofit"],
    organizationDescription: "Neighbours who keep and share seed.", workScope: null,
  });
  assert.deepEqual(read.passages.map(({ passage }) => passage),
    ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring and return seed after harvest."]);
  // The banner, the organization's links, the handle and the coordinates are never read.
  assert.doesNotMatch(JSON.stringify(read), /seeds\.example\.org|bafkrei|-46\.63|certified\.one|image\/jpeg/u);
  // The facts come from other records, so they change neither the passages nor the content hash.
  const { location: _location, ...rest } = view;
  const plain = indexed({ ...rest, author: { ...rest.author, profile: null, organization: null } }, view.uri);
  assert.deepEqual(plain.facts, NOTHING_LISTED);
  assert.equal(plain.contentHash, read.contentHash);
  assert.deepEqual(plain.passages, read.passages);
});

test("a project with none of them is indexed exactly as before", () => {
  const read = bare(1);
  assert.deepEqual(read.facts, NOTHING_LISTED);
  const named = indexed(projectView(1, { publisher: "Riverkeepers", place: "Awka, Nigeria", organizationTypes: ["cooperative"] }), projectUri(1));
  assert.deepEqual(named.facts, { ...NOTHING_LISTED, publisher: "Riverkeepers", place: "Awka, Nigeria", organizationTypes: ["cooperative"] });
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
  // A place with a digit is a location fix, precise enough to find a home: a house number, a postcode, a
  // plus code or coordinates. None is shown. A publisher's name may hold digits.
  for (const fix of ["221B Baker Street, London NW1 6XE", "Flat 4, 12 Rua das Flores, Olinda", "Rua Augusta 1508, São Paulo",
    "9F4M+XW Lagos, Nigeria", "-23.5505, -46.6333", "Distrito 9"]) assert.equal(place(fix), null, fix);
  assert.equal(publisher("Riverkeepers 2050"), "Riverkeepers 2050");
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
  assert.deepEqual(read.facts, NOTHING_LISTED);
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

test("an organization's description is read under a project description's rules, and anything else is left out", () => {
  const read = (value: unknown) => indexed(projectView(9, { organizationDescription: value }), projectUri(9));
  const described = (value: unknown) => read(value).facts.organizationDescription;
  const text = (value: string) => ({ $type: "org.hypercerts.defs#descriptionString", value });
  assert.equal(described(text("  We guard the river.\n\nVolunteers   test the water each season. ")),
    "We guard the river. Volunteers test the water each season.");
  // A sentence with a link, an address or a phone number is dropped, as is one too short to be a passage.
  assert.equal(described(text("Write to us at team@example.org. See https://example.org for more. Call +55 11 91234 5678. "
    + "Hi. We keep heirloom seed in a shared library.")), "We keep heirloom seed in a shared library.");
  // A Leaflet document gives its text and header blocks, up to a members-only boundary.
  const block = (block: unknown) => ({ block });
  assert.equal(described({ $type: "pub.leaflet.pages.linearDocument", blocks: [
    block({ $type: "pub.leaflet.blocks.header", plaintext: "Our seed library" }),
    block({ $type: "pub.leaflet.blocks.image", image: "bafkrei" }),
    block({ $type: "pub.leaflet.blocks.text", plaintext: "Neighbours borrow seed in spring." }),
    block({ $type: "pub.leaflet.blocks.membersOnlyDelimiter" }),
    block({ $type: "pub.leaflet.blocks.text", plaintext: "Members meet on the first Sunday." }),
  ] }), "Our seed library Neighbours borrow seed in spring.");
  // Five passages at most, kept whole, and never past the column's limit: five of 600 characters would be.
  const long = (k: number) => `${String.fromCharCode(65 + k)}${"e".repeat(598)}.`;
  const kept = described(text(Array.from({ length: 6 }, (_, k) => long(k)).join(" ")));
  assert.equal(kept, Array.from({ length: 4 }, (_, k) => long(k)).join(" "));
  assert.ok(kept !== null && kept.length <= ORGANIZATION_DESCRIPTION_MAX);
  const short = (k: number) => `Sentence ${String.fromCharCode(65 + k)} is short.`;
  assert.equal(described(text(Array.from({ length: 8 }, (_, k) => short(k)).join(" "))),
    Array.from({ length: 5 }, (_, k) => short(k)).join(" "));
  // A reference to another record is not followed, and a malformed value is left out without failing the project.
  const strongRef = { $type: "com.atproto.repo.strongRef", uri: `at://${projectDid(9)}/pub.leaflet.document/1`, cid: "bafyrei" };
  for (const value of [strongRef, "We guard the river.", 42, null, [], { value: "We guard the river." }, text(""),
    { $type: "org.hypercerts.defs#descriptionString", value: 7 }, { $type: "pub.leaflet.pages.linearDocument", blocks: "x" },
    text("See https://example.org."), text("Lone \ud800 surrogate in a sentence.")]) {
    const project = read(value);
    assert.equal(project.facts.organizationDescription, null, JSON.stringify(value));
    assert.equal(project.contentHash, bare(9).contentHash);
  }
  // It describes the publisher, so it is never one of the project's passages and never changes its hash.
  const project = read(text("We guard the river."));
  assert.equal(project.contentHash, bare(9).contentHash);
  assert.deepEqual(project.passages, bare(9).passages);
  assert.doesNotMatch(JSON.stringify(project.passages), /guard the river/u);
});

test("the activity read for a project's kinds of work is the first one from its publisher's own repository", () => {
  const activity = (activities: string[] | undefined) => indexed(projectView(7, { activities }), projectUri(7)).activity;
  assert.equal(activity([activityUri(7)]), activityUri(7));
  assert.equal(activity([activityUri(7, projectDid(8)), activityUri(7)]), activityUri(7), "another account's is passed over");
  assert.equal(activity([`at://${projectDid(7)}/org.hypercerts.collection/other`, activityUri(7)]), activityUri(7));
  for (const items of [undefined, [], [activityUri(7, projectDid(8))]]) assert.equal(activity(items), null, JSON.stringify(items));
  // A malformed item is passed over, never a reason to fail the project.
  const view = projectView(7, { activities: [activityUri(7)] });
  view.record = { ...view.record, items: [null, 5, { itemIdentifier: "x" }, { itemIdentifier: { uri: `${activityUri(7)}/extra` } },
    { itemIdentifier: { uri: activityUri(7) } }] } as typeof view.record;
  assert.equal(indexed(view, projectUri(7)).activity, activityUri(7));
  // Items change neither the passages nor the content hash.
  assert.equal(indexed(view, projectUri(7)).contentHash, bare(7).contentHash);
});

test("a work scope reads only tags with a usable key, and a strange answer from the index is a failure, not none", async () => {
  const tags = new Map<string, unknown>();
  const activities = new Map<string, unknown>();
  const reader = () => createHypercertsSource({ wait: async () => undefined, fetch: projectListing({ views: [], activities, tags }) })
    .workScopeReader();
  const read = (n: number) => reader()(activityUri(n));
  const keys = ["Disaster Relief", "forest_protection", "x".repeat(61), "", "Bad.Key", "water"];
  keys.forEach((key, n) => tags.set(tagUri(`k${n}`), tagRecord(key)));
  tags.set(tagUri("other-type"), { ...tagRecord("energy"), $type: "org.hypercerts.vocab.tag" });
  tags.set(tagUri("gone"), () => Response.json({ error: "RecordNotFound" }, { status: 400 }));
  activities.set(activityUri(1), activityRecord([...keys.map((_, n) => tagUri(`k${n}`)), tagUri("other-type"), tagUri("gone")]));
  assert.deepEqual(await read(1), { status: "read", keys: ["disaster-relief", "forest-protection", "water"] });
  // A tag reference that is not a tag's address is never looked up.
  activities.set(activityUri(2), { ...activityRecord([]), workScope: { ...activityRecord([]).workScope,
    usedTags: [{ uri: activityUri(2) }, { uri: "https://example.org/tag" }, null, 5] } });
  assert.deepEqual(await read(2), { status: "read", keys: [] });
  // A record that is not an activity names nothing; an answer about another address is not trusted.
  activities.set(activityUri(3), { ...activityRecord([tagUri("k5")]), $type: "org.hypercerts.claim.rights" });
  assert.deepEqual(await read(3), { status: "read", keys: [] });
  activities.set(activityUri(4), () => Response.json({ activity: { uri: activityUri(5), record: activityRecord([tagUri("k5")]) } }));
  assert.deepEqual(await read(4), { status: "failed", code: "invalid_source_record" });
  // Not indexed, as a 500 or a 400, is none; any other 500 is an outage.
  assert.deepEqual(await read(6), { status: "read", keys: [] });
  activities.set(activityUri(7), () => Response.json({ error: "RecordNotFound" }, { status: 404 }));
  assert.deepEqual(await read(7), { status: "read", keys: [] });
  activities.set(activityUri(8), () => Response.json({ error: "script_error", message: "runtime error: timeout" }, { status: 500 }));
  assert.deepEqual(await read(8), { status: "failed", code: "source_unavailable" });
  // A tag that fails fails the project, so a partial set never replaces a whole one.
  tags.set(tagUri("busy"), () => new Response("busy", { status: 503 }));
  activities.set(activityUri(9), activityRecord([tagUri("k5"), tagUri("busy")]));
  assert.deepEqual(await read(9), { status: "failed", code: "source_unavailable" });
  assert.equal(notIndexed("x").status, 500);
});
