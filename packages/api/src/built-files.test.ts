import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUILT_FILES, builtFile, builtSource } from "./built-files.ts";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { RECORD_PREVIEWS_FILE, TEMPLATE_FILES } from "./record-page-http.ts";

test("the functions read the app's build from fixed addresses the deployment's file tracer can follow", () => {
  // From packages/api/src here and packages/api/dist when deployed, the app's build is two folders up.
  assert.deepEqual(Object.fromEntries(Object.entries(BUILT_FILES).map(([file, url]) => [file, fileURLToPath(url).split("/packages/")[1]])), {
    "shell.html": "app/dist/shell.html",
    "index.html": "app/dist/index.html",
    [RECORD_PREVIEWS_FILE]: "app/dist/share/records.json",
    "share/initiatives.html": "app/dist/share/initiatives.html",
  });
  // A path built while running makes the tracer take the whole repository (#171), so none may be.
  for (const file of ["./built-files.ts", "./record-page.ts", "./sitemap.ts", "./initiatives-page.ts"]) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8").replace(/^\s*(\/\/|\*).*$/gmu, "");
    assert.doesNotMatch(code, /process\.cwd\(\)|\bjoin\(/u, file);
  }
});

const bundle = (files: Record<string, string>) => async (address: URL) => {
  const name = Object.entries(BUILT_FILES).find(([, url]) => url.href === address.href)?.[0];
  if (name === undefined || !(name in files)) throw Error("ENOENT");
  return files[name]!;
};

test("a record's page is made from the empty shell where the build has one, and the app's page until then", async () => {
  assert.equal(await builtFile(TEMPLATE_FILES, { read: bundle({ "index.html": "index" }) }), "index", "no shell yet");
  assert.equal(builtSource(), "bundle");
  assert.equal(await builtFile(TEMPLATE_FILES, { read: bundle({ "index.html": "index", "shell.html": "shell" }) }), "shell");
  assert.equal(await builtFile(RECORD_PREVIEWS_FILE, { read: bundle({ [RECORD_PREVIEWS_FILE]: "{}" }) }), "{}");
});

test("a file the bundle lacks is read from Weave's public site, whatever address the request came to", async () => {
  const asked: string[] = [];
  const get = (async (input: string | URL | Request) => { asked.push(String(input)); return new Response("site copy"); }) as typeof fetch;
  // No request is passed at all: a forged Host on the request that reached the function cannot choose the copy.
  assert.equal(await builtFile(TEMPLATE_FILES, { read: bundle({}), get }), "site copy");
  assert.deepEqual(asked, [`${PUBLIC_ORIGIN}/shell.html`], "the first file only, from the public origin");
  assert.equal(builtSource(), "site");
  const refused = (async () => new Response("", { status: 404 })) as typeof fetch;
  await assert.rejects(builtFile(RECORD_PREVIEWS_FILE, { read: bundle({}), get: refused }), /built_file_unavailable/u);
  // The functions that read these take no request for them, so none can pass one in.
  for (const file of ["./record-page.ts", "./initiatives-page.ts", "./built-files.ts"]) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(code, /builtFile\([^)]*request/u, file);
  }
});
