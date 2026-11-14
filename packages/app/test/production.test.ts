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
    "Orchard learning circle",
    "Willow tools cooperative",
    "River maps collective",
    "A request for a community learning session.",
    "A registered host with four years of accounts",
    "EXAMPLE_SUBJECT",
    "weave-prototype",
    "example-scenario",
    "describe-example",
    "intake-example",
    "Fictional matching example",
    "Local fixture controls",
    "Open fixture account",
    "External editor fixture",
    "Publish synthetic project and return",
    "/__fixture?editor=",
    "10000000-0000-4000-8000-000000000099",
    "Synthetic accounts only.",
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
    "An example change that could not be saved.",
    "Example only. No reminder",
    "Example stopped.",
    "Example model error",
    "checking again approves it",
    "Example catalog error",
    "Fictional examples. Changes are temporary",
    "download-example",
    "Cloud consent simulation",
    "Continue to Weave as",
    "Weave learns who you are on Certified and nothing else.",
    "Create this project as",
    "A group shares from its team workspace.",
    "Turn on the reminder",
    "Saved. No invitation is sent.",
    "Know a fund that is not here?",
    "No partners fit your open needs or offers yet.",
    "To search what other teams have shared again",
    "Send suggestion",
    "Sign in to start from a Certified project",
    "Delete my account",
    "Stopped. Your words and cards are still here.",
    "Nobody on the list yet.",
  ]) {
    assert.ok(!bundle.includes(fixtureOnly), `${fixtureOnly} leaked into the production bundle`);
  }
  // These agreed screens now use real project discovery in production; only their synthetic data stays excluded.
  for (const liveCopy of ["You have no project on Certified yet", "Which project is ", "No Certified project found for your account."])
    assert.ok(bundle.includes(liveCopy), `${liveCopy} is missing from the live project screens`);
});

/** The sources a directive of the deployed security policy allows, falling back to default-src. */
function allowedSources(policy: string, directive: string): string[] {
  const directives = new Map(
    policy.split(";").map((part) => part.trim().split(/\s+/)).filter((words) => words[0]).map(([name, ...sources]) => [name!, sources]),
  );
  return directives.get(directive) ?? directives.get("default-src") ?? [];
}

test("the production stylesheet asks only for images and fonts the security policy lets it load", async (context) => {
  if (!existsSync(assets)) {
    context.skip("Build @weave/app first; CI builds before running this check.");
    return;
  }
  // An image or font the policy refuses fails silently in the browser, and only on the deployed
  // site: the dev server sends no policy. The paper grain was lost that way as an inline data: image.
  const { previewSecurityHeaders } = await import("../dev/security-headers.ts");
  const policy = previewSecurityHeaders()["Content-Security-Policy"]!;
  const styles = readdirSync(assets).filter((path) => path.endsWith(".css"));
  assert.ok(styles.length > 0, "Expected a built stylesheet");
  const urls = styles.flatMap((path) =>
    [...readFileSync(`${assets}/${path}`, "utf8").matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)].map((match) => match[2]!),
  );
  assert.ok(urls.some((url) => /grain[-.\w]*\.svg$/.test(url)), "the paper grain is loaded as a file");
  for (const directive of ["img-src", "font-src"]) {
    const sources = allowedSources(policy, directive);
    for (const url of urls) {
      if (url.startsWith("#")) continue;
      if (url.startsWith("data:")) assert.ok(sources.includes("data:"), `${directive} refuses the inline ${url.slice(0, 40)}`);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(url))
        assert.ok(sources.some((source) => source !== "'self'" && url.startsWith(source)), `${directive} refuses ${url}`);
      else assert.ok(sources.includes("'self'"), `${directive} refuses the site's own ${url}`);
    }
  }
});
