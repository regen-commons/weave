import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceDraftSchema, newDraft, type DeviceDraft } from "../src/describe/contracts.ts";
import { formFromAsk, keepEditor, decide } from "../src/intake/state.ts";
import { examplePartners, readFixtures } from "../src/fixtures.ts";
import type { AskKind } from "../src/intake/contracts.ts";
import { PUBLIC_PARTNER_EVIDENCE } from "../src/partners/catalog.ts";
import type { PartnerEvidence } from "../src/partners/evidence.ts";
import {
  FIT_BASIS,
  FIT_TOPICS,
  entryLine,
  fitGroupOf,
  fitLead,
  fitLines,
  fitStrength,
  groupFits,
  PREVIEW_FITS,
  strongestFit,
  topicsLine,
  unknownLine,
  type FitEvidence,
} from "../src/partners/groups.ts";
import { matchPartners } from "../src/partners/match.ts";
import { projectSuggestions } from "../src/partners/certified-suggestions.ts";
import type { PartnerEntry, PartnerMatch } from "@weave/api/partner-matcher";

function keep(draft: DeviceDraft, kind: AskKind, fields: Partial<ReturnType<typeof formFromAsk>>) {
  const form = { ...formFromAsk(), capitalForms: ["intellectual"] as const, ...fields };
  return { ...draft, [kind]: keepEditor({ ...draft[kind], editor: {
    id: null, form: { ...form, capitalForms: [...form.capitalForms] },
  } }, kind) };
}

const now = new Date("2026-11-08T12:00:00Z");
test("signed-out needs and offers find named public evidence through separate paths", () => {
  let draft = keep(newDraft(), "needs", { title: "Mapping our watershed" });
  draft = keep(draft, "offers", { title: "GPS traces and imagery", timeframe: "In spring" });
  assert.equal(draft.offers.items[0]!.value.timeframe, "In spring");
  assert.equal(draft.account.saved, null);
  const results = matchPartners(draft, PUBLIC_PARTNER_EVIDENCE, now);
  assert.deepEqual(results.map(({ evidence }) => [evidence.id, evidence.kind]), [
    ["osm:mapping", "inferred_capability"],
    ["osm:contribute", "published_need"],
  ]);
  assert.equal(results[0]!.ask.value.title, "Mapping our watershed");
  assert.equal(results[1]!.ask.value.title, "GPS traces and imagery");
  assert.equal(matchPartners(newDraft(), PUBLIC_PARTNER_EVIDENCE, now).length, 0);
});

test("changing, closing or removing an ask changes suggestions and undo restores a kept ask", () => {
  const draft = keep(newDraft(), "needs", { title: "Wikipedia editathon training" });
  assert.equal(matchPartners(draft, PUBLIC_PARTNER_EVIDENCE, now)[0]!.evidence.kind, "published_offer");
  const id = draft.needs.items[0]!.id;
  const removed = decide(draft.needs, id, "removed");
  assert.deepEqual(matchPartners({ ...draft, needs: removed }, PUBLIC_PARTNER_EVIDENCE, now), []);
  assert.equal(matchPartners({ ...draft, needs: decide(removed, id, "pencil") }, PUBLIC_PARTNER_EVIDENCE, now).length, 1);
  const edited = keepEditor({
    ...draft.needs,
    editor: { id, form: { ...formFromAsk(draft.needs.items[0]!.value), title: "Unrelated", status: "met" } },
  }, "needs");
  assert.equal(edited.items[0]!.id, id);
  assert.deepEqual(matchPartners({ ...draft, needs: edited }, PUBLIC_PARTNER_EVIDENCE, now), []);
});

test("only current compatible confirmations can outrank evidence from the same initiative", () => {
  const draft = keep(newDraft(), "needs", { title: "Mapping", exchangeTerms: ["gift"] });
  const experience = PUBLIC_PARTNER_EVIDENCE.find((evidence) => evidence.id === "osm:mapping")!;
  const confirmed = {
    ...experience, kind: "confirmed_offer", id: "osm:offer", terms: ["gift"], scope: "anywhere",
    confirmation: {
      authority: "verified-representative", revision: "revision-1", status: "open", confirmedOn: "2026-10-01",
      validThrough: "2026-12-01", capacity: "One workshop", audience: "New mappers",
    },
  } satisfies PartnerEvidence;
  assert.deepEqual(matchPartners(draft, [experience, confirmed], now).map(({ evidence }) => evidence.id), ["osm:offer"]);
  const unavailable: PartnerEvidence[] = [
    { ...confirmed, confirmation: { ...confirmed.confirmation, status: "withdrawn" as const } },
    { ...confirmed, confirmation: { ...confirmed.confirmation, validThrough: "2026-11-07" } },
    { ...confirmed, confirmation: { ...confirmed.confirmation, confirmedOn: "2026-01-01" } },
    { ...confirmed, terms: ["paid"] },
    { ...confirmed, scope: "here", places: ["Different place"] },
  ];
  for (const evidence of unavailable) assert.deepEqual(matchPartners(draft, [evidence], now), []);
  const local = keep(newDraft(), "needs", { title: "Mapping", placeScope: "here" });
  assert.equal(matchPartners(local, [experience], now)[0]!.checkPlace, true);
});

test("a pre-matching draft opens with an empty lead list and saved lead IDs round-trip locally", () => {
  const { partnerLeads: _olderDraft, ...legacy } = newDraft();
  assert.deepEqual(DeviceDraftSchema.parse(legacy).partnerLeads, []);
  assert.deepEqual(DeviceDraftSchema.parse({ ...legacy, partnerLeads: ["osm:mapping"] }).partnerLeads, ["osm:mapping"]);
});

test("ranked results split into direct fits and possible fits, each in the order the ranking gave", () => {
  let draft = keep(newDraft(), "needs", { title: "Mapping our watershed" });
  draft = keep(draft, "needs", { title: "Pollution monitoring research" });
  draft = keep(draft, "needs", { title: "Wikipedia editathon training" });
  draft = keep(draft, "offers", { title: "GPS traces and imagery" });
  const ranked = matchPartners(draft, PUBLIC_PARTNER_EVIDENCE, now);
  // Device ranking puts a public request last, after experience that is only inferred.
  assert.deepEqual(ranked.map(({ evidence }) => [evidence.id, evidence.kind]), [
    ["art-feminism:training", "published_offer"],
    ["public-lab:research", "inferred_capability"],
    ["osm:mapping", "inferred_capability"],
    ["osm:contribute", "published_need"],
  ]);
  const [direct, possible] = groupFits(ranked, ({ evidence }) => evidence.kind);
  assert.deepEqual([direct!.key, direct!.heading, direct!.explanation],
    ["direct", "Direct fits", "They have said they offer or need this."]);
  assert.deepEqual(direct!.results.map(({ evidence }) => evidence.id), ["art-feminism:training", "osm:contribute"]);
  assert.deepEqual([possible!.key, possible!.heading, possible!.explanation],
    ["possible", "Possible fits", "Their public work suggests a fit. They have not offered or asked."]);
  assert.deepEqual(possible!.results.map(({ evidence }) => evidence.id), ["public-lab:research", "osm:mapping"]);
  assert.equal(direct!.results[1], ranked[3]);
});

test("every kind of evidence from the device and the network falls in one group", () => {
  const kinds: FitEvidence[] = [
    "potential_use", "confirmed_need", "inferred_capability", "published_request", "confirmed_offer",
    "published_need", "potential_use", "published_offer",
  ];
  const groups = groupFits(kinds.map((kind, rank) => ({ kind, rank })), ({ kind }) => kind);
  assert.deepEqual(groups.map(({ key, results }) => [key, results.map(({ kind, rank }) => `${rank} ${kind}`)]), [
    ["direct", ["1 confirmed_need", "3 published_request", "4 confirmed_offer", "5 published_need", "7 published_offer"]],
    ["possible", ["0 potential_use", "2 inferred_capability", "6 potential_use"]],
  ]);
  assert.deepEqual(kinds.map(fitGroupOf), [
    "possible", "direct", "possible", "direct", "direct", "direct", "possible", "direct",
  ]);
});

test("no results leave both groups empty, and a preview keeps the first results of each group", () => {
  assert.deepEqual(groupFits([], (kind: FitEvidence) => kind).map(({ key, heading, results }) => [key, heading, results]), [
    ["direct", "Direct fits", []],
    ["possible", "Possible fits", []],
  ]);
  const kinds: FitEvidence[] = [
    "inferred_capability", "published_offer", "potential_use", "confirmed_offer", "inferred_capability", "published_need",
  ];
  const ranked = kinds.map((kind, rank) => ({ kind, rank }));
  assert.equal(PREVIEW_FITS, 2);
  assert.deepEqual(groupFits(ranked, ({ kind }) => kind, PREVIEW_FITS).map(({ results }) => results.map(({ rank }) => rank)), [
    [1, 3],
    [0, 2],
  ]);
  assert.deepEqual(groupFits(ranked, ({ kind }) => kind).map(({ results }) => results.length), [3, 3]);
});

test("each result says what supports it and what to check, without claiming more than the evidence", () => {
  assert.deepEqual(fitLines("inferred_capability"), {
    supports: "Their public work shows related experience.",
    check: "They have not offered this. Availability is unknown.",
  });
  assert.deepEqual(fitLines("potential_use"), {
    supports: "Their public work could use what you offer.",
    check: "They have not asked for this.",
  });
  // The device says "published need" and the network "published request" for the same evidence.
  assert.deepEqual(fitLines("published_need"), fitLines("published_request"));
  const direct: FitEvidence[] = ["confirmed_offer", "confirmed_need", "published_offer", "published_need", "published_request"];
  for (const kind of direct) {
    const { supports, check } = fitLines(kind);
    assert.match(supports, /^(They confirmed|Their public source) /, kind);
    assert.match(check, /^Check /, kind);
    assert.doesNotMatch(`${supports} ${check}`, /unknown|have not/, kind);
  }
  assert.equal(new Set(direct.map((kind) => fitLines(kind).supports)).size, 4);
});

test("a result names the person's own need or offer it is for", () => {
  assert.equal(entryLine("need", "Mapping our watershed"), "For your need: Mapping our watershed");
  assert.equal(entryLine("offer", "GPS traces and imagery"), "For your offer: GPS traces and imagery");
});

test("example partners pair each shared entry with one invented initiative, never the person's own", () => {
  const { initiatives } = readFixtures("?fixture=shared");
  const partners = examplePartners([
    { kind: "needs", title: "Native seedlings", kinds: ["living"] },
    { kind: "needs", title: "Planting tools", kinds: ["living", "material"] },
    { kind: "needs", title: "More tools", kinds: ["material"] },
    { kind: "offers", title: "A workshop on water mapping", kinds: ["living", "intellectual"] },
  ], initiatives);

  // The example's own initiative offers living support and is passed over. Willow tools is the only
  // other initiative offering material support, so the second request for it finds no one.
  assert.deepEqual(partners.map(({ kinds, reciprocal }) => ({ kinds, reciprocal })), [
    { kinds: ["living"], reciprocal: false },
    // Willow tools also needs what the workshop offers, so that fit goes both ways.
    { kinds: ["material"], reciprocal: true },
    { kinds: ["living"], reciprocal: false },
  ], "each pair names the kinds of support the two entries share, and whether it holds both ways");
  assert.deepEqual(partners.map(({ id, name, entry, kind }) => ({ id, name, entry, kind })), [
    { id: "field-school", name: "Field learning school", entry: { kind: "need", title: "Native seedlings" }, kind: "confirmed_offer" },
    { id: "willow-tools", name: "Willow tools cooperative", entry: { kind: "need", title: "Planting tools" }, kind: "confirmed_offer" },
    { id: "river-maps", name: "River maps collective", entry: { kind: "offer", title: "A workshop on water mapping" }, kind: "confirmed_need" },
  ]);
  const school = initiatives.find(({ id }) => id === "field-school");
  const offer = school?.publicDetails?.offers.find(({ capitals }) => capitals.includes("living"));
  assert.ok(school && offer);
  assert.deepEqual(
    { title: partners[0]?.title, passage: partners[0]?.passage, confirmedOn: partners[0]?.confirmedOn },
    { title: offer.title, passage: offer.description, confirmedOn: school.confirmed },
  );
  assert.deepEqual(examplePartners([], initiatives), []);
  assert.deepEqual(examplePartners([{ kind: "needs", title: "Native seedlings", kinds: ["living"] }], []), []);
});

test("Partners for you shows a project once, naming each need and offer it fits", () => {
  const query = (kind: "need" | "offer", entryId: string, title: string): PartnerEntry =>
    ({ initiativeId: "team", entryId, revision: 1, kind, summary: {}, value: { status: "open", title } });
  const passage = "The lab maps streams with GPS and runs monitoring workshops.";
  const match = (entry: PartnerEntry, project: string, evidenceKind: PartnerMatch["evidenceKind"], text = passage): PartnerMatch => ({
    query: { kind: entry.kind, entryId: entry.entryId, revision: 1 },
    candidateId: `public:${project}:${entry.entryId}`,
    counterpart: { id: project, name: project === "lab" ? "Stream Survey Lab" : "Seed Bank" },
    evidenceKind,
    evidence: {
      type: "public", id: project, projectUri: `at://${project}`, projectName: project, sourceUri: `at://${project}/source`,
      sourceUrl: `https://example.org/${project}`, cid: "cid", contentHash: "hash", fieldPath: "description", passage: text,
      sourceCreatedAt: "2026-10-01T00:00:00Z", sourceIndexedAt: null, fetchedAt: "2026-11-01T00:00:00Z",
      extractionVersion: "1", kind: "work",
    },
    reasons: [], unknowns: ["availability"], reciprocal: false, action: "open_source",
  });
  const need = query("need", "n1", "GPS watershed mapping");
  const offer = query("offer", "o1", "Monitoring workshop");
  const ranked = [match(need, "lab", "inferred_capability"), match(need, "seeds", "inferred_capability", "Seeds."), match(offer, "lab", "potential_use")];
  const projects = projectSuggestions(ranked, [need, offer]);
  assert.deepEqual(projects.map(({ name }) => name), ["Stream Survey Lab", "Seed Bank"], "projects keep their best rank");
  const [lab] = projects;
  assert.ok(lab);
  assert.deepEqual(lab.fits.map(({ query: { kind } }) => kind), ["need", "offer"], "one card names the need and the offer");
  assert.deepEqual(lab.passages, [{ text: passage, sourceUrl: "https://example.org/lab" }], "its words show once");
  // A preview keeps the first match for each entry, so the lab stays one card with both fits.
  assert.deepEqual(projectSuggestions(ranked, [need, offer], 1).map(({ name, fits }) => [name, fits.length]), [["Stream Survey Lab", 2]]);
});

test("a fit's strength comes from what is known about it, never from a score (DL-064)", () => {
  const stated: FitEvidence[] = ["confirmed_offer", "confirmed_need", "published_offer", "published_need", "published_request"];
  const read: FitEvidence[] = ["inferred_capability", "potential_use"];
  for (const kind of stated) {
    assert.equal(fitStrength(kind), "good", kind);
    assert.equal(fitStrength(kind, true), "strong", `${kind}, both ways`);
    assert.equal(fitGroupOf(kind), "direct", "a stated fit is a direct fit");
  }
  for (const kind of read) {
    assert.equal(fitStrength(kind), "possible", kind);
    assert.equal(fitStrength(kind, true), "possible", "public work read both ways is still not a statement");
  }
  assert.equal(strongestFit(["possible", "good"]), "good");
  assert.equal(strongestFit(["good", "strong", "possible"]), "strong");
  assert.equal(strongestFit([]), "possible", "nothing known claims the least");
  for (const basis of Object.values(FIT_BASIS)) assert.doesNotMatch(basis, /\d|score|percent|match/i, "a strength is explained in words");
  assert.match(FIT_BASIS.possible, /have not offered or asked/);
});

test("a fit says which way it runs, and a possible fit never claims an offer or a request", () => {
  assert.deepEqual(fitLead("confirmed_offer"), { direction: "they-offer", lead: "They offer what you need" });
  assert.deepEqual(fitLead("confirmed_need"), { direction: "they-need", lead: "They need what you offer" });
  assert.equal(fitLead("published_request").direction, "they-need");
  assert.equal(fitLead("published_need").lead, fitLead("published_request").lead);
  for (const kind of ["inferred_capability", "potential_use"] as const) {
    assert.match(fitLead(kind).lead, /^Their work /, "it speaks of their work, not of something they said");
  }
  assert.equal(fitLead("inferred_capability").direction, "they-offer");
  assert.equal(fitLead("potential_use").direction, "they-need");
});

test("shared topics and gaps read as one sentence each, and say nothing when there is nothing to say", () => {
  assert.equal(topicsLine([]), "");
  assert.equal(topicsLine(["seedlings"]), "You both mention seedlings.");
  assert.equal(topicsLine(["seedlings", " watershed ", "seedlings", ""]), "You both mention seedlings and watershed.");
  assert.equal(topicsLine(["a", "b", "c", "d", "e", "f"]), "You both mention a, b, c and d.");
  assert.equal(FIT_TOPICS, 4);
  assert.equal(unknownLine([]), "");
  assert.equal(unknownLine(["place"]), "Not known yet: the place.");
  assert.equal(unknownLine(["place", "timing", "place"]), "Not known yet: the place and the timing.");
  assert.equal(unknownLine(["terms", "capacity", "availability"]), "Not known yet: the terms, how much they can take on and whether it is still available.");
  assert.equal(unknownLine(["something-new"]), "", "a gap with no plain words is left out, never shown raw");
});

test("an example initiative that fits both ways is told apart from one that fits one way", () => {
  const { initiatives } = readFixtures("?fixture=shared");
  const partner = initiatives.find(({ id }) => id === "field-school")!;
  const theirNeed = partner.publicDetails!.needs[0]!;
  const partners = examplePartners([
    { kind: "needs", title: "Native seedlings", kinds: ["living"] },
    { kind: "offers", title: "What they asked for", kinds: [...theirNeed.capitals] },
  ], initiatives);
  assert.equal(partners[0]?.id, "field-school");
  assert.equal(partners[0]?.reciprocal, true, "they offer what is needed and need what is offered");
  assert.equal(fitStrength(partners[0]!.kind, partners[0]!.reciprocal), "strong");
});
