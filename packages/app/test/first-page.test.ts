import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { PublicProjectPage } from "@weave/api/public-projects-contract";
import { LIST_FIRST_PAGE_ID } from "@weave/api/list-first-view";
import { firstPage, firstPageFile, firstPageScript } from "../dev/first-page.ts";
import {
  FIRST_PAGE_GLOBAL, INDEX_OFF_KEY, keepServedFirstPage, publicProjectsPath, requestPublicProjects, takeFirstPage, takeReadFirstPage,
} from "../src/partners/public-projects.ts";

const uri = (n: number) => `at://did:plc:${"a".repeat(23)}${String.fromCharCode(97 + n)}/org.hypercerts.collection/project${n}`;
const page = (n: number): PublicProjectPage => ({
  index: { status: "bounded", checkedAt: "2026-11-15T04:01:00.000000Z", total: n },
  projects: Array.from({ length: n }, (_, i) => ({
    uri: uri(i), name: `Watershed circle ${i}`, passages: ["We restore wetlands along the river."],
    sharedAt: "2026-10-02T12:00:00.000000Z", checkedAt: "2026-11-15T04:01:00.000000Z",
    sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(uri(i))}`,
  })),
  next: null,
});

/** Runs the first-page script as a browser would, at one address with one storage. */
function load(pathname: string, { search = "", stored = null as string | null, storageFails = false, served = false } = {}) {
  const asked: { path: string; init: RequestInit }[] = [];
  const window: Record<string, unknown> = {};
  runInNewContext(firstPageScript(), {
    window,
    document: { getElementById: (id: string) => (served && id === LIST_FIRST_PAGE_ID ? {} : null) },
    location: { pathname, search },
    localStorage: { getItem: (key: string) => {
      if (storageFails) throw new Error("refused");
      return key === INDEX_OFF_KEY ? stored : null;
    } },
    fetch: (path: string, init: RequestInit) => {
      asked.push({ path, init });
      return Promise.resolve(Response.json(page(1)));
    },
  });
  return { asked, early: window[FIRST_PAGE_GLOBAL] as { path: string; response: Promise<Response>; page?: unknown } | undefined };
}

test("the Initiatives page's HTML asks for the list's own first page, the list's own way", () => {
  const { asked, early } = load("/initiatives");
  assert.equal(asked.length, 1);
  assert.equal(asked[0]?.path, publicProjectsPath(""), "the page the list asks for with no search, filter or order");
  // Read back as plain data: the script's objects come from its own realm.
  assert.deepEqual(JSON.parse(JSON.stringify(asked[0]?.init)), { headers: { accept: "application/json" }, credentials: "omit" },
    "nothing of the browser's");
  assert.equal(early?.path, publicProjectsPath(""));
  assert.equal(load("/initiatives/").asked.length, 1, "a trailing slash is the same page");
  assert.equal(load("/initiatives", { storageFails: true }).asked.length, 1, "storage refused: the list is asked for, as the app would");
});

test("the HTML reads the page as soon as it arrives, and leaves a refused one unread", async () => {
  const { early } = load("/initiatives");
  await early?.response;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(JSON.parse(JSON.stringify(early?.page)).projects.length, 1, "read, ready for the list's first drawing");
  // The list can still read the answer itself: the HTML read a copy.
  assert.equal((await (await early!.response).json()).projects.length, 1);
  const refused: Record<string, unknown> = {};
  runInNewContext(firstPageScript(), {
    window: refused, document: { getElementById: () => null }, location: { pathname: "/initiatives", search: "" }, localStorage: { getItem: () => null },
    fetch: () => Promise.resolve(Response.json({ error: "public_projects_unavailable" }, { status: 503 })),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((refused[FIRST_PAGE_GLOBAL] as { page?: unknown }).page, undefined, "a refusal is the list's to handle");
});

test("the list starts with a page the HTML has read, once, and only the page it wants", () => {
  const response = Promise.resolve(Response.json(page(1)));
  const holder: Record<string, unknown> = { [FIRST_PAGE_GLOBAL]: { path: "/api/public-projects", response } };
  assert.equal(takeReadFirstPage("/api/public-projects", holder), undefined, "not read yet");
  assert.ok(FIRST_PAGE_GLOBAL in holder, "so the answer under way stays for the list to take");
  (holder[FIRST_PAGE_GLOBAL] as { page?: unknown }).page = page(2);
  assert.equal(takeReadFirstPage("/api/public-projects?q=river", holder), undefined, "another page is not this one");
  assert.equal(takeReadFirstPage("/api/public-projects", holder)?.projects.length, 2);
  assert.equal(FIRST_PAGE_GLOBAL in holder, false, "taken once");
  holder[FIRST_PAGE_GLOBAL] = { path: "/api/public-projects", response, page: { projects: "not a page" } };
  assert.equal(takeReadFirstPage("/api/public-projects", holder), undefined, "a page that does not read as one is never drawn");
});

test("the HTML leaves every other first page to the app", () => {
  for (const search of ["?q=river", "?organizationType=ngo", "?sort=name"])
    assert.equal(load("/initiatives", { search }).asked.length, 0, `${search} is the app's to ask for`);
  assert.equal(load("/initiatives", { stored: "1" }).asked.length, 0, "a list last heard off shows the starter list");
  assert.equal(load("/initiatives", { served: true }).asked.length, 0, "a page the server sent with its cards asks for none");
  assert.equal(load("/funding").asked.length, 0);
  assert.equal(load("/initiatives/at%3A%2F%2Fx").asked.length, 0, "an initiative's own page is not the list");
});

test("a build writes the script under assets by its content, and every page's HTML loads it without waiting", () => {
  const file = firstPageFile();
  assert.match(file, /^assets\/first-page-[0-9a-f]{8}\.js$/u, "cached until its content changes");
  assert.notEqual(firstPageFile(`${firstPageScript()} `), file);
  const emitted: { fileName?: string; source?: string }[] = [];
  const plugin = firstPage();
  (plugin.configResolved as (config: { base: string }) => void)({ base: "/" });
  (plugin.buildStart as (this: unknown) => void).call({ emitFile: (asset: { fileName?: string; source?: string }) => { emitted.push(asset); return "ref"; } });
  assert.deepEqual(emitted, [{ type: "asset", fileName: file, source: firstPageScript() }]);
  // index.html is the file every page's HTML is copied from, so Initiatives has the tag however its file is made.
  const tags = (plugin.transformIndexHtml as () => unknown)();
  assert.deepEqual(tags, [{ tag: "script", attrs: { src: `/${file}`, async: true, fetchpriority: "high" }, injectTo: "head" }]);
  assert.equal(plugin.apply, "build", "the dev server has no first-page script; the list asks for itself");
});

test("the list takes the HTML's first page once, and only the page it wants", () => {
  const response = Promise.resolve(Response.json(page(1)));
  const holder: Record<string, unknown> = { [FIRST_PAGE_GLOBAL]: { path: "/api/public-projects", response } };
  assert.equal(takeFirstPage("/api/public-projects?q=river", holder), undefined, "another page is asked for afresh");
  assert.equal(FIRST_PAGE_GLOBAL in holder, false, "and the head start is let go, never kept for later");
  holder[FIRST_PAGE_GLOBAL] = { path: "/api/public-projects", response };
  assert.equal(takeFirstPage("/api/public-projects", holder), response);
  assert.equal(takeFirstPage("/api/public-projects", holder), undefined, "a second list asks for itself");
  assert.equal(takeFirstPage("/api/public-projects", {}), undefined);
  assert.equal(takeFirstPage("/api/public-projects", { [FIRST_PAGE_GLOBAL]: "not a head start" }), undefined);
});

test("a head start that answers is the list's first page; one that fails costs nothing", async () => {
  const signal = new AbortController().signal;
  let asked = 0;
  const request = async () => { asked += 1; return Response.json(page(2)); };
  const used = await requestPublicProjects("/api/public-projects", signal, request, Promise.resolve(Response.json(page(1))));
  assert.equal(used.projects.length, 1, "the HTML's answer");
  assert.equal(asked, 0, "and no second request");
  const refused = await requestPublicProjects("/api/public-projects", signal, request,
    Promise.resolve(Response.json({ error: "public_projects_unavailable" }, { status: 503 })));
  assert.equal(refused.projects.length, 2, "a refused head start is asked for again");
  const failed = await requestPublicProjects("/api/public-projects", signal, request, Promise.reject(new TypeError("offline")));
  assert.equal(failed.projects.length, 2, "so is one that never reached the list");
  assert.equal(asked, 2);
  // A list that is left while the head start is still on its way gives up at once, and asks for nothing.
  const leaving = new AbortController();
  const pending = requestPublicProjects("/api/public-projects", leaving.signal, request, new Promise<Response>(() => {}));
  leaving.abort();
  await assert.rejects(pending);
  assert.equal(asked, 2);
});

test("a page the server sent with its first cards is the list's first page, read before the app draws", () => {
  const served = (text: string | null) => ({ getElementById: (id: string) => (id === LIST_FIRST_PAGE_ID ? { textContent: text } : null) });
  const holder: Record<string, unknown> = {};
  keepServedFirstPage(served(JSON.stringify({ path: "/api/public-projects", page: page(3) })), holder);
  assert.equal(takeReadFirstPage(publicProjectsPath(""), holder)?.projects.length, 3, "the list starts with the server's cards");
  assert.equal(FIRST_PAGE_GLOBAL in holder, false, "and takes them once");
  // Anything that is not the list's own first page, valid as the list reads one, is left alone.
  for (const text of [null, "", "not json", JSON.stringify({ path: "/api/public-projects?q=x", page: page(1) }),
    JSON.stringify({ path: "/api/public-projects", page: { projects: "no" } }), JSON.stringify(null)]) {
    const empty: Record<string, unknown> = {};
    keepServedFirstPage(served(text), empty);
    assert.equal(FIRST_PAGE_GLOBAL in empty, false, String(text));
  }
  const none: Record<string, unknown> = {};
  keepServedFirstPage({ getElementById: () => null }, none);
  assert.equal(FIRST_PAGE_GLOBAL in none, false);
});
