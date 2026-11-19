// The dev server can read the public project list from production, and nothing else: one entry,
// one method, the list's own parameters, and no header or cookie of the browser's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_PROJECTS_FLAG, productionProjectsUrl, productionPublicProjects, readsProduction,
} from "../dev/production-projects.ts";
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("only the public project list is read from production, and only with the flag on", () => {
  assert.equal(readsProduction("1", "public-projects"), true);
  for (const flag of [undefined, "", "0", "true", "yes"]) assert.equal(readsProduction(flag, "public-projects"), false, String(flag));
  const entries = ["account", "sign-in", "projects", "matching", "health", "project-index-refresh",
    "certified-project-callback", "certified-project-client", "certified-project-consent", "certified-project-jwks",
    "public-projects/extra", "public-projects2", ""];
  for (const name of entries) assert.equal(readsProduction("1", name), false, name);
});

test("the proxied entry answers GET alone, so the bridge refuses every other method before anything is sent", () => {
  assert.deepEqual(Object.keys(productionPublicProjects()), ["GET"]);
});

test("the request that leaves goes to the production list with the list's own parameters and nothing else", () => {
  const target = productionProjectsUrl(new URL("http://localhost:5173/api/public-projects?q=water&cursor=abc&limit=6&fixture=draft&token=secret"));
  assert.equal(target.origin, PUBLIC_ORIGIN);
  assert.equal(target.pathname, "/api/public-projects");
  assert.deepEqual([...target.searchParams.keys()], ["q", "cursor", "limit"]);
  assert.equal(target.search, "?q=water&cursor=abc&limit=6");
  assert.equal(productionProjectsUrl(new URL("http://localhost:5173/api/public-projects")).href, `${PUBLIC_ORIGIN}/api/public-projects`);
});

test("no cookie, authorization or header of the browser's goes with it, and a redirect is not followed", async () => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const upstream: typeof fetch = async (input, init) => {
    sent.push({ url: String(input), init });
    return Response.json({ projects: [] }, { headers: { "set-cookie": "session=production" } });
  };
  const local = new Request("http://localhost:5173/api/public-projects?q=soil", {
    headers: { cookie: "weave_session=local", authorization: "Bearer local", "x-forwarded-for": "10.0.0.1", referer: "http://localhost:5173/initiatives" },
  });
  const answer = await productionPublicProjects(upstream).GET(local);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, `${PUBLIC_ORIGIN}/api/public-projects?q=soil`);
  const init = sent[0]!.init!;
  assert.equal(init.method, "GET");
  assert.equal(init.body, undefined);
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, { accept: "application/json" });
  // What comes back is the list and nothing that could set state in the browser.
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { projects: [] });
  assert.equal(answer.headers.get("set-cookie"), null);
  assert.equal(answer.headers.get("cache-control"), "no-store");
});

test("a production list that does not answer is a failure the page falls back from, never an error page", async () => {
  const down: typeof fetch = async () => { throw new Error("offline"); };
  const answer = await productionPublicProjects(down).GET(new Request("http://localhost:5173/api/public-projects"));
  assert.equal(answer.status, 502);
  assert.deepEqual(await answer.json(), { error: "production_projects_unavailable" });
});

test("the read is wired into the dev server alone, behind its flag, and has a launch entry", () => {
  const config = read("vite.config.ts");
  assert.equal(PRODUCTION_PROJECTS_FLAG, "WEAVE_PRODUCTION_PROJECTS");
  assert.equal(config.match(/WEAVE_PRODUCTION_PROJECTS/gu)?.length, 1, "one place reads the flag");
  const dev = config.slice(config.indexOf("configureServer(server)"), config.indexOf("configurePreviewServer(server)"));
  assert.match(dev, /readsProduction\(process\.env\.WEAVE_PRODUCTION_PROJECTS, name\)/u, "the dev server asks the one rule");
  assert.doesNotMatch(config.slice(config.indexOf("configurePreviewServer(server)")), /production-projects/u, "a preview build never reads production");
  // Nothing the browser runs knows the flag or the proxy.
  assert.doesNotMatch(read("src/partners/public-projects.ts"), /WEAVE_PRODUCTION_PROJECTS|production-projects/u);
  const launch = JSON.parse(read("../../.claude/launch.json")) as { configurations: { name: string; runtimeArgs: string[] }[] };
  const entry = launch.configurations.find(({ name }) => name === "app-production-projects");
  assert.ok(entry, "a launch entry starts it");
  assert.ok(entry.runtimeArgs.includes("WEAVE_ACCOUNT_FIXTURE=1"), "it runs beside the account fixture");
  assert.ok(entry.runtimeArgs.includes("WEAVE_PRODUCTION_PROJECTS=1"));
});
