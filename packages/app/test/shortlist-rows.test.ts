import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import { fundItemOf, type InitiativeItem } from "../src/shortlist/items.ts";
import { fundHref, fundRows, initiativeRows, openingKind, shortlistSummary, type InitiativeLookup } from "../src/shortlist/rows.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const entries = catalogEntries(parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions")));
const at = new Date("2026-11-26T12:00:00Z");
const URI = "at://did:plc:abcdefghijklmnopqrstuvwx/org.hypercerts.collection/3lbmwj6wdkc2a";
const saved: InitiativeItem = { id: URI, name: "Seed library", publisher: "Lagoa", addedAt: at.toISOString() };

test("a shortlisted fund is a row with its funder and its deadline, linked to its opportunity", () => {
  const dated = entries.find((entry) => entry.program && entry.program.name !== entry.fund.displayName && entry.program.application.closesOn)!;
  const [row] = fundRows([fundItemOf(dated, at)], entries, at);
  assert.equal(row!.state, "listed");
  assert.equal(row!.name, dated.program!.name);
  assert.equal(row!.by, dated.fund.displayName);
  assert.equal(row!.href, `/funding/${dated.fund.id}?program=${dated.program!.id}`);
  assert.match(row!.when, /^(Closes|Ended|Closes in \d+ days|Closes today|Closes tomorrow)/u);
});

test("a fund the catalog no longer holds keeps its name and says so; a catalog that did not load calls nothing gone", () => {
  const gone = { id: "gone::program", name: "Old grants", funder: "Old fund", addedAt: at.toISOString() };
  assert.deepEqual(fundRows([gone], entries, at)[0], {
    id: "gone::program", name: "Old grants", href: null, by: "Old fund", when: "No longer in the catalog.", soon: false, state: "gone",
  });
  assert.equal(fundRows([gone], "failed", at)[0]!.state, "unchecked");
  assert.equal(fundRows([gone], "loading", at)[0]!.state, "checking");
  assert.equal(fundRows([gone], "loading", at)[0]!.href, "/funding/gone?program=program");
  assert.equal(fundHref("fund"), "/funding/fund");
});

test("a shortlisted initiative shows who shared it and where once the list answers, and never words it withdrew", () => {
  const found: InitiativeLookup = {
    status: "found",
    card: { uri: URI, name: "Community seed library", passages: ["words"], sharedAt: "2026-09-03T10:00:00Z", checkedAt: at.toISOString(), sourceUrl: "https://x", publisher: "Lagoa Seed Library", place: "São Paulo" },
  };
  const [row] = initiativeRows([saved], new Map([[URI, found]]));
  assert.equal(row!.name, "Community seed library");
  assert.equal(row!.by, "Lagoa Seed Library, São Paulo");
  assert.equal(row!.href, "/initiatives/abcdefghijklmnopqrstuvwx-3lbmwj6wdkc2a");
  const [missing] = initiativeRows([saved], new Map([[URI, { status: "missing" } as const]]));
  assert.equal(missing!.state, "gone");
  assert.equal(missing!.href, null, "a withdrawn project is not linked");
  assert.equal(missing!.name, "Seed library", "named as it was when marked");
  const [checking] = initiativeRows([saved], new Map());
  assert.equal(checking!.state, "checking");
  assert.equal(initiativeRows([saved], new Map([[URI, { status: "failed" } as const]]))[0]!.state, "unchecked");
});

test("the phone's line counts each kind, and is not drawn for an empty shortlist", () => {
  assert.equal(shortlistSummary(0, 0), null);
  assert.equal(shortlistSummary(3, 2), "Shortlist: 3 funds, 2 initiatives.");
  assert.equal(shortlistSummary(1, 0), "Shortlist: 1 fund.");
  assert.equal(shortlistSummary(0, 1), "Shortlist: 1 initiative.");
});

test("the shortlist opens on the kind asked for, else the one last shown that has records, else one that has", () => {
  assert.equal(openingKind("initiatives", null, 3, 0), "initiatives");
  assert.equal(openingKind(null, "initiatives", 3, 2), "initiatives");
  assert.equal(openingKind(null, "initiatives", 3, 0), "funds", "an empty kind is not reopened");
  assert.equal(openingKind(null, null, 0, 2), "initiatives");
  assert.equal(openingKind("nonsense", null, 0, 0), "funds");
});
