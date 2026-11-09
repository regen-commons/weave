import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const assets = fileURLToPath(new URL("../dist/assets/", import.meta.url));
test("production bundles exclude the development fixture records and controls", (context) => {
  if (!existsSync(assets)) {
    context.skip("Build @weave/app first; CI builds before running this check.");
    return;
  }
  const scripts = readdirSync(assets).filter((path) => path.endsWith(".js"));
  assert.ok(scripts.length > 0, "Expected built JavaScript");
  const bundle = scripts.map((path) => readFileSync(`${assets}/${path}`, "utf8")).join("\n");
  for (const fixtureOnly of [
    "example@weave.test",
    "weave_fixture_account",
    "Local account example",
    "Example email door",
    "Example email choices",
    "Example account cleared",
    "This clears only this page",
    "That example code does not match",
    "Orchard learning circle",
    "Willow tools cooperative",
    "A fictional request for a community learning session.",
    "example-scenario",
    "EXAMPLE_SUBJECT",
    "download-example",
    "Cloud consent simulation",
    "describe-example",
    "intake-example",
    "Fictional matching example",
    "Step 4 examples seed",
    "Fictional funding examples",
    "Confirm example request",
    "A fictional registered host with four years of accounts",
  ]) {
    assert.ok(!bundle.includes(fixtureOnly), `${fixtureOnly} leaked into the production bundle`);
  }
});
