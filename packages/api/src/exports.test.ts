// Vercel compiles the TypeScript it deploys and ships it as .js, so an export that
// points at a .ts file fails to load once deployed. Each handler is exported three
// ways: types and the "source" condition read src/ for type checks, tests and the dev
// server, and the default target is the compiled file the deployed function imports.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const PACKAGE = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", PACKAGE), "utf8")) as { exports: Record<string, Record<string, string>> };

for (const [subpath, targets] of Object.entries(manifest.exports)) {
  test(`${subpath} exports its source to tools and its compiled file to deployments`, () => {
    const name = subpath.replace(/^\.\//, "");
    // Conditions match in order, so types and source come before the default.
    assert.deepEqual(Object.entries(targets), [
      ["types", `./src/${name}.ts`],
      ["source", `./src/${name}.ts`],
      ["default", `./dist/${name}.js`],
    ]);
    assert.ok(existsSync(new URL(`src/${name}.ts`, PACKAGE)), `src/${name}.ts is missing`);
  });
}
