// The must-match gate (README.md#must-match-suite): every gated pair must hold on every pull request.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadMustMatch, runMustMatch, summary, validateSuite } from "../evaluation/must-match.ts";

const data = loadMustMatch();

test("every gated must-match pair holds, and a failure says which pair, why it must hold and what ranked instead", async () => {
  const results = runMustMatch(await data);
  const failed = results.filter(({ status, pass }) => status === "gate" && !pass);
  assert.deepEqual(
    failed.map(({ id, persona, reason, detail }) => `${id} (${persona}): ${reason}\n  Ranked: ${detail}`),
    [],
    "Run `bun run --filter @weave/app eval:must-match` for the whole table. Change a pair only when the rubric says it was wrong, and say why in its reason.",
  );
  const { gated, gatedPassed } = summary(results);
  assert.equal(gatedPassed, gated);
  // Every persona the PRD's table names, and both directions, are covered.
  const personas = results.map(({ persona }) => persona).join(" ");
  for (const persona of ["technology builder", "place-based community", "research group", "art and culture", "funder", "cross-language, pt", "cross-language, es", "keyword trap"])
    assert.ok(personas.includes(persona), persona);
});

test("the suite is still the one the rubric wrote: Green Goods and Tech and Sun both ways, keyword traps kept out", async () => {
  const { suite } = await data;
  const partner = (id: string) => suite.partners.find((pair) => pair.id === id)!;
  assert.deepEqual([partner("P-01").entry, partner("P-01").must], ["gg-need-pilots", ["tech-and-sun"]]);
  assert.deepEqual([partner("P-03").entry, partner("P-03").must], ["tas-need-record", ["green-goods"]]);
  assert.deepEqual(suite.funds.find((pair) => pair.id === "F-01")!.must, [
    "local-all-on::all-on-challenge-2026", "local-rogeap::rogeap-ctf-round4", "local-rea::rea-dares", "local-ekoenergy::ekoenergy-climate-fund",
  ]);
  assert.ok(suite.partners.filter(({ mustNot }) => mustNot?.length).length >= 2, "keyword traps stay in the suite");
});

test("the previous matchers fail the suite where the anchor case said they did", async () => {
  const before = new Map(runMustMatch(await data, "before").map((result) => [result.id, result.pass]));
  // Tech and Sun's energy funds ranked below internet funds; Green Goods' record offer never reached Tech and Sun;
  // bioacoustic projects reached Green Goods on shared words; a need for money met projects that do not fund.
  for (const id of ["F-01", "F-02", "P-02", "P-03", "N-01", "N-02", "N-05"]) assert.equal(before.get(id), false, id);
});

test("a pair the suite cannot judge is refused by name", () => {
  const known = { programs: new Set(["p"]), initiatives: new Set(["i"]), projects: new Set(["rp-1"]) };
  const base = { version: 1, dataset: "x", initiatives: [{ id: "i", name: "I", lens: "research", entries: [{ id: "e" }] }], funds: [], programs: [], partners: [] };
  const fund = { id: "F", persona: "p", initiative: "i", within: 10, status: "gate", reason: "r" };
  assert.throws(() => validateSuite({ ...base, funds: [{ ...fund, must: ["nope"] }] }, known), /unknown_program: F nope/u);
  assert.throws(() => validateSuite({ ...base, funds: [{ ...fund, must: ["p"], reason: "" }] }, known), /case_without_reason: F/u);
  assert.throws(() => validateSuite({ ...base, funds: [{ ...fund }] }, known), /nothing_to_check: F/u);
  assert.throws(() => validateSuite({ ...base, partners: [{ id: "P", persona: "p", entry: "e", within: 3, status: "gate", reason: "r", must: ["rp-9"] }] }, known), /unknown_project: P rp-9/u);
  assert.throws(() => validateSuite({ ...base, funds: [{ ...fund, must: ["p"] }, { ...fund, must: ["p"] }] }, known), /duplicate_or_missing_case: F/u);
});
