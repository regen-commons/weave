import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceDraftSchema, newDraft, type DeviceDraft } from "../src/describe/contracts.ts";
import { formFromAsk, keepEditor, decide } from "../src/intake/state.ts";
import type { AskKind } from "../src/intake/contracts.ts";
import { PUBLIC_PARTNER_EVIDENCE } from "../src/partners/catalog.ts";
import type { PartnerEvidence } from "../src/partners/evidence.ts";
import { matchPartners } from "../src/partners/match.ts";

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
