import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./health.ts";

/** Runs with VERCEL_GIT_COMMIT_SHA set or unset, as Vercel's builds and local runs differ. */
function withCommit<T>(sha: string | undefined, run: () => T): T {
  const saved = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = sha;
  try {
    return run();
  } finally {
    if (saved === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = saved;
  }
}

test("health answers ok as uncached JSON", async () => {
  const response = withCommit(undefined, GET);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok", service: "weave-api", commit: "local" });
});

test("health names the deployed commit without exposing anything else", async () => {
  assert.deepEqual(await withCommit("0123456789abcdef", GET).json(), { status: "ok", service: "weave-api", commit: "0123456" });
});
