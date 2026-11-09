// Vercel deploys api/*.ts from this package. Each entry must be one re-export of a
// handler in @weave/api and must load. Tests read the handler's source through the
// "source" condition; the deployed function loads its compiled file from dist/.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const API = new URL("../api/", import.meta.url);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const entries = readdirSync(API).filter((name) => name.endsWith(".ts"));

test("the app deploys the health check", () => {
  assert.ok(entries.includes("health.ts"));
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

test("the health entry answers like the handler", async () => {
  const { GET } = await import(new URL("health.ts", API).href);
  const response: Response = GET();
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { status: string }).status, "ok");
});
