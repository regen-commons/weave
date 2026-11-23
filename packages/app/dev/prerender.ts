/**
 * Sends each page's first view as HTML (Q-06). The app draws every page in the browser, so a first
 * visit painted nothing until its script had arrived and run: on a slow phone that held the largest
 * paint to 3 or 4 seconds even on a page with nothing to fetch. The build now draws each address's
 * first view, as a visitor with nothing stored sees it, and writes it into the HTML that address is
 * sent as. The app replaces it with its own drawing of the same page (src/main.tsx); it does not
 * hydrate it, so drafts, accounts and everything kept on the device stay in the browser.
 *
 * The view is inert until the app replaces it, so nothing typed into a field drawn at build time is
 * lost. If the app's code never arrives, public/theme-boot.js lifts that after eight seconds so its
 * links work as plain links, and the page offers a reload. index.html carries Home's view and is also sent for addresses with no file of their own; the
 * page shows that view only at Home (public/theme-boot.js and the design system's base.css).
 */
import type { Plugin } from "vite";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ROUTES } from "../src/routes.ts";

/** An address drawn at build time, and the file the server sends it as. */
export interface FirstView {
  readonly path: string;
  readonly file: string;
}

/** Every address with a page of its own and no part that changes. Records and workspaces are not drawn. */
export const FIRST_VIEWS: readonly FirstView[] = ROUTES.filter((route) => !route.path.includes(":")).map(({ path }) => ({
  path,
  file: path === "/" ? "index.html" : `${path.slice(1)}/index.html`,
}));

const EMPTY_ROOT = '<div id="root"></div>';

/** The app's page with nothing drawn in it, beside index.html. */
export const SHELL_FILE = "shell.html";

/** The page with its first view in the app's root, marked with the address it was drawn for. */
export function withFirstView(html: string, path: string, view: string): string {
  if (html.split(EMPTY_ROOT).length !== 2) throw new Error(`The page for ${path} must have exactly one empty ${EMPTY_ROOT}.`);
  if (!view.trim()) throw new Error(`The first view of ${path} came out empty.`);
  return html.replace(EMPTY_ROOT, () => `<div id="root" data-first-view="${path}" inert>${view}</div>`);
}

/** The app's script and the modules it loads at once, as the build writes them into the head. */
const SCRIPT_TAGS = /[ \t]*(?:<script type="module"[^>]*><\/script>|<link rel="modulepreload"[^>]*>)[ \t]*\r?\n?/gu;

/**
 * Moves the app's script and its module preloads to the end of the head. The build writes them
 * first, so on a slow connection they queued ahead of the stylesheet, the font preloads and the
 * theme script that the first paint waits for, and the first view, which needs no script, painted
 * late. A module script runs once the page is parsed wherever it sits, so this changes only what
 * the browser asks for first.
 */
export function scriptsAfterFirstPaint(html: string): string {
  const head = html.indexOf("</head>");
  if (head === -1) throw new Error("The page has no head.");
  const scripts = html.slice(0, head).match(SCRIPT_TAGS) ?? [];
  if (scripts.length === 0) return html;
  const rest = html.slice(0, head).replace(SCRIPT_TAGS, "");
  return `${rest.trimEnd()}\n${scripts.map((tag) => `    ${tag.trim()}\n`).join("")}  ${html.slice(head)}`;
}

/** The line the drawing process writes its result on, so nothing else it prints is read as the result. */
export const RESULT_MARK = "@@weave-first-views@@";

/** Reads the drawing process's output: one view for each address asked for. */
export function readFirstViews(output: string, paths: readonly string[]): Record<string, string> {
  const line = output.split("\n").find((candidate) => candidate.startsWith(RESULT_MARK));
  if (!line) throw new Error("The first views were not drawn.");
  const views: unknown = JSON.parse(line.slice(RESULT_MARK.length));
  if (typeof views !== "object" || views === null) throw new Error("The first views are not a record.");
  const record = views as Record<string, unknown>;
  return Object.fromEntries(paths.map((path) => {
    const view = record[path];
    if (typeof view !== "string") throw new Error(`No first view was drawn for ${path}.`);
    return [path, view];
  }));
}

const RUNNER = fileURLToPath(new URL("./prerender-run.ts", import.meta.url));

/**
 * Draws the views in a process of its own: drawing needs stand-ins for the browser's globals, which
 * must not leak into the build, and the production build of React.
 */
async function drawFirstViews(root: string, paths: readonly string[]): Promise<Record<string, string>> {
  const { stdout } = await promisify(execFile)(process.execPath, ["--conditions=source", RUNNER, JSON.stringify(paths)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    maxBuffer: 64 * 1024 * 1024,
  });
  return readFirstViews(stdout, paths);
}

export function prerender(): Plugin {
  let root = process.cwd();
  return {
    name: "weave-prerender",
    apply: "build",
    // After the link previews, so a section's copy of index.html is here to draw into.
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    // After the build has written its tags, and before the link previews copy the page.
    transformIndexHtml: { order: "post", handler: scriptsAfterFirstPaint },
    async generateBundle(_options, bundle) {
      const home = bundle["index.html"];
      if (home?.type !== "asset" || typeof home.source !== "string") throw new Error("index.html was not built before the first views.");
      const shell = home.source;
      // The page with an empty root, for addresses whose page is drawn in the browser alone, such
      // as the record pages GET /api/record-page writes, so they never carry Home's first view.
      this.emitFile({ type: "asset", fileName: SHELL_FILE, source: shell });
      const views = await drawFirstViews(root, FIRST_VIEWS.map((view) => view.path));
      for (const { path, file } of FIRST_VIEWS) {
        const existing = bundle[file];
        if (existing?.type === "asset" && typeof existing.source === "string") existing.source = withFirstView(existing.source, path, views[path]!);
        else this.emitFile({ type: "asset", fileName: file, source: withFirstView(shell, path, views[path]!) });
      }
    },
  };
}
