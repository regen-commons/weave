// Zod probes `Function("")` for its JIT unless `z.config({ jitless: true })` has run first. The
// production CSP (`script-src 'self'`) blocks that probe and Chrome logs a CSP issue, which costs
// Lighthouse best practices. src/validation.ts sets jitless, so a module that uses Zod at run time
// imports `z` from there; `import type` from "zod" is fine (24 November 2026).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

// The source rule is not enough: package.json's "sideEffects" told the bundler that modules have none,
// so it dropped validation.ts's z.config call and Zod's probe still ran in production (24 November 2026).
// The built bundle must keep the call.
const assets = fileURLToPath(new URL("../dist/assets/", import.meta.url));
test("the production bundle keeps validation.ts's jitless setting", (context) => {
  if (!existsSync(assets)) {
    context.skip("Build @weave/app first; CI builds before running this check.");
    return;
  }
  const bundle = readdirSync(assets)
    .filter((path) => path.endsWith(".js"))
    .map((path) => readFileSync(`${assets}/${path}`, "utf8"))
    .join("\n");
  assert.match(bundle, /jitless\s*:\s*(?:!0|true)/, "z.config({ jitless: true }) is missing from dist/assets");
});
