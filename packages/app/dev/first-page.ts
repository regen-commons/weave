import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { LIST_FIRST_PAGE_ID } from "@weave/api/list-first-view";
import {
  FIRST_PAGE_GLOBAL, INDEX_OFF_KEY, PUBLIC_PROJECTS_REQUEST, publicProjectsPath,
} from "../src/partners/public-projects.ts";
import { pathTo } from "../src/routes.ts";

/**
 * The Initiatives page's largest paint is a project card, and the app asks for the cards only once its
 * own files have loaded and the list has drawn: three waits in a row. The page's own HTML starts that
 * request instead, alongside the app's files, and the list takes the answer when it is ready
 * (`takeFirstPage`), so the cards come with the first drawing. It asks for what the list would ask for
 * on its own: the first page of every project, newest first, as JSON and with nothing of the browser's.
 * An address with a search, a filter or an order, or a browser that last heard the list is off (it then
 * shows the starter list), is left to the app.
 *
 * The script is a file of the site's own, since the security policy runs no inline script, and its
 * words come from the list's own constants here, so the two cannot ask for different pages.
 */
export function firstPageScript(): string {
  const path = publicProjectsPath("");
  const page = JSON.stringify(pathTo("initiatives"));
  return `"use strict";
// Starts the Initiatives page's first request as the page arrives (packages/app/dev/first-page.ts).
(() => {
  // Every other page leaves at once, before it touches the document or the device's storage.
  if (location.search || location.pathname.replace(/\\/+$/, "") !== ${page}) return;
  // A page the server sent with its first page already drawn carries it in its head; nothing to ask for.
  if (document.getElementById(${JSON.stringify(LIST_FIRST_PAGE_ID)})) return;
  let off = false;
  try { off = localStorage.getItem(${JSON.stringify(INDEX_OFF_KEY)}) === "1"; } catch { /* The list is asked for. */ }
  if (off) return;
  const response = fetch(${JSON.stringify(path)}, ${JSON.stringify(PUBLIC_PROJECTS_REQUEST)});
  const early = { path: ${JSON.stringify(path)}, response };
  // Read as soon as it arrives, so a list that draws after it starts with its cards. A failure here is
  // the list's to handle when it takes the answer, so it is not reported twice.
  response.then((answer) => (answer.ok ? answer.clone().json() : undefined)).then((page) => { early.page = page; }, () => {});
  window[${JSON.stringify(FIRST_PAGE_GLOBAL)}] = early;
})();
`;
}

/** Where a build writes the script: under assets, named by its content, so it is cached until it changes. */
export function firstPageFile(source = firstPageScript()): string {
  return `assets/first-page-${createHash("sha256").update(source).digest("hex").slice(0, 8)}.js`;
}

/**
 * In a build, writes the script and loads it from the head of index.html, without holding up the page.
 * Every page's HTML is a copy of that file (dev/link-previews.ts, and the prerender), so the tag reaches
 * Initiatives however its file is made; on any other page the script asks for nothing.
 */
export function firstPage(): Plugin {
  const source = firstPageScript();
  const fileName = firstPageFile(source);
  let base = "/";
  return {
    name: "weave-first-page",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    buildStart() {
      this.emitFile({ type: "asset", fileName, source });
    },
    // High priority, so the request it starts goes out with the app's own files, not after them.
    transformIndexHtml: () => [{ tag: "script", attrs: { src: base + fileName, async: true, fetchpriority: "high" }, injectTo: "head" }],
  };
}
