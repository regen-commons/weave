import assert from "node:assert/strict";
import test from "node:test";
import type { AccountProvider } from "./account-provider.ts";
import { withRenewedSession } from "./account-session.ts";
import { createRouter, DELETE, ENDPOINTS, GET, HEAD, POST, ROUTE_KEY, routeOf } from "./router.ts";
import { createTranscribeHandlers } from "./transcribe.ts";
import { CLOUD_SPEECH } from "./transcribe-contract.ts";
import type { SpeechProvider } from "./transcribe-provider.ts";

const ORIGIN = "https://weave.example";

test("each shared endpoint keeps the methods its own function exported", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(ENDPOINTS).map(([name, { methods }]) => [name, [...methods]])), {
    health: ["GET"],
    "initiatives-page": ["GET", "HEAD"],
    matching: ["POST"],
    projects: ["POST"],
    "public-projects": ["GET"],
    "record-page": ["GET", "HEAD"],
    sitemap: ["GET", "HEAD"],
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
  // Reaching it without the key, at an endpoint's own address or a record's: the path decides, and a key a
  // client adds there is ignored and taken off.
  assert.equal(route("/api/health")?.endpoint, "health");
  assert.deepEqual(route(`/api/transcribe?${ROUTE_KEY}=health`), { endpoint: "transcribe", url: new URL("/api/transcribe", ORIGIN) });
  assert.equal(route(`/funding/x?${ROUTE_KEY}=health`)?.endpoint, "record-page");
  assert.deepEqual(route("/sitemap.xml"), { endpoint: "sitemap", url: new URL("/api/sitemap", ORIGIN) });
  assert.equal(route("/funding/local-people-powered?program=a")?.url.href,
    `${ORIGIN}/api/record-page?program=a&kind=funding&id=local-people-powered`);
  assert.equal(route("/initiatives/c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j")?.url.searchParams.get("kind"), "initiative");
  // The Initiatives list's own address, with whatever search or filter its query carries.
  assert.deepEqual(route(`/initiatives?q=water&${ROUTE_KEY}=health`), {
    endpoint: "initiatives-page", url: new URL("/api/initiatives-page?q=water", ORIGIN),
  });
  assert.equal(route(`/api/router?${ROUTE_KEY}=initiatives-page`)?.endpoint, "initiatives-page");
  // None for an endpoint that is not shared here, named twice, unknown, or a record path that does not decode.
  for (const path of [`/api/router?${ROUTE_KEY}=account`, `/api/router?${ROUTE_KEY}=health&${ROUTE_KEY}=transcribe`, `/api/router?${ROUTE_KEY}=`,
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

test("the handler gets the request's own method, headers, body and query, and its answer comes back as it is", async () => {
  const echo = async (request: Request) => {
    const headers = new Headers({ "cache-control": "no-store", "x-seen-method": request.method });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    return Response.json({ url: request.url, origin: request.headers.get("origin"), type: request.headers.get("content-type"),
      cookie: request.headers.get("cookie"), body: request.method === "HEAD" ? null : await request.text() }, { status: 201, headers });
  };
  const router = createRouter({
    projects: { methods: ["POST"], load: async () => ({ POST: echo }) },
    "record-page": { methods: ["GET", "HEAD"], load: async () => ({ GET: echo, HEAD: echo }) },
  });
  const posted = await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=projects&x=1`, {
    method: "POST", body: JSON.stringify({ action: "state" }),
    headers: { origin: ORIGIN, "content-type": "application/json", cookie: "__Host-weave_account=t" },
  }));
  assert.equal(posted.status, 201);
  assert.equal(posted.headers.get("x-seen-method"), "POST");
  assert.deepEqual(posted.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"], "every Set-Cookie comes back");
  assert.deepEqual(await posted.json(), {
    url: `${ORIGIN}/api/projects?x=1`, origin: ORIGIN, type: "application/json", cookie: "__Host-weave_account=t", body: '{"action":"state"}',
  });
  // HEAD on a record's address reaches the record page's own HEAD.
  const head = await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=record-page&kind=funding&id=x`, { method: "HEAD" }));
  assert.deepEqual([head.status, head.headers.get("x-seen-method")], [201, "HEAD"]);
  // The real public list still checks its own query: a key it does not know is refused.
  const refused = await GET(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=public-projects&other=1`));
  assert.equal(refused.status, 400);
});

test("a recording reaches cloud speech through the router as it came: streamed, over 64 KB, its headers and origin intact", async () => {
  // A recording well over the JSON limit, sent as a stream in pieces, the way the browser posts it.
  const audio = Uint8Array.from({ length: 300_000 }, (_, index) => (index * 31 + 7) % 256);
  const received: { bytes: Uint8Array; language: string | null }[] = [];
  const speech: SpeechProvider = {
    async transcribe(bytes, { language }) {
      received.push({ bytes: Uint8Array.from(bytes), language });
      return { text: "We grow seedlings" };
    },
  };
  const router = createRouter({ transcribe: { methods: ["GET", "POST"], load: async () => createTranscribeHandlers({ provider: speech }) } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < audio.length; at += 65_536) controller.enqueue(audio.subarray(at, at + 65_536));
      controller.close();
    },
  });
  const response = await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=transcribe`, {
    method: "POST", body: stream, duplex: "half",
    headers: {
      origin: ORIGIN, "content-type": "audio/webm;codecs=opus",
      [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement, [CLOUD_SPEECH.languageHeader]: "pt-BR",
    },
  } as RequestInit));
  assert.equal(response.status, 200, "the handler's own-origin, agreement and audio checks all pass");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(received.length, 1);
  assert.equal(received[0]!.bytes.length, audio.length);
  assert.ok(received[0]!.bytes.every((byte, index) => byte === audio[index]), "every byte, in order");
  assert.equal(received[0]!.language, "pt");
});

test("matching and projects behind the router still renew a lapsed session, and its new cookies reach the browser", async () => {
  // The real handlers are these wrappers: the router loads each module's own export.
  assert.equal((await ENDPOINTS.matching.load()).POST, (await import("./matching.ts")).POST);
  assert.equal((await ENDPOINTS.projects.load()).POST, (await import("./projects.ts")).POST);
  const now = Date.parse("2026-11-20T12:00:00Z");
  const jwt = (seconds: number, label: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: now / 1000 + seconds, label })).toString("base64url")}.c2ln`;
  const fresh = jwt(3600, "renewed");
  const renewals: string[] = [];
  const provider = {
    renew: async (refreshToken: string) => { renewals.push(refreshToken); return { token: fresh, expiresIn: 3600, refreshToken: "rotated-refresh" }; },
    authorize: async () => ({ id: "b1000000-0000-4000-8000-000000000001", email: null }),
  } as unknown as AccountProvider;
  const echo = async (request: Request) => Response.json({ cookie: request.headers.get("cookie"), body: await request.text() });
  const renewing = { methods: ["POST"] as const, load: async () => ({ POST: withRenewedSession(echo, () => ({ provider, secureCookies: true, now: () => now })) }) };
  const router = createRouter({ matching: renewing, projects: renewing });
  const refresh = Buffer.from("first-refresh").toString("base64url");
  for (const endpoint of ["matching", "projects"]) {
    const response = await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=${endpoint}`, {
      method: "POST", body: JSON.stringify({ action: "state" }),
      headers: { origin: ORIGIN, "content-type": "application/json",
        cookie: `__Host-weave_account=${jwt(-30, "lapsed")}; __Host-weave_account_renewal=${refresh}` },
    }));
    assert.equal(response.status, 200, endpoint);
    const seen = await response.json() as { cookie: string; body: string };
    assert.ok(seen.cookie.includes(`__Host-weave_account=${fresh}`), `${endpoint}'s handler gets the renewed token`);
    assert.equal(seen.body, JSON.stringify({ action: "state" }));
    assert.deepEqual(response.headers.getSetCookie().map((line) => line.split("=")[0]),
      ["__Host-weave_account", "__Host-weave_account_renewal"], `${endpoint}: both rotated cookies come back`);
  }
  assert.deepEqual(renewals, ["first-refresh", "first-refresh"]);
});
