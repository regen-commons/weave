import {auditCatalog} from './helpers/audit-revisions.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { upcomingWindows } from "../dist/deadlines.mjs";
import { priorFundingRecord } from "./helpers/prior-funding-record.mjs";
const read = (path) => JSON.parse(fs.readFileSync(new URL("../" + path, import.meta.url)));
const data = auditCatalog(read("dist/data/funders.json"));
const baseline = read("research/history-import-baseline.json");
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;

test("historical discovery retains the full prior revision of all 618 funder records", () => {
  assert.equal(Object.keys(baseline.sha256ById).length, 618);
  for (const [id, expected] of Object.entries(baseline.sha256ById)) {
    const fund = data.funds.find(f => f.id === id);
    assert.ok(fund, id);
    assert.equal(createHash("sha256").update(JSON.stringify(canonical(priorFundingRecord(fund)))).digest("hex"), expected, id);
  }
});
test("historical leads retain paused rounds, unknown next seasons and bounded scope", () => {
  const get = id => data.funds.find(f => f.id === "local-" + id).enrichment.programs[0];
  assert.equal(get("obol").application.route, "closed");
  assert.equal(get("interledger").application.route, "closed");
  assert.equal(get("gooddollar").application.route, "unconfirmed");
  assert.equal(get("gooddollar").application.closesOn, null);
  assert.equal(get("fid").award.max, 200000);
  assert.equal(get("ssv").award.max, null, "program pool must not become award ceiling");
  const upcoming = upcomingWindows(data.funds, new Date(2026, 9, 29, 12));
  assert.ok(upcoming.some(w => w.program.id === "zero-foodprint" && w.instant === null));
  for (const id of ["obol", "interledger", "gooddollar", "ssv"])
    assert.ok(!upcoming.some(w => w.program.id === id));
});
