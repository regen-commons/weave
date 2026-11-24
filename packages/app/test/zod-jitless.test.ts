// Zod probes `Function("")` for its JIT unless `z.config({ jitless: true })` has run first. The
// production CSP (`script-src 'self'`) blocks that probe and Chrome logs a CSP issue, which costs
// Lighthouse best practices. src/validation.ts sets jitless, so a module that uses Zod at run time
// imports `z` from there; `import type` from "zod" is fine (24 November 2026).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SRC = new URL("../src/", import.meta.url);

function sources(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(new URL(`${entry.name}/`, dir))
      : /\.(ts|tsx)$/.test(entry.name) ? [new URL(entry.name, dir)] : [],
  );
}

test("only src/validation.ts imports Zod's run-time value, so jitless is set before any parse", () => {
  const offenders = sources(SRC)
    .filter((file) => !file.pathname.endsWith("/src/validation.ts"))
    .filter((file) => /^\s*import\s+(?!type\b)[^;]*\bfrom\s+["']zod(?:\/[^"']*)?["']/m.test(readFileSync(file, "utf8")))
    .map((file) => file.pathname.slice(SRC.pathname.length));
  assert.deepEqual(offenders, [], `import { z } from "../validation.ts" instead in: ${offenders.join(", ")}`);
});
