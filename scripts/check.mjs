import fs from "node:fs";
import { validateSnapshot } from "./research-validation.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const f of [
  "dist/app.js",
  "dist/domain.mjs",
  "dist/deadlines.mjs",
  "dist/storage.mjs",
  "dist/matching.mjs",
  "dist/matching-client.mjs",
  "dist/match-worker.mjs",
  "dist/semantic-config.mjs",
  "scripts/build-ai.mjs",
  "scripts/research-validation.mjs",
  "serve.mjs",
])
  execFileSync(process.execPath, ["--check", root + f], { stdio: "inherit" });
const data = validateSnapshot(new URL("../", import.meta.url));
if (
  data.funds.length !== data.recordCount ||
  new Set(data.funds.map((f) => f.id)).size !== data.recordCount
)
  throw new Error("Catalog coverage must match its unique record count.");
const html = fs.readFileSync(root + "dist/index.html", "utf8");
// Check visible counts, metadata and the downloadable snapshot's filename.
for (const match of html.matchAll(/\b(\d+) (?:funding )?records\b|<strong>(\d+)<\/strong>(?= records|<span>catalog records)|funding-commons-(\d+)\.json/g)) {
  const count = Number(match[1] ?? match[2] ?? match[3]);
  if (count !== data.recordCount)
    throw new Error(`Static catalog count ${count} differs from ${data.recordCount}: ${match[0]}`);
}
for (const f of [
  "index.html",
  "styles.css",
  "app.js",
  "domain.mjs",
  "deadlines.mjs",
  "storage.mjs",
  "matching.mjs",
  "matching-client.mjs",
  "match-worker.mjs",
  "semantic-config.mjs",
  "data/eligibility-rules.json",
  "data/program-conditions.json",
  "data/fund-vectors.json",
  "data/fund-vectors.f32",
  "data/model-assets.json",
  "data/enrichment.schema.json",
  "data/research-coverage.json",
  "data/research-followup.json",
  "data/funders.json",
])
  if (!fs.statSync(root + "dist/" + f).size)
    throw new Error("Missing static asset: " + f);
console.log(
  `Static app ready: ${data.recordCount} records; all 593 original identities retained; syntax and assets checked.`,
);
