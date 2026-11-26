import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry } from "../src/funding/contracts.ts";
import { FUND_SHORTLIST, INITIATIVE_SHORTLIST, fundItemOf, initiativeItemOf, type FundItem } from "../src/shortlist/items.ts";
import {
  createShortlistStore,
  readShortlist,
  SHORTLIST_LIMIT,
  toggledShortlist,
  writeShortlist,
  type ShortlistStorage,
} from "../src/shortlist/store.ts";

const entry = (fund: string, program?: string): Entry =>
  ({
    id: program ? `${fund}::${program}` : fund,
    fund: { id: fund, displayName: `Fund ${fund}` },
    program: program ? { id: program, name: `Program ${program}` } : null,
  }) as unknown as Entry;
const NOW = new Date("2026-11-26T10:00:00.000Z");
const PROJECT = "at://did:plc:abcdefghijklmnopqrstuvwx/org.hypercerts.collection/3lbmwj6wdkc2a";
const fund = (id: string): FundItem => ({ id, name: id, funder: "F", addedAt: NOW.toISOString() });

function memory(): ShortlistStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

test("a program is named by its own name and its funder's", () => {
  assert.deepEqual(fundItemOf(entry("river", "small-grants"), NOW), {
    id: "river::small-grants", name: "Program small-grants", funder: "Fund river", addedAt: NOW.toISOString(),
  });
});

test("an initiative keeps its address, name and publisher, and one with no Weave address is not kept", () => {
  const item = initiativeItemOf({ uri: PROJECT, name: "Seed library", publisher: "Lagoa" }, NOW);
  assert.ok(item, "the example address is a project address");
  assert.deepEqual(item, { id: PROJECT, name: "Seed library", publisher: "Lagoa", addedAt: NOW.toISOString() });
  assert.equal(initiativeItemOf({ uri: "https://example.org/x", name: "X" }, NOW), null);
  assert.deepEqual(INITIATIVE_SHORTLIST.parse({ ...item, passages: ["their words"] }), null, "no words of theirs are stored");
});

test("pressing again takes the record off, and the newest comes first", () => {
  const one = toggledShortlist([], fund("a"));
  assert.ok(!("full" in one));
  const two = toggledShortlist(one.items, fund("b"));
  assert.ok(!("full" in two));
  assert.deepEqual(two.items.map((item) => item.id), ["b", "a"]);
  const off = toggledShortlist(two.items, fund("a"));
  assert.ok(!("full" in off));
  assert.equal(off.added, false);
  assert.deepEqual(off.items.map((item) => item.id), ["b"]);
});

test("a full shortlist refuses an addition and drops nothing", () => {
  const items = Array.from({ length: SHORTLIST_LIMIT }, (_, index) => fund(`f${index}`));
  assert.deepEqual(toggledShortlist(items, fund("new")), { full: true });
});

test("what storage holds is read item by item, and damage is dropped, not guessed at", () => {
  assert.deepEqual(readShortlist(null, FUND_SHORTLIST), []);
  assert.deepEqual(readShortlist("not json", FUND_SHORTLIST), []);
  assert.deepEqual(readShortlist(JSON.stringify({ version: 2, items: [] }), FUND_SHORTLIST), []);
  const good = { id: "a::b", name: "A", funder: "F", addedAt: NOW.toISOString() };
  const raw = JSON.stringify({
    version: 1,
    items: [good, { ...good }, { ...good, id: "../../x" }, { ...good, id: "c", addedAt: "yesterday" }, "x"],
  });
  assert.deepEqual(readShortlist(raw, FUND_SHORTLIST), [good]);
  assert.deepEqual(readShortlist(writeShortlist([good]), FUND_SHORTLIST), [good]);
  assert.deepEqual(readShortlist(writeShortlist([good]), INITIATIVE_SHORTLIST), [], "a fund is not read as an initiative");
});

test("each kind keeps its own place in storage", () => {
  const place = memory();
  const funds = createShortlistStore(() => place, FUND_SHORTLIST);
  const initiatives = createShortlistStore(() => place, INITIATIVE_SHORTLIST);
  funds.toggle(fund("a"));
  initiatives.toggle(initiativeItemOf({ uri: PROJECT, name: "Seed library" }, NOW)!);
  assert.deepEqual([...place.values.keys()].sort(), [FUND_SHORTLIST.key, INITIATIVE_SHORTLIST.key].sort());
  assert.equal(funds.current().items.length, 1);
  assert.equal(initiatives.current().items.length, 1);
});

test("the store writes each change through and tells every listener", () => {
  const place = memory();
  const store = createShortlistStore(() => place, FUND_SHORTLIST);
  let heard = 0;
  store.subscribe(() => heard++);
  assert.equal(store.toggle(fund("a")), "added");
  assert.equal(store.current().kept, true);
  assert.deepEqual(readShortlist(place.values.get(FUND_SHORTLIST.key) ?? null, FUND_SHORTLIST).map((item) => item.id), ["a"]);
  store.remove("a");
  assert.deepEqual(store.current().items, []);
  assert.equal(heard, 2);
});

test("a browser that refuses storage keeps the shortlist for this visit and says so", () => {
  const store = createShortlistStore(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  }), FUND_SHORTLIST);
  assert.equal(store.toggle(fund("a")), "added");
  assert.equal(store.current().kept, false);
  assert.equal(store.current().items.length, 1);
  // Another tab's change does not wipe what this tab could not store.
  store.reload();
  assert.equal(store.current().items.length, 1);
});

test("a browser with no storage at all starts empty and not kept", () => {
  const store = createShortlistStore(() => {
    throw new Error("SecurityError");
  }, FUND_SHORTLIST);
  assert.deepEqual(store.current(), { items: [], kept: false });
});

test("another tab's change is read on reload", () => {
  const place = memory();
  const store = createShortlistStore(() => place, FUND_SHORTLIST);
  assert.deepEqual(store.current().items, []);
  place.setItem(FUND_SHORTLIST.key, writeShortlist([fund("b")]));
  store.reload();
  assert.deepEqual(store.current().items.map((item) => item.id), ["b"]);
});
