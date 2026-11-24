import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Lighthouse CI drops a budget whose pattern matches no address, so a renamed route or a typo would stop
// gating without a word. These checks keep every address under exactly one performance budget.
type Assertion = [string, { minScore?: number; maxNumericValue?: number; aggregationMethod?: string }];
type Config = {
  ci: {
    collect: { startServerCommand: string; url: string[]; numberOfRuns: number };
    assert: { assertMatrix: { matchingUrlPattern: string; assertions: Record<string, Assertion> }[] };
    upload: { target: string };
  };
};
const config = JSON.parse(readFileSync(new URL("../lighthouserc.json", import.meta.url), "utf8")) as Config;
const { url: urls } = config.ci.collect;
const matching = (assertion: string) => (address: string) =>
  config.ci.assert.assertMatrix.filter((entry) => entry.assertions[assertion] && new RegExp(entry.matchingUrlPattern, "u").test(address));
const PRIVATE = ["/start/initiative", "/your-initiatives", "/settings"];

test("every address Lighthouse visits has exactly one performance budget, and every budget an address", () => {
  for (const address of urls) assert.equal(matching("categories:performance")(address).length, 1, address);
  for (const entry of config.ci.assert.assertMatrix.filter((e) => e.assertions["categories:performance"]))
    assert.ok(urls.some((address) => new RegExp(entry.matchingUrlPattern, "u").test(address)), entry.matchingUrlPattern);
});

test("accessibility and best practices are 100 everywhere, and SEO on the public pages only", () => {
  for (const address of urls) {
    const score = (category: string) => matching(category)(address)[0]?.assertions[category]![1].minScore;
    assert.equal(score("categories:accessibility"), 1, `accessibility ${address}`);
    assert.equal(score("categories:best-practices"), 1, `best practices ${address}`);
    const seo = matching("categories:seo")(address).length;
    // The private pages are kept out of search on purpose.
    assert.equal(seo, PRIVATE.some((path) => address.endsWith(path)) ? 0 : 1, `SEO ${address}`);
  }
});

test("Lighthouse runs three times on its own server, and keeps its reports off public storage", () => {
  assert.equal(config.ci.collect.numberOfRuns, 3);
  const port = /serve\.mjs (\d+)$/u.exec(config.ci.collect.startServerCommand)?.[1];
  assert.ok(port && urls.every((address) => new URL(address).port === port));
  // The interface checks use 4796 and its preview 4797; Lighthouse's server and preview must not meet them.
  assert.ok(![4796, 4797].includes(Number(port)) && ![4796, 4797].includes(Number(port) + 1));
  assert.equal(config.ci.upload.target, "filesystem");
});
