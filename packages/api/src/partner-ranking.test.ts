import assert from "node:assert/strict";
import { test } from "node:test";
import { rankPartnerMatches, type PartnerEntry, type ProjectEvidence } from "./partner-matcher.ts";
import { neededRoles, projectRoles, rankPartners } from "./partner-ranking.ts";
import { readThemes } from "./themes.ts";

const evidence = (uri: string, name: string, passage: string): ProjectEvidence => ({
  id: `${uri}:0`, projectUri: uri, projectName: name, sourceUri: uri, sourceUrl: `https://source.example/${name}`,
  cid: "cid", contentHash: "hash", fieldPath: "$.description", passage, sourceCreatedAt: "2026-11-01T00:00:00Z",
  sourceIndexedAt: "2026-11-02T00:00:00Z", fetchedAt: "2026-11-20T00:00:00Z", extractionVersion: "test", kind: "work",
});
const tool = {
  name: "Ledger", description: "Ledger is an open-source app that helps community groups record their regenerative work, such as keeping solar panels running or teaching classes.",
  locations: ["Awka, Nigeria"], isGlobal: true, lenses: ["technology"], themes: [],
};
const entry = (entryId: string, kind: "need" | "offer", title: string, description: string, capitalForms: string[], placeScope = "anywhere", summary: object = tool): PartnerEntry => ({
  initiativeId: "at://ledger", revision: 1, entryId, kind, summary: summary as PartnerEntry["summary"],
  value: { status: "open", title, description, purpose: null, placeScope, capitalForms },
});
const hub = evidence("at://hub", "Sun Hub", "We build free, solar-powered hubs in Nigeria where students learn and work, and run workshops for local builders.");
const birds = evidence("at://birds", "Night birds", "Bioacoustic recordings of nocturnal urban wildlife to track species with AudioMoth sensors.");
const own = evidence("at://ledger", "Ledger", "Ledger is an open-source app that helps community groups record their regenerative work.");
const corpus = [hub, birds, own];

test("a need for communities to pilot with finds a place-based community doing the work the tool records, without shared words", () => {
  const pilots = entry("pilots", "need", "Communities to pilot it", "Groups doing this kind of work who will try it for a season.", ["social"]);
  assert.deepEqual(rankPartnerMatches({ queries: [pilots], publicEvidence: [hub] }), [], "the word matcher alone finds nothing");
  const [match, ...rest] = rankPartners({ queries: [pilots], publicEvidence: corpus });
  assert.equal(match!.counterpart.id, "at://hub");
  assert.equal(match!.evidenceKind, "inferred_capability");
  assert.deepEqual(match!.reasons, [{ type: "complement", terms: ["a place-based community", "energy access", "education and skills", "Nigeria"] }]);
  assert.ok(match!.unknowns.includes("availability"), "public work never confirms availability");
  assert.ok(rest.every(({ counterpart }) => counterpart.id !== "at://ledger"), "an initiative is never its own partner");
});

test("an offer of a recording app is not offered to projects that make bioacoustic recordings", () => {
  const app = entry("app", "offer", "App for recording community work", "An offline app and dashboard.", ["intellectual"]);
  const ranked = rankPartners({ queries: [app], publicEvidence: corpus });
  assert.equal(ranked[0]!.counterpart.id, "at://hub");
  assert.equal(ranked[0]!.evidenceKind, "potential_use");
  assert.ok(!ranked.some(({ counterpart }) => counterpart.id === "at://birds"));
});

test("a need for money alone is answered only by a project that says it funds others", () => {
  const money = entry("money", "need", "Funding to keep running", "Money for batteries, internet and community support.", ["financial"]);
  assert.deepEqual(rankPartners({ queries: [money], publicEvidence: corpus }), []);
  const fund = evidence("at://fund", "Community fund", "We fund community groups doing regenerative work in Nigeria with small grants to communities.");
  assert.deepEqual(rankPartners({ queries: [money], publicEvidence: [...corpus, fund] }).map(({ counterpart }) => counterpart.id), ["at://fund"]);
});

test("an offer kept to here reaches only projects named in the same country", () => {
  const desks = entry("desks", "offer", "Free desk space", "Desks with power and internet for study and work.", ["material"], "here");
  const kenya = evidence("at://kenya", "Kenya hub", "A community hub in Nairobi, Kenya, where students learn and work.");
  const ranked = rankPartners({ queries: [desks], publicEvidence: [hub, kenya] });
  assert.deepEqual(ranked.map(({ counterpart }) => counterpart.id), ["at://hub"]);
});

test("the word matcher's own results keep their reasons and gain what links the two sides", () => {
  const record = entry("record", "need", "A record of what the hub delivers", "A simple app to record attendance and outcomes for funders.", ["intellectual"], "anywhere",
    { name: "Sun Hub", description: "We build solar-powered hubs in Nigeria.", locations: [], isGlobal: false, lenses: [], themes: [] });
  const ledger = evidence("at://ledger2", "Ledger", "Ledger is an open-source app that helps community groups record and review their work so funders can see outcomes.");
  const [match] = rankPartners({ queries: [{ ...record, initiativeId: "at://hub" }], publicEvidence: [ledger, hub] });
  assert.equal(match!.counterpart.id, "at://ledger2");
  assert.deepEqual(match!.reasons.map(({ type }) => type), ["shared_terms", "complement"]);
  assert.equal(match!.reasons.at(-1)!.terms[0], "a tool builder");
});

test("roles come from what a project says it is and does: using a sensor is not building a tool, and a university campus is a place", () => {
  const text = "We use AudioMoth sensors to monitor birds in a forest reserve.";
  assert.deepEqual([...projectRoles(text, readThemes(text), 0)].sort(), ["place", "research"]);
  const app = "We build an open-source platform for cooperatives.";
  assert.deepEqual([...projectRoles(app, readThemes(app), 0)], ["builder"]);
  assert.deepEqual([...neededRoles(entry("x", "need", "Partners to run workshops at the hub", "Experts to lead sessions.", ["experiential"]))], ["learning"]);
  assert.deepEqual([...neededRoles(entry("y", "need", "Uma ferramenta para registrar o trabalho", "Um aplicativo simples.", ["intellectual"]))], ["builder"]);
});
