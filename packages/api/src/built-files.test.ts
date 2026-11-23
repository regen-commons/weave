import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { builtFile, builtSource } from "./built-files.ts";
import { TEMPLATE_FILES } from "./record-page-http.ts";

test("a record's page is made from the empty shell where the build has one, from its bundle in either layout", async () => {
  const root = mkdtempSync(join(tmpdir(), "weave-built-files-"));
  const home = process.cwd();
  const request = new Request("https://weave.example/api/record-page");
  try {
    process.chdir(root);
    // The bundle keeps the repository's layout: the build is under packages/app/dist.
    mkdirSync(join(root, "packages/app/dist"), { recursive: true });
    writeFileSync(join(root, "packages/app/dist/index.html"), "index");
    assert.equal(await builtFile(TEMPLATE_FILES, request), "index", "no shell yet: the app's page");
    assert.equal(builtSource(), "bundle");
    writeFileSync(join(root, "packages/app/dist/shell.html"), "shell");
    assert.equal(await builtFile(TEMPLATE_FILES, request), "shell", "the shell, once the build writes one");
    // The function runs from the app's folder: the build is under dist.
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist/index.html"), "app index");
    assert.equal(await builtFile(TEMPLATE_FILES, request), "shell", "the shell wins in whichever layout it is");
  } finally {
    process.chdir(home);
    rmSync(root, { recursive: true, force: true });
  }
});
