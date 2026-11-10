import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_FILTERS, selectRecords, type ListingRecord } from "../src/listing.ts";
const records: readonly ListingRecord[] = [
  {
    id: "a",
    kind: "initiative",
    title: "Água",
    description: "Seed sharing",
    country: "Brazil",
    place: "Valley",
    work: ["Research"],
    stage: "seed",
    needs: ["material"],
    offers: ["living"],
    fit: "strong",
    reasons: [],
    confirmed: "2026-10-01",
  },
  {
    id: "b",
    kind: "initiative",
    title: "Workshop",
    description: "Tools",
    country: "Kenya",
    place: "Hill",
    work: ["Technology"],
    stage: "flowering",
    needs: ["living"],
    offers: ["material"],
    fit: "possible",
    reasons: [],
    confirmed: "2026-11-01",
  },
  {
    id: "c",
    kind: "funding",
    title: "Learning grant",
    description: "Research funding",
    country: "Brazil",
    place: "Valley",
    work: ["Research", "Technology"],
    stage: "sprout",
    needs: [],
    offers: ["financial"],
    reasons: [],
    confirmed: "2026-10-20",
    closes: "2026-11-30",
  },
];
const ids = (items: readonly ListingRecord[]) => items.map((item) => item.id);
test("search folds accents and trims input; multiple filter groups intersect", () => {
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, search: " agua " })), ["a"]);
  assert.deepEqual(
    ids(
      selectRecords(records, {
        ...EMPTY_FILTERS,
        work: ["Research", "Technology"],
        country: ["Brazil"],
        stage: ["seed"],
      }),
    ),
    ["a"],
  );
  assert.deepEqual(selectRecords(records, { ...EMPTY_FILTERS, search: "nothing" }), []);
});
test("Support looks in needs, offers or either, without making one kind primary", () => {
  const filters = { ...EMPTY_FILTERS, support: ["living"] };
  assert.deepEqual(ids(selectRecords(records, { ...filters, supportIn: "offers" })), ["a"]);
  assert.deepEqual(ids(selectRecords(records, { ...filters, supportIn: "needs" })), ["b"]);
  assert.deepEqual(ids(selectRecords(records, filters)), ["a", "b"]);
  assert.deepEqual(
    ids(
      selectRecords(records, { ...EMPTY_FILTERS, support: ["financial", "material"], supportIn: "offers" }),
    ),
    ["c", "b"],
  );
});
test("relationship filters require an initiative and use the chosen direction", () => {
  const subject = { needs: ["living"] as const, offers: ["material"] as const };
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, relation: "offers-need" }, subject)), [
    "a",
  ]);
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, relation: "needs-offer" }, subject)), [
    "a",
  ]);
  assert.deepEqual(selectRecords(records, { ...EMPTY_FILTERS, relation: "offers-need" }), []);
});
test("sorting is deterministic, puts unscored and undated records last, and leaves source records untouched", () => {
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, sort: "recent" })), ["b", "c", "a"]);
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, sort: "fit" })), ["a", "b", "c"]);
  assert.deepEqual(ids(selectRecords(records, { ...EMPTY_FILTERS, sort: "closing" })), ["c", "a", "b"]);
  assert.deepEqual(ids(records), ["a", "b", "c"]);
});
