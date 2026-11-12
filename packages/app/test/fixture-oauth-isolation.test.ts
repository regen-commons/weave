import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { answerApiRequest } from "../dev/api-bridge.ts";
import { isolateFixtureProjectOAuth } from "../dev/fixture-oauth-isolation.ts";
import { apiRoutes } from "../vite.config.ts";
import type { Connect, ViteDevServer } from "vite";

const apiDir = fileURLToPath(new URL("../api/", import.meta.url));
const oauthEntries = ["certified-project-consent", "certified-project-client", "certified-project-jwks", "certified-project-callback"];
let fixture = true;
const loaded: string[] = [];
const server = createServer((request, response) => {
  const loader = isolateFixtureProjectOAuth(fixture, async name => {
    loaded.push(name);
    assert.equal(fixture, false, "a fixture request must not import the real OAuth entry");
    return { GET: () => Response.json({ entry: name }), POST: () => Response.json({ entry: name }) };
  });
  void answerApiRequest(request, response, apiDir, loader).catch(error => {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "test_dispatch_failed");
  });
});
let origin = "";
before(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

test("fixture HTTP dispatch disables every project OAuth route before the live entry loader can run", async () => {
  fixture = true;
  loaded.length = 0;
  for (const entry of oauthEntries) {
    for (const method of ["GET", "POST"]) {
      const response = await fetch(`${origin}/api/${entry}`, {
        method, headers: { Origin: origin, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ action: "create-project" }) } : {}),
      });
      assert.equal(response.status, 503, `${entry} ${method}`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "project_workspace_unavailable" });
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.equal(response.headers.get("location"), null);
    }
  }
  assert.deepEqual(loaded, []);
});

test("normal development preserves each OAuth entry's loader and handlers", async () => {
  fixture = false;
  loaded.length = 0;
  for (const entry of oauthEntries) {
    const response = await fetch(`${origin}/api/${entry}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { entry });
  }
  assert.deepEqual(loaded, oauthEntries);
});

test("the fixture guard covers future project OAuth entries while preserving unrelated fixture dispatch", async () => {
  const calls: string[] = [];
  const module = { GET: () => Response.json({ fixture: true }) };
  const load = isolateFixtureProjectOAuth(true, async name => { calls.push(name); return module; });
  const oauth = await load("certified-project-future-action");
  assert.equal(typeof oauth.POST, "function");
  assert.equal((await (oauth.POST as () => Response)()).status, 503);
  for (const entry of ["account", "sign-in", "matching", "projects", "health"])
    assert.equal(await load(entry), module);
  assert.deepEqual(calls, ["account", "sign-in", "matching", "projects", "health"]);
});

test("the actual Vite development middleware blocks project OAuth before ssrLoadModule, even with projects enabled", async () => {
  const previousFixture = process.env.WEAVE_ACCOUNT_FIXTURE;
  const previousProjects = process.env.WEAVE_PROJECTS_ENABLED;
  const calls: string[] = [];
  let middleware: Connect.NextHandleFunction | undefined;
  const plugin = apiRoutes();
  const hook = plugin.configureServer;
  assert.equal(typeof hook, "function");
  process.env.WEAVE_ACCOUNT_FIXTURE = "1";
  process.env.WEAVE_PROJECTS_ENABLED = "true";
  const fake = {
    config: { root: fileURLToPath(new URL("../", import.meta.url)) },
    middlewares: { use(mount: string, handle: Connect.NextHandleFunction) {
      if (mount === "/__fixture") return;
      assert.equal(mount, "/api"); middleware = handle;
    } },
    async ssrLoadModule(path: string) { calls.push(path); throw Error("live_loader_must_not_run"); },
  } as unknown as ViteDevServer;
  const local = createServer((request, response) => {
    assert.ok(middleware);
    middleware(request, response, () => { response.statusCode = 500; response.end(); });
  });
  try {
    await (hook as (server: ViteDevServer) => unknown)(fake);
    await new Promise<void>(resolve => local.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(local.address() as AddressInfo).port}`;
    for (const entry of oauthEntries) {
      const response = await fetch(`${base}/api/${entry}`, {
        method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-project" }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "project_workspace_unavailable" });
    }
    assert.deepEqual(calls, []);
  } finally {
    local.closeAllConnections(); local.close();
    if (previousFixture === undefined) delete process.env.WEAVE_ACCOUNT_FIXTURE;
    else process.env.WEAVE_ACCOUNT_FIXTURE = previousFixture;
    if (previousProjects === undefined) delete process.env.WEAVE_PROJECTS_ENABLED;
    else process.env.WEAVE_PROJECTS_ENABLED = previousProjects;
  }
});
