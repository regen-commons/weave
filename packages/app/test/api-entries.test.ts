// Vercel deploys api/*.ts from this package. Each entry must be one re-export of a
// handler in @weave/api and must load. Tests read the handler's source through the
// "source" condition; the deployed function loads its compiled file from dist/.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const API = new URL("../api/", import.meta.url);
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const entries = readdirSync(API).filter((name) => name.endsWith(".ts"));

// Vercel's Hobby plan deploys at most 12 functions, so endpoints that need no address of their own share
// api/router.ts (23 November 2026). Each keeps its address: vercel.json rewrites it to the router.
test("the app deploys at most 12 functions, and each shared endpoint's address reaches the router", async () => {
  assert.ok(entries.length <= 12, `${entries.length} functions`);
  assert.ok(entries.includes("router.ts"));
  const { ENDPOINTS } = await import("@weave/api/router");
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    functions: Record<string, { maxDuration?: number }>; rewrites: { source: string; destination: string }[];
  };
  const sources = vercel.rewrites.map(({ source }) => source);
  // Cloud speech can take 50 s (a 20 s upload and 30 s at the provider), so the shared function has 60.
  assert.ok((vercel.functions["api/router.ts"]?.maxDuration ?? 0) >= 60);
  for (const endpoint of Object.keys(ENDPOINTS)) {
    assert.ok(!entries.includes(`${endpoint}.ts`), `a function of its own would take ${endpoint}'s address from the router`);
    const index = sources.indexOf(`/api/${endpoint}`);
    assert.equal(vercel.rewrites[index]?.destination, `/api/router?__route=${endpoint}`, endpoint);
  }
});

for (const entry of entries) {
  test(`api/${entry} only re-exports a handler from @weave/api`, async () => {
    const code = readFileSync(new URL(entry, API), "utf8").replace(/^\s*\/\/.*$/gm, "").trim();
    assert.match(code, /^export \{ [A-Z, ]+ \} from "@weave\/api\/[\w-]+";$/);
    const module: Record<string, unknown> = await import(new URL(entry, API).href);
    const exported = Object.keys(module);
    assert.ok(exported.length > 0 && exported.every((name) => METHODS.includes(name) && typeof module[name] === "function"), exported.join(", "));
  });
}

test("the health check answers through the router as it did on its own", async () => {
  const { GET } = await import(new URL("router.ts", API).href);
  const response: Response = await GET(new Request("https://weave.example/api/router?__route=health"));
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { status: string }).status, "ok");
});
