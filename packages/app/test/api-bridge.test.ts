// The dev server's /api bridge answers the way Vercel does: 404 for any path that is not
// an entry, 405 for a method the entry does not export, the browser's own origin, every
// Set-Cookie, and bodies streamed as they are written.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, get } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { answerApiRequest } from "../dev/api-bridge.ts";

let release = () => {};
const handlers: Record<string, Record<string, unknown>> = {
  echo: {
    GET: (request: Request) => Response.json({ url: request.url }),
    POST: async (request: Request) => Response.json(await request.json(), { status: 201, statusText: "Saved" }),
  },
  cookies: {
    GET: () => {
      const headers = new Headers();
      headers.append("set-cookie", "access=a; Path=/");
      headers.append("set-cookie", "refresh=b; Path=/");
      return new Response(null, { status: 204, headers });
    },
  },
  "nested/stream": {
    GET: () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode("first"));
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            controller.enqueue(new TextEncoder().encode("second"));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  },
};

const apiDir = mkdtempSync(join(tmpdir(), "api-bridge-"));
const server = createServer((request, response) => {
  answerApiRequest(request, response, apiDir, async (name) => handlers[name] ?? {}).catch(() => response.destroy());
});
let base = "";

before(async () => {
  mkdirSync(join(apiDir, "nested"));
  for (const name of Object.keys(handlers)) writeFileSync(join(apiDir, `${name}.ts`), "");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(apiDir, { recursive: true, force: true });
});

test("a path that is not an entry is a 404, and an unexported method a 405", async () => {
  for (const path of ["/api", "/api/", "/api/missing", "/api/echo/", "/api/echo.ts", "/api/nested/missing"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/api/echo`, { method: "DELETE" })).status, 405);
});

test("handlers see the browser's origin, the query and the request body", async () => {
  const { url } = (await (await fetch(`${base}/api/echo?step=needs`)).json()) as { url: string };
  assert.equal(url, `${base}/api/echo?step=needs`);
  const saved = await fetch(`${base}/api/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ana" }) });
  assert.equal(saved.status, 201);
  assert.equal(saved.statusText, "Saved");
  assert.deepEqual(await saved.json(), { name: "Ana" });
});

test("every Set-Cookie reaches the browser", async () => {
  const response = await fetch(`${base}/api/cookies`);
  assert.deepEqual(response.headers.getSetCookie(), ["access=a; Path=/", "refresh=b; Path=/"]);
});

test("a streamed body arrives as it is written", async () => {
  const response = await fetch(`${base}/api/nested/stream`);
  const reader = response.body?.getReader();
  assert.ok(reader);
  assert.equal(new TextDecoder().decode((await reader.read()).value), "first");
  release();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "second");
});

test("disconnecting before a handler finishes cancels its response without a dev error", async () => {
  const entered = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let cancelled = false;
  const local = createServer((request, response) => {
    response.once("close", () => disconnected.resolve());
    void answerApiRequest(request, response, apiDir, async () => ({ GET: async () => {
      entered.resolve();
      await disconnected.promise;
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    } })).then(finished.resolve, finished.reject);
  });
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  try {
    const request = get(`http://127.0.0.1:${(local.address() as AddressInfo).port}/api/echo`);
    request.on("error", () => undefined);
    await entered.promise;
    request.destroy();
    await finished.promise;
    assert.equal(cancelled, true);
  } finally { local.closeAllConnections(); local.close(); }
});

test("disconnecting during a stream cancels the source without a dev error", async () => {
  const finished = Promise.withResolvers<void>();
  let cancelled = false;
  const local = createServer((request, response) => {
    void answerApiRequest(request, response, apiDir, async () => ({ GET: () =>
      new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode("ready")); },
        cancel() { cancelled = true; },
      })),
    })).then(finished.resolve, finished.reject);
  });
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  try {
    const abort = new AbortController();
    const response = await fetch(`http://127.0.0.1:${(local.address() as AddressInfo).port}/api/echo`, { signal: abort.signal });
    await response.body!.getReader().read();
    abort.abort();
    await finished.promise;
    assert.equal(cancelled, true);
  } finally { local.closeAllConnections(); local.close(); }
});

test("a failing response source still reaches the dev error handler", async () => {
  const failure = new Error("source_failed");
  const observed = Promise.withResolvers<unknown>();
  const local = createServer((request, response) => {
    void answerApiRequest(request, response, apiDir, async () => ({ GET: () =>
      new Response(new ReadableStream({ start(controller) { controller.error(failure); } })),
    })).then(() => observed.resolve(null), observed.resolve);
  });
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  try {
    const request = get(`http://127.0.0.1:${(local.address() as AddressInfo).port}/api/echo`);
    request.on("error", () => undefined);
    assert.equal(await observed.promise, failure);
  } finally { local.closeAllConnections(); local.close(); }
});
