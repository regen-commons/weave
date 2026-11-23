import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fundingPreviews } from "../src/home.ts";
import { answerCatalog, CatalogRequestSchema, closingSoonOf, type CatalogRequest } from "../src/funding/catalog-requests.ts";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { projectFrom } from "../src/funding/profile.ts";
import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise } from "../src/describe/contracts.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const bundle = parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions"));
const sources = { catalog: "https://example.org/f.json", rules: "https://example.org/r.json", conditions: "https://example.org/c.json" };
const at = new Date("2026-11-05T12:00:00Z");

test("the catalog worker answers each page with what it shows, from the one catalog it holds (Q-01)", () => {
  const whole: CatalogRequest = { id: 1, sources, retry: false, kind: "bundle" };
  assert.equal(answerCatalog(bundle, whole), bundle, "Funding and a fund's sheet get the whole bundle");
  const home = answerCatalog(bundle, { id: 2, sources, retry: false, kind: "closing-soon", now: at.toISOString() });
  assert.deepEqual(home, fundingPreviews(catalogEntries(bundle), at), "Home gets exactly what its strip showed before");
  assert.deepEqual(home, closingSoonOf(bundle, at));
  assert.ok("upcoming" in home && home.upcoming.length <= 4 && home.upcoming.every((entry) => entry.fund && "program" in entry));
  const project = projectFrom(
    confirmDraft(
      revise(newDraft(), {
        proposal: { ...EMPTY_INITIATIVE, name: "Seed library", description: "Seed saving, agroecology and food sovereignty", themes: [] },
        proposalVersion: 0,
      }),
    ),
  )!;
  const ranked = answerCatalog(bundle, { id: 3, sources, retry: false, kind: "rank", project });
  assert.deepEqual(ranked, evaluateCatalog(bundle, project), "ranking the worker's own copy is the same ranking");
});

test("a request the worker cannot read is refused, never guessed at", () => {
  assert.equal(CatalogRequestSchema.safeParse({ id: 1, sources, retry: false, kind: "everything" }).success, false);
  assert.equal(CatalogRequestSchema.safeParse({ id: 1, sources, retry: false, kind: "closing-soon", now: "soon" }).success, false);
  assert.equal(CatalogRequestSchema.safeParse({ id: 1, retry: false, kind: "bundle" }).success, false, "it is told where the files are");
  assert.equal(CatalogRequestSchema.safeParse({ id: 1, sources, retry: false, kind: "rank", project: { name: "x" } }).success, false);
  assert.equal(CatalogRequestSchema.safeParse({ id: 1, sources, retry: true, kind: "bundle" }).success, true);
});

test("the page no longer reads the catalog itself while a worker can (Q-01)", () => {
  const client = readFileSync(new URL("../src/funding/client.ts", import.meta.url), "utf8");
  assert.match(client, /new Worker\(new URL\("\.\/catalog-worker\.ts", import\.meta\.url\)/u);
  assert.match(client, /port\s*\?[\s\S]*?ask\(port, \{ kind: "bundle", retry \}\)[\s\S]*?: readCatalog\(sources\(\)\)/u, "the page reads it only where there is no worker");
});
