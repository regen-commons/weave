import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { httpsIngress } from "./certified/https-ingress.ts";
import { createVercelBridge } from "./certified-vercel.ts";

const host = "weave-auth-preview.example.test";
function request(headers: IncomingMessage["headers"], hostValues = [host]) {
  return { headers, headersDistinct: { host: hostValues } } as unknown as IncomingMessage;
}

function response() {
  let status = 0;
  const res = {
    writeHead(code: number) { status = code; return this; },
    end() {},
  } as unknown as ServerResponse;
  return { res, status: () => status };
}

test("Render ingress rejects other hosts and supplies only trusted forwarding information", () => {
  const forwarded: IncomingMessage["headers"][] = [];
  const ingress = httpsIngress(`https://${host}`, req => { forwarded.push(req.headers); }, false);
  for (const req of [request({ host: "attacker.example.test" }), request({ host }, [host, host])]) {
    const result = response();
    ingress(req, result.res);
    assert.equal(result.status(), 421);
  }
  assert.equal(forwarded.length, 0);
  ingress(request({ host, forwarded: "host=attacker.example.test", "x-real-ip": "192.0.2.1",
    "x-forwarded-host": "attacker.example.test", "x-forwarded-proto": "http", "x-forwarded-for": "192.0.2.1",
    "x-forwarded-port": "80", cookie: "state=fixture" }), response().res);
  assert.deepEqual(forwarded, [{ host, "x-forwarded-proto": "https", cookie: "state=fixture" }]);
});

test("Render ingress bounds requests before they reach the bridge", () => {
  let accepted = 0;
  const ingress = httpsIngress(`https://${host}`, () => { accepted++; }, false);
  for (let i = 0; i < 600; i++) ingress(request({ host }), response().res);
  const excess = response();
  ingress(request({ host }), excess.res);
  assert.equal(accepted, 600);
  assert.equal(excess.status(), 429);
});

test("Vercel requests require the configured hostname and HTTPS, and missing secrets fail closed", async () => {
  const handle = createVercelBridge({ VERCEL: "1", WEAVE_AUTH_ISSUER: `https://${host}` });
  for (const headers of [{ host }, { host, "x-forwarded-proto": "http" }, {
    host: "another-deployment.example.test", "x-forwarded-proto": "https",
  }]) {
    const denied = response();
    await handle(request(headers), denied.res);
    assert.equal(denied.status(), 421);
  }
  const valid = response();
  await handle(request({ host, "x-forwarded-proto": "https" }), valid.res);
  assert.equal(valid.status(), 503);
});
