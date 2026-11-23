import assert from "node:assert/strict";
import { test } from "node:test";
import { lazyPage } from "../src/lazy-page.ts";

const Page = () => null;

test("a page is not ready until its code has arrived, and is fetched once however often it is asked for", async () => {
  let loads = 0;
  const page = lazyPage(async () => {
    loads += 1;
    return Page;
  });
  assert.equal(page.ready(), false);
  await Promise.all([page.preload(), page.preload()]);
  await page.preload();
  assert.equal(page.ready(), true);
  assert.equal(loads, 1);
});

test("a fetch that fails leaves the page not ready and is tried again by the next call", async () => {
  let loads = 0;
  const page = lazyPage(async () => {
    loads += 1;
    if (loads === 1) throw new Error("offline");
    return Page;
  });
  await assert.rejects(page.preload(), /offline/u);
  assert.equal(page.ready(), false);
  await page.preload();
  assert.equal(page.ready(), true);
  assert.equal(loads, 2);
});
