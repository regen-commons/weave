// Checks for the partner-real-v2 tooling on synthetic data. The holdout files themselves stay private.
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assemble, buildCorpus, buildSlots, DOMAINS, savePages, seedOrder } from "../scripts/partner-real-v2.mjs";

const project = (id, theme, v1Id = null, passage = `We run ${theme} work with our neighbours, share tools and skills, and keep careful records of each season.`) =>
  ({ id, uri: `at://did:plc:x/org.hypercerts.collection/${id}`, name: `Project ${id}`, passages: [passage], theme, v1Id, language: "en" });
const corpus = { projects: [
  ...["a1", "a2", "a3"].map(id => project(id, "art", `rp-${id}`)),
  ...Array.from({ length: 30 }, (_, i) => project(`s${i}`, "software")),
  ...Array.from({ length: 30 }, (_, i) => project(`r${i}`, "research", i < 5 ? `rp-r${i}` : null)),
  ...Array.from({ length: 30 }, (_, i) => project(`p${i}`, "place")),
  project("solo", "place", null, "We restore the Xylocarpa marsh and its tidal creeks."),
] };

test("slots meet every quota the plan sets", () => {
  const { slots } = buildSlots(corpus);
  assert.equal(slots.length, 160);
  assert.equal(new Set(slots.map(slot => slot.id)).size, 160);
  const count = (list, key) => Object.fromEntries(Object.entries(Object.groupBy(list, key)).map(([k, v]) => [k, v.length]));
  for (const domain of DOMAINS) {
    const mine = slots.filter(slot => slot.domain === domain);
    assert.deepEqual(count(mine, slot => slot.direction), { need: 20, offer: 20 }, domain);
    assert.deepEqual(count(mine, slot => slot.language), { en: 25, pt: 10, es: 5 }, domain);
    assert.deepEqual(count(mine, slot => slot.kind), { seeded: 21, "hard-negative": 4, blind: 10, sparse: 5 }, domain);
    for (const slot of mine) assert.equal(Boolean(slot.seed), slot.kind === "seeded" || slot.kind === "hard-negative", slot.id);
  }
  assert.deepEqual(count(slots, slot => slot.language), { en: 100, pt: 40, es: 20 });
  assert.deepEqual(count(slots, slot => slot.kind), { seeded: 84, "hard-negative": 16, blind: 40, sparse: 20 });
  // Seeds come from the slot's own theme.
  const theme = new Map(corpus.projects.map(p => [p.id, p.theme]));
  for (const slot of slots.filter(slot => slot.seed)) assert.equal(theme.get(slot.seed), slot.domain, slot.id);
  // The same corpus gives the same slots.
  assert.deepEqual(buildSlots(corpus).slots, slots);
});

test("seeds take projects new to v2 first, and repeat only when a theme has too few", () => {
  const research = seedOrder(corpus, "research");
  assert.ok(research.slice(0, 25).every(p => !p.v1Id));
  assert.ok(research.slice(25).every(p => p.v1Id));
  const art = buildSlots(corpus).slots.filter(slot => slot.domain === "art" && slot.seed);
  assert.equal(art.length, 25);
  assert.deepEqual(new Set(art.map(slot => slot.seed)), new Set(["a1", "a2", "a3"]));
});

test("a project with too little of its own text, or only the form prompt, is never a seed", () => {
  const filler = "We grow food with our neighbours and teach children how to compost kitchen scraps in the school garden.";
  const thin = { ...corpus, projects: [project("short", "place", null, "Local stewards are the best people."),
    project("form", "place", null, "Start writing your story, and our AI assistant will help with the following: Spelling & grammar plus more."),
    project("good", "place", null, filler)] };
  assert.equal(filler.length >= 100, true);
  assert.deepEqual(seedOrder(thin, "place").map(p => p.id), ["good"]);
});

test("the corpus keeps v1's rules, drops nothing else and marks v1's projects", () => {
  const card = (name, passage, n) => ({ uri: `at://did:plc:y/org.hypercerts.collection/${n}`, name, passages: [passage],
    sharedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-11-21T00:00:00Z", sourceUrl: "https://api.hypercerts.dev/x" });
  const cards = [card("Soil school", "We teach composting to farmers in the valley.", "k1"), card("QA Test Project A", "QA story", "k2"),
    card("Mural", "Lorem ipsum dolor sit amet.", "k3"), card("Call us", "Write to team@example.org for details.", "k4"),
    card("Old friend", "A community radio station for fishers.", "k5")];
  const v1 = { projects: [{ id: "rp-007", uri: cards[4].uri }] };
  const built = buildCorpus(cards, { collectedAt: "2026-11-21T10:00:00Z", index: { status: "bounded", checkedAt: null }, v1 });
  assert.deepEqual(built.exclusions, { qa_or_test: 1, placeholder_text: 1, contact_details: 1 });
  assert.deepEqual(built.projects.map(p => p.name).sort(), ["Old friend", "Soil school"]);
  assert.equal(built.projects.find(p => p.name === "Old friend").v1Id, "rp-007");
  assert.equal(built.projects.find(p => p.name === "Soil school").v1Id, null);
  assert.deepEqual(built.projects.map(p => p.id), ["rp2-0001", "rp2-0002"]);
});

test("assembly refuses missing, duplicate, unknown and malformed answers, and flags reused seed words", () => {
  const slotFile = { slots: [
    { id: "q1", domain: "place", direction: "need", language: "en", kind: "seeded", seed: "solo" },
    { id: "q2", domain: "place", direction: "offer", language: "en", kind: "sparse", seed: null },
    { id: "q3", domain: "place", direction: "need", language: "en", kind: "blind", seed: null },
  ] };
  const good = [
    { id: "q1", title: "Help bringing a coastal wetland back", description: "We need people who know how to revive wetlands along the shore." },
    { id: "q2", title: "Seed library", description: null },
    { id: "q3", title: "Volunteers for tree planting", description: "We are planting a hedgerow this winter and need hands." },
  ];
  const ok = assemble(corpus, slotFile, good);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.queries.queries.length, 3);
  assert.deepEqual(ok.flags, []);
  const reused = assemble(corpus, slotFile, [{ ...good[0], description: "We need help in the Xylocarpa wetlands." }, good[1], good[2]]);
  assert.deepEqual(reused.flags, [{ id: "q1", flag: "reuses_seed_words", words: ["xylocarpa"] }]);
  const bad = assemble(corpus, slotFile, [good[0], good[0], { id: "q2", title: "A much longer title than sparse allows", description: null },
    { id: "q9", title: "x", description: "y" }]);
  assert.deepEqual(bad.problems.sort(), ["duplicate_answer:q1", "missing_answer:q3", "not_sparse:q2", "unknown_slot:q9"]);
});

test("pages are saved until the list ends, and a list that changes while reading is refused", async () => {
  const page = (uris, next, total) => ({ index: { status: "bounded", checkedAt: null, total }, next,
    projects: uris.map(u => ({ uri: `at://did:plc:car2bhnsobazchx5qybz422e/org.hypercerts.collection/3modh4ydw622${u}`, name: u, passages: ["Some words."],
      sharedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-11-21T00:00:00Z", sourceUrl: "https://api.hypercerts.dev/x" })) });
  const reply = body => ({ ok: true, json: async () => body });
  const dir = await mkdtemp(join(tmpdir(), "partner-real-v2-"));
  const served = [page(["a", "b"], "c1", 3), page(["c"], null, 3)];
  assert.deepEqual(await savePages(dir, async () => reply(served.shift())), { pages: 2, total: 3 });
  assert.deepEqual((await readdir(dir)).sort(), ["p001.json", "p002.json"]);
  const changing = [page(["a", "b"], "c1", 3), page(["c"], null, 4)];
  await assert.rejects(savePages(await mkdtemp(join(tmpdir(), "partner-real-v2-")), async () => reply(changing.shift())), /listing_changed_while_reading/);
});
