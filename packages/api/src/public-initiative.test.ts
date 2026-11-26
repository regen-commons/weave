import assert from "node:assert/strict";
import test from "node:test";
import type { CertifiedProjectProvider } from "./certified-project-provider.ts";
import { createPublicInitiative, readPublisherLinks, type PublisherLinkReader } from "./public-initiative.ts";
import {
  isPublicInitiativeOff, parsePublicInitiative, parsePublicInitiativeQuery, PUBLIC_INITIATIVE_PATH, publicInitiativeUrl,
  SUPPORT_LISTING_COLLECTION, type PublicInitiative,
} from "./public-initiative-contract.ts";
import type { PublicInitiativeReader, StoredInitiative } from "./public-initiative-store.ts";
import { ROUTE_KEY, GET as route } from "./router.ts";
import { SUPPORT_COLLECTION } from "./support-publication.ts";

// Synthetic records only.
const did = "did:plc:fixtureinitiativeaaaaaaa";
const uri = `at://${did}/org.hypercerts.collection/3m6bq4seedlib`;
const other = `at://did:plc:fixtureinitiativebbbbbbb/org.hypercerts.collection/3m6bq4seedlib`;
const cid = (n: number) => `bafyrei${"l".repeat(51)}${"abcdefgh"[n]}`;
const listingUri = (rkey: string, repository = did) => `at://${repository}/${SUPPORT_COLLECTION}/${rkey}`;
const sourceUrl = `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri)}`;
const NOW = Date.parse("2026-11-25T12:00:00.000Z");
const request = (search: string, init?: RequestInit) => new Request(`https://weave.example${PUBLIC_INITIATIVE_PATH}${search}`, init);
const asked = (target = uri) => request(`?uri=${encodeURIComponent(target)}`);

const listingRecord = (kind: "need" | "offer", title: string, overrides: Record<string, unknown> = {}) => ({
  $type: SUPPORT_COLLECTION, projectUri: uri, kind, title, capitalForms: ["social"], status: "open",
  createdAt: "2026-11-09T18:00:00.000Z", ...overrides,
});
const row = (kind: "need" | "offer", rkey: string, n: number, overrides: Record<string, unknown> = {}, record?: unknown) =>
  ({ kind, uri: listingUri(rkey), cid: cid(n), record: record ?? listingRecord(kind, `${kind} ${rkey}`, overrides) });

const storedProject = {
  uri, name: "Community seed library",
  passages: [
    "We keep heirloom seed in a shared library...",
    "We keep heirloom seed in a shared library for the whole valley.",
    "Neighbours borrow seed in spring and return seed after harvest.",
  ],
  sourceUrl, organizationTypes: ["nonprofit", "grupo-comunitário", "community-group", "Not A Kind"],
  workScopes: ["seed-saving", "seed-saving", "Not_a_scope"],
  sharedAt: "2026-09-02T10:00:00.000000Z", checkedAt: "2026-11-24T04:01:00.000000Z",
  publisher: "Lagoa Seed Library", place: "Write\u0000here",
};
const need = row("need", "3jui7kd54zh2y", 0, {
  description: "Seed jars and labels for the spring swap.", capitalForms: ["material", "social"],
  createdAt: "2026-11-10T18:00:00.000Z", updatedAt: "2026-11-11T18:00:00.000Z", expiresAt: "2027-01-31T00:00:00.000Z",
  lenses: ["place_based"],
});
const offer = row("offer", "3jui7kd54zh3a", 1);
const shown: PublicInitiative = {
  project: {
    uri, name: "Community seed library",
    description: [
      "We keep heirloom seed in a shared library for the whole valley.",
      "Neighbours borrow seed in spring and return seed after harvest.",
    ],
    focus: ["seed-saving"], organizationTypes: ["nonprofit", "community-group"], publisher: "Lagoa Seed Library",
    publisherLinks: [], sharedAt: "2026-09-02T10:00:00.000000Z", checkedAt: "2026-11-24T04:01:00.000000Z", sourceUrl,
  },
  needs: [{
    uri: listingUri("3jui7kd54zh2y"), cid: cid(0), title: "need 3jui7kd54zh2y", description: "Seed jars and labels for the spring swap.",
    capitalForms: ["material", "social"], createdAt: "2026-11-10T18:00:00.000Z", updatedAt: "2026-11-11T18:00:00.000Z",
    expiresAt: "2027-01-31T00:00:00.000Z",
  }],
  offers: [{
    uri: listingUri("3jui7kd54zh3a"), cid: cid(1), title: "offer 3jui7kd54zh3a", description: null, capitalForms: ["social"],
    createdAt: "2026-11-09T18:00:00.000Z", updatedAt: null, expiresAt: null,
  }],
  checkedAt: new Date(NOW).toISOString(),
};

type Options = Parameters<typeof createPublicInitiative>[0];
function handler(stored: StoredInitiative | null | (() => Promise<StoredInitiative | null>), options: Partial<Options> = {}) {
  const loads: string[] = [];
  const reader: PublicInitiativeReader = {
    load: async (asked) => { loads.push(asked); return typeof stored === "function" ? stored() : stored; },
    close: async () => undefined,
  };
  const handle = createPublicInitiative({ reader: async () => reader, links: () => null, now: () => NOW, ...options });
  return { handle, loads };
}
async function answer(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return { status: response.status, body: await response.json() as unknown };
}

test("one shown project answers its public detail and only its current listings, read for exactly that address", async () => {
  const { handle, loads } = handler({ project: storedProject, listings: [offer, need] });
  const { status, body } = await answer(await handle(asked()));
  assert.equal(status, 200);
  // The truncated passage is said once; kinds the app refuses, a repeated scope and an unsafe place are left out.
  assert.deepEqual(body, shown);
  assert.deepEqual(loads, [uri]);
  assert.deepEqual(parsePublicInitiative(body), shown);
});

test("listings are checked again: another project, an expiry that has passed or an invalid record never reach the page", async () => {
  const expiring = (expiresAt: string) => row("need", "3jui7kd54zh4b", 2, { expiresAt });
  const stale = [
    row("need", "3jui7kd54zh5c", 3, { projectUri: other }),
    expiring("2026-11-25T12:00:00.000Z"),
    expiring("2026-11-25T11:59:59.999Z"),
    row("need", "3jui7kd54zh6d", 4, { status: "met" }),
    row("need", "3jui7kd54zh7e", 5, { capitalForms: ["social", "social"] }),
    row("need", "3jui7kd54zh7f", 5, { capitalForms: ["time"] }),
    row("need", "3jui7kd54zh7g", 5, { title: " " }),
    row("need", "3jui7kd54zh7h", 5, { private: "Private purpose" }),
    row("need", "3jui7kd54zh7i", 5, { $type: "app.example.listing" }),
    row("need", "3jui7kd54zh7j", 5, { expiresAt: "2026-11-01T00:00:00.000Z" }),
    { ...row("offer", "3jui7kd54zh8f", 6), kind: "need" },
    { ...row("need", "3jui7kd54zh9g", 7), uri: listingUri("3jui7kd54zh9g", "did:plc:fixtureinitiativebbbbbbb") },
    { ...row("need", "3jui7kd54zh9h", 7), uri: `at://${did}/app.example.listing/3jui7kd54zh9h` },
    { ...row("need", "3jui7kd54zh9i", 7), uri: listingUri("listing-one") },
    { ...row("need", "3jui7kd54zh9j", 7), cid: "not-a-cid" },
    { ...need, cid: cid(7) },
    null, "listing", [],
  ];
  const { handle } = handler({ project: storedProject, listings: [need, ...stale, offer] });
  const { status, body } = await answer(await handle(asked()));
  assert.equal(status, 200);
  assert.deepEqual(body, shown);
  // One that expires later than this answer is still shown.
  const later = handler({ project: storedProject, listings: [expiring("2026-11-25T12:00:00.001Z")] });
  const kept = (await answer(await later.handle(asked()))).body as PublicInitiative;
  assert.deepEqual(kept.needs.map(({ expiresAt }) => expiresAt), ["2026-11-25T12:00:00.001Z"]);
});

test("needs and offers are split by kind and read newest first, ties by address", async () => {
  const created = (kind: "need" | "offer", rkey: string, createdAt: string) => row(kind, rkey, 0, { createdAt });
  const listings = [
    created("offer", "3jui7kd54zhaa", "2026-11-01T00:00:00.000Z"),
    created("need", "3jui7kd54zhbb", "2026-11-02T00:00:00.000Z"),
    created("need", "3jui7kd54zhdd", "2026-11-03T00:00:00Z"),
    created("need", "3jui7kd54zhcc", "2026-11-03T00:00:00.000Z"),
    created("offer", "3jui7kd54zhee", "2026-11-04T00:00:00.000Z"),
  ];
  const { body } = await answer(await handler({ project: storedProject, listings }).handle(asked()));
  const { needs, offers } = body as PublicInitiative;
  assert.deepEqual(needs.map(({ uri }) => uri.slice(-13)), ["3jui7kd54zhcc", "3jui7kd54zhdd", "3jui7kd54zhbb"]);
  assert.deepEqual(offers.map(({ uri }) => uri.slice(-13)), ["3jui7kd54zhee", "3jui7kd54zhaa"]);
});

test("a withdrawal is gone from the very next answer: nothing is kept between requests", async () => {
  let listings: unknown[] = [need, offer];
  const { handle, loads } = handler(async () => ({ project: storedProject, listings }));
  assert.equal(((await answer(await handle(asked()))).body as PublicInitiative).needs.length, 1);
  listings = [offer];
  assert.equal(((await answer(await handle(asked()))).body as PublicInitiative).needs.length, 0);
  assert.equal(loads.length, 2);
});

test("an address the list does not show is not found, and the address must be one public initiative's alone", async () => {
  assert.deepEqual(await answer(await handler(null).handle(asked())), { status: 404, body: { error: "not_found" } });
  const { handle, loads } = handler({ project: storedProject, listings: [] });
  for (const search of [
    "", "?uri=", `?uri=${encodeURIComponent(uri)}&uri=${encodeURIComponent(uri)}`, `?uri=${encodeURIComponent(uri)}&q=seed`,
    `?q=seed&uri=${encodeURIComponent(uri)}`, `?URI=${encodeURIComponent(uri)}`,
    `?uri=${encodeURIComponent(`at://${did}/org.hypercerts.claim.activity/3m6bq4seedlib`)}`,
    `?uri=${encodeURIComponent(`at://${did}/${SUPPORT_COLLECTION}/3jui7kd54zh2y`)}`,
    `?uri=${encodeURIComponent(`at://${did}/org.hypercerts.collection/project1`)}`,
    `?uri=${encodeURIComponent(`at://${did}/org.hypercerts.collection/3M6BQ4SEEDLIB`)}`,
    `?uri=${encodeURIComponent(`at://${did}/org.hypercerts.collection/3m6bq4seedlibs`)}`,
    `?uri=${encodeURIComponent("at://did:web:garden.example.org/org.hypercerts.collection/3m6bq4seedlib")}`,
    `?uri=${encodeURIComponent("at://did:plc:short/org.hypercerts.collection/3m6bq4seedlib")}`,
    `?uri=${encodeURIComponent(`${uri}/extra`)}`, `?uri=${encodeURIComponent(uri.slice(5))}`,
  ]) assert.deepEqual(await answer(await handle(request(search))), { status: 400, body: { error: "invalid_uri" } }, search);
  assert.deepEqual(loads, [], "a refused address never reaches the database");
  const post = await handle(request(`?uri=${encodeURIComponent(uri)}`, { method: "POST" }));
  assert.equal(post.headers.get("allow"), "GET");
  assert.deepEqual(await answer(post), { status: 405, body: { error: "method_not_allowed" } });
});

test("a store that fails, hangs or holds a broken project answers a stable 503, and an unswitched list answers off", async () => {
  const unavailable = { status: 503, body: { error: "public_initiative_unavailable" } };
  const failing = createPublicInitiative({ reader: async () => { throw Error("password authentication failed for user x"); }, links: () => null });
  assert.deepEqual(await answer(await failing(asked())), unavailable);
  assert.deepEqual(await answer(await handler(async () => { throw Error("statement timeout"); }).handle(asked())), unavailable);
  const hanging = handler(() => new Promise<never>(() => undefined), { loadTimeoutMs: 20 });
  assert.deepEqual(await answer(await hanging.handle(asked())), unavailable);
  for (const stored of [
    { project: { ...storedProject, uri: other }, listings: [] },
    { project: { ...storedProject, name: "" }, listings: [] },
    { project: { ...storedProject, passages: [7] }, listings: [] },
    { project: { ...storedProject, sourceUrl: "https://example.org/collection" }, listings: [] },
    { project: { ...storedProject, sharedAt: "yesterday" }, listings: [] },
    { project: storedProject, listings: { need } },
    { project: null, listings: [] },
  ]) assert.deepEqual(await answer(await handler(stored).handle(asked())), unavailable);
  const off = createPublicInitiative({ reader: async () => null, links: () => { throw Error("not called"); } });
  assert.deepEqual(await answer(await off(asked())), { status: 200, body: { status: "off" } });
  assert.ok(isPublicInitiativeOff(parsePublicInitiative({ status: "off" })));
});

test("publisher links carry a label, drop what a page may not show, and give none when they cannot be read in time", async () => {
  const seen: string[] = [];
  const links: PublisherLinkReader = async (repository) => {
    seen.push(repository);
    return [
      { label: "Website", url: "https://seeds.example.org/" },
      { label: "Website again", url: "https://seeds.example.org/" },
      { label: "Bad", url: "javascript:alert(1)" },
      { label: "Secret", url: "https://someone:secret@seeds.example.org/" },
      { label: "Line\nbreak", url: "https://line.example.org/" },
      { label: "", url: "https://blank.example.org/" },
      { url: "https://unlabelled.example.org/" },
      ...["a", "b", "c", "d", "e", "f"].map((n) => ({ label: n, url: `https://${n}.example.org/` })),
    ];
  };
  const { handle } = handler({ project: storedProject, listings: [] }, { links: () => links });
  const body = (await answer(await handle(asked()))).body as PublicInitiative;
  assert.deepEqual(body.project.publisherLinks, [
    { label: "Website", url: "https://seeds.example.org/" },
    ...["a", "b", "c", "d", "e"].map((n) => ({ label: n, url: `https://${n}.example.org/` })),
  ]);
  assert.deepEqual(seen, [did], "links are read from the project's own repository");
  for (const [label, reader] of [
    ["a read that never ends", () => new Promise<never>(() => undefined)],
    ["a read that fails", async () => { throw Error("unavailable"); }],
    ["a malformed read", async () => ({ links: [] })],
  ] as const) {
    const slow = handler({ project: storedProject, listings: [need] }, { links: () => reader, linksTimeoutMs: 20 });
    const started = Date.now();
    const { status, body: page } = await answer(await slow.handle(asked()));
    assert.equal(status, 200, label);
    assert.deepEqual((page as PublicInitiative).project.publisherLinks, [], label);
    assert.ok(Date.now() - started < 1000, label);
  }
  // The deadline also reaches a reader that honours its signal.
  let aborted = false;
  const listening: PublisherLinkReader = (_, signal) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); });
  });
  await handler({ project: storedProject, listings: [] }, { links: () => listening, linksTimeoutMs: 20 }).handle(asked());
  assert.ok(aborted);
});

test("the publisher's organization record gives each link its own label or its host, and an unlisted one gives none", async () => {
  const organization = (value: Record<string, unknown>) => ({ $type: "app.certified.actor.organization", createdAt: "2026-09-02T10:00:00.000Z", ...value });
  const reads: string[] = [];
  const provider = (result: Awaited<ReturnType<CertifiedProjectProvider["readRepoRecord"]>>): Pick<CertifiedProjectProvider, "readRepoRecord"> => ({
    readRepoRecord: async (repo, nsid, rkey) => { reads.push(`${repo} ${nsid} ${rkey}`); return result; },
  });
  const record = (value: Record<string, unknown>) => provider({ ok: true, value: { cid: cid(0), value } });
  const signal = new AbortController().signal;
  const urls = [
    { url: "https://seeds.example.org/", label: "  Website  " },
    { url: "https://seeds.example.org/", label: "Again" },
    { url: "https://social.example.org/@seeds" },
    { url: "https://long.example.org/", label: "x".repeat(81) },
    { url: "https://exactly.example.org/", label: "y".repeat(80) },
    { url: "https://override.example.org/", label: "‮evil" },
    { url: "https://lines.example.org/", label: "two\nlines" },
    { url: "ftp://files.example.org/", label: "Files" },
  ];
  assert.deepEqual(await readPublisherLinks(record(organization({ urls })))(did, signal), [
    { label: "Website", url: "https://seeds.example.org/" },
    { label: "social.example.org", url: "https://social.example.org/@seeds" },
    { label: "long.example.org", url: "https://long.example.org/" },
    { label: "y".repeat(80), url: "https://exactly.example.org/" },
    { label: "override.example.org", url: "https://override.example.org/" },
    { label: "lines.example.org", url: "https://lines.example.org/" },
  ]);
  assert.deepEqual(reads, [`${did} app.certified.actor.organization self`]);
  for (const hidden of [{ visibility: "unlisted" }, { unlisted: true }])
    assert.deepEqual(await readPublisherLinks(record(organization({ urls, ...hidden })))(did, signal), []);
  assert.deepEqual(await readPublisherLinks(record({ $type: "app.example.other", urls }))(did, signal), []);
  for (const code of ["not_found", "unavailable", "unsupported"] as const)
    assert.deepEqual(await readPublisherLinks(provider({ ok: false, code }))(did, signal), []);
});

test("the contract reads only a sound answer, and the app builds the one address it asks at", () => {
  assert.equal(SUPPORT_LISTING_COLLECTION, SUPPORT_COLLECTION);
  assert.equal(publicInitiativeUrl(uri), `/api/public-initiative?uri=${encodeURIComponent(uri)}`);
  assert.equal(parsePublicInitiativeQuery(new URL(publicInitiativeUrl(uri), "https://weave.example")), uri);
  assert.deepEqual(parsePublicInitiative(shown), shown);
  // A field from a newer server is ignored, not refused.
  assert.deepEqual(parsePublicInitiative({ ...shown, later: true, project: { ...shown.project, later: true } }), shown);
  const withProject = (project: Record<string, unknown>) => ({ ...shown, project: { ...shown.project, ...project } });
  const withNeed = (listing: Record<string, unknown>) => ({ ...shown, needs: [{ ...shown.needs[0]!, ...listing }] });
  for (const [label, bad] of [
    ["no project", { ...shown, project: undefined }],
    ["a did:web project", withProject({ uri: "at://did:web:garden.example.org/org.hypercerts.collection/3m6bq4seedlib" })],
    ["another source", withProject({ sourceUrl: "https://example.org/x" })],
    ["a source that is not an address", withProject({ sourceUrl: "not an address" })],
    ["eleven passages", withProject({ description: Array.from({ length: 11 }, (_, n) => `Passage number ${n}.`) })],
    ["an unknown kind of work", withProject({ focus: ["Seed Saving"] })],
    ["a repeated kind of group", withProject({ organizationTypes: ["nonprofit", "nonprofit"] })],
    ["a link with credentials", withProject({ publisherLinks: [{ label: "x", url: "https://a:b@example.org/" }] })],
    ["a link label that breaks a line", withProject({ publisherLinks: [{ label: "a b", url: "https://example.org/" }] })],
    ["an untrimmed link label", withProject({ publisherLinks: [{ label: " x", url: "https://example.org/" }] })],
    ["a link given twice", withProject({ publisherLinks: [{ label: "a", url: "https://example.org/" }, { label: "b", url: "https://example.org/" }] })],
    ["seven links", withProject({ publisherLinks: ["a", "b", "c", "d", "e", "f", "g"].map((n) => ({ label: n, url: `https://${n}.example.org/` })) })],
    ["a listing in another repository", withNeed({ uri: listingUri("3jui7kd54zh2y", "did:plc:fixtureinitiativebbbbbbb") })],
    ["a listing with a non-TID key", withNeed({ uri: listingUri("listing-one") })],
    ["a listing given twice", { ...shown, offers: [shown.needs[0]!] }],
    ["an unknown form of capital", withNeed({ capitalForms: ["time"] })],
    ["no form of capital", withNeed({ capitalForms: [] })],
    ["a title past 140 graphemes", withNeed({ title: "t".repeat(141) })],
    ["an expiry before creation", withNeed({ expiresAt: "2026-11-10T18:00:00.000Z" })],
    ["an update before creation", withNeed({ updatedAt: "2026-11-01T18:00:00.000Z" })],
    ["a missing description", withNeed({ description: undefined })],
    ["a date with an offset", withNeed({ createdAt: "2026-11-10T18:00:00+01:00" })],
    ["no answer time", { ...shown, checkedAt: undefined }],
  ] as const) assert.throws(() => parsePublicInitiative(bad), /invalid_public_initiative/u, label);
  // Grapheme bounds count what a person sees: 140 flags are 280 code points.
  assert.equal((parsePublicInitiative(withNeed({ title: "🇧🇷".repeat(140) })) as PublicInitiative).needs[0]!.title.length, 560);
});

test("the router serves the endpoint at its own address, off until the public list is switched on", async () => {
  const saved = process.env.WEAVE_PUBLIC_PROJECTS_ENABLED;
  delete process.env.WEAVE_PUBLIC_PROJECTS_ENABLED;
  try {
    const response = await route(new Request(`https://weave.example/api/router?${ROUTE_KEY}=public-initiative&uri=${encodeURIComponent(uri)}`));
    assert.deepEqual(await answer(response), { status: 200, body: { status: "off" } });
    const refused = await route(new Request(`https://weave.example/api/router?${ROUTE_KEY}=public-initiative&uri=x`));
    assert.deepEqual(await answer(refused), { status: 400, body: { error: "invalid_uri" } });
  } finally {
    if (saved === undefined) delete process.env.WEAVE_PUBLIC_PROJECTS_ENABLED;
    else process.env.WEAVE_PUBLIC_PROJECTS_ENABLED = saved;
  }
});
