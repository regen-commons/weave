import assert from "node:assert/strict";
import test from "node:test";
import { DELETE, ENDPOINTS, GET, HEAD, POST, ROUTE_KEY, routeOf } from "./router.ts";

const ORIGIN = "https://weave.example";

test("each shared endpoint keeps the methods its own function exported", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(ENDPOINTS).map(([name, { methods }]) => [name, [...methods]])), {
    health: ["GET"],
    matching: ["POST"],
    projects: ["POST"],
    "public-projects": ["GET"],
    "record-page": ["GET", "HEAD"],
    transcribe: ["GET", "POST"],
  });
});

test("a request reaches its endpoint at its own address, with its query as it came and no routing key", () => {
  const route = (path: string) => routeOf(new URL(path, ORIGIN));
  // As the rewrites send it: the endpoint named, the address's own query after it.
  assert.deepEqual(route(`/api/router?${ROUTE_KEY}=public-projects&q=water&limit=6`), {
    endpoint: "public-projects", url: new URL("/api/public-projects?q=water&limit=6", ORIGIN),
  });
  assert.equal(route(`/api/router?${ROUTE_KEY}=record-page&kind=funding&id=local-people-powered&program=a`)?.url.href,
    `${ORIGIN}/api/record-page?kind=funding&id=local-people-powered&program=a`);
  // Reaching it without the key, at an endpoint's own address or a record's.
  assert.equal(route("/api/health")?.endpoint, "health");
  assert.equal(route("/funding/local-people-powered?program=a")?.url.href,
    `${ORIGIN}/api/record-page?program=a&kind=funding&id=local-people-powered`);
  assert.equal(route("/initiatives/c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j")?.url.searchParams.get("kind"), "initiative");
  // None for an endpoint that is not shared here, named twice, unknown, or a record path that does not decode.
  for (const path of [`/api/router?${ROUTE_KEY}=account`, `/api/router?${ROUTE_KEY}=health&${ROUTE_KEY}=transcribe`,
    `/api/router?${ROUTE_KEY}=__proto__`, `/api/router?${ROUTE_KEY}=constructor`, "/api/router", "/api/account", "/funding/%E0%A4%A"])
    assert.equal(route(path), null, path);
});

test("the router answers as each function did: its handler for its methods, 405 for any other, 404 for no endpoint", async () => {
  const health = await GET(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=health`));
  assert.deepEqual([health.status, ((await health.json()) as { status: string }).status], [200, "ok"]);
  const post = await POST(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=health`, { method: "POST", body: "{}" }));
  assert.deepEqual([post.status, await post.text()], [405, ""]);
  const del = await DELETE(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=public-projects`, { method: "DELETE" }));
  assert.equal(del.status, 405);
  // HEAD is the record page's own; for the public list, which never exported it, it is refused as before.
  assert.equal((await HEAD(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=public-projects`, { method: "HEAD" }))).status, 405);
  const nowhere = await GET(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=nowhere`));
  assert.deepEqual([nowhere.status, await nowhere.text()], [404, ""]);
});

test("the handler gets the request's own method, headers and body", async () => {
  // The public list is off without its database settings: its answer shows it read the query it was given.
  const list = await GET(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=public-projects&q=water`, { headers: { accept: "application/json" } }));
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as { index: { status: string } }).index.status, "off");
  // The query is checked by the handler as before: a key the list does not know is still refused.
  const refused = await GET(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=public-projects&other=1`));
  assert.equal(refused.status, 400);
  // A POST's body and headers arrive: matching refuses a request without a session the same way it did alone.
  const matching = await POST(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=matching`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({}),
  }));
  const direct = await (await import("./matching.ts")).POST(new Request(`${ORIGIN}/api/matching`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({}),
  }));
  assert.equal(matching.status, direct.status);
  assert.deepEqual(await matching.json(), await direct.json());
});
