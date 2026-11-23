import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUILT_FILES, builtFile, builtSource } from "./built-files.ts";
import { RECORD_PREVIEWS_FILE, TEMPLATE_FILES } from "./record-page-http.ts";

test("the functions read the app's build from fixed addresses the deployment's file tracer can follow", () => {
  // From packages/api/src here and packages/api/dist when deployed, the app's build is two folders up.
  assert.deepEqual(Object.fromEntries(Object.entries(BUILT_FILES).map(([file, url]) => [file, fileURLToPath(url).split("/packages/")[1]])), {
    "shell.html": "app/dist/shell.html",
    "index.html": "app/dist/index.html",
    [RECORD_PREVIEWS_FILE]: "app/dist/share/records.json",
  });
  // A path built while running makes the tracer take the whole repository (#171), so none may be.
  for (const file of ["./built-files.ts", "./record-page.ts", "./sitemap.ts"]) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8").replace(/^\s*(\/\/|\*).*$/gmu, "");
    assert.doesNotMatch(code, /process\.cwd\(\)|\bjoin\(/u, file);
  }
});

test("a record's page is made from the empty shell where the build has one, and the app's page until then", async () => {
  const request = new Request("https://weave.example/api/record-page");
  const bundle = (files: Record<string, string>) => async (address: URL) => {
    const name = Object.entries(BUILT_FILES).find(([, url]) => url.href === address.href)?.[0];
    if (name === undefined || !(name in files)) throw Error("ENOENT");
    return files[name]!;
  };
  assert.equal(await builtFile(TEMPLATE_FILES, request, bundle({ "index.html": "index" })), "index", "no shell yet");
  assert.equal(builtSource(), "bundle");
  assert.equal(await builtFile(TEMPLATE_FILES, request, bundle({ "index.html": "index", "shell.html": "shell" })), "shell");
  assert.equal(await builtFile(RECORD_PREVIEWS_FILE, request, bundle({ [RECORD_PREVIEWS_FILE]: "{}" })), "{}");
});
