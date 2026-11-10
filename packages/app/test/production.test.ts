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
    "orchard.certified.one",
    "Example of Certified",
    "Seed library of the upper valley",
    "Example door",
    "weave-prototype",
    "Example sign-in",
    "Example link",
    "Example request",
    "Example sharing",
    "Example publishing",
    "Upper valley growers",
    "Valley seed keepers",
    "Spring water notes",
    "You have no project on Certified yet",
    "An example change that could not be saved.",
    "Example only. No reminder",
    "Example stopped.",
    "Example model error",
    "checking again approves it",
    "Example catalog error",
  ]) {
    assert.ok(!bundle.includes(fixtureOnly), `${fixtureOnly} leaked into the production bundle`);
  }
});
