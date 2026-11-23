// A record's first view: its heading and summary drawn into the app's empty root, so a page opened from a
// link has the record's words before the app's script has arrived (23 November 2026). It holds the place
// of the app's bars and sits where the app's own heading will, with the design system's classes, and it
// carries the same words as JSON. The app reads them before its first draw (src/record-first-view.ts in
// @weave/app), shows them under the same heading while the record loads, and its first draw replaces this
// view (src/first-view.ts), so the heading neither flashes nor reads twice.
import { escapeHtml, previewLine, scriptJson } from "./page-preview.ts";

/** The words the view shows, which the JSON beside it carries for the app. */
export interface RecordFirstViewWords {
  /** The page's path, such as /funding/some-fund. */
  readonly path: string;
  /** The program the address asked for, on a fund's page; null where it asked for none. */
  readonly program: string | null;
  readonly title: string;
  /** The record's own words, empty where it has none. */
  readonly summary: string;
}

/** The breadcrumbs the app draws above a record's heading on a wide screen, as the build writes them. */
export interface RecordCrumbs {
  readonly trail: readonly { readonly label: string; readonly href: string }[];
  readonly current: string;
}

export interface RecordFirstView extends RecordFirstViewWords {
  /** The section the record belongs to, which sets the page's accent. */
  readonly section: "funding" | "initiatives";
  readonly crumbs: RecordCrumbs;
}

/** The id of the JSON beside the view, which the app reads. */
export const RECORD_FIRST_VIEW_ID = "record-first-view";

/** A record page's path: a fund's or an initiative's. */
export const RECORD_FIRST_VIEW_PATH = /^\/(?:funding|initiatives)\/[A-Za-z0-9_-]{1,200}$/u;

/**
 * The unseen words that hold the room of the line a loaded record shows between its heading and its
 * summary: who shares it, or which fund it is and how to apply. The view and the app's loading state
 * hold it the same way, so the summary sits where the loaded record puts it.
 */
export const RECORD_META_HOLD = "Who it is from, and how to reach it";

/** The longest heading and summary drawn; the app refuses longer ones. */
export const FIRST_VIEW_TITLE_MAX = 300;
export const FIRST_VIEW_SUMMARY_MAX = 4000;

const EMPTY_ROOT = '<div id="root"></div>';

/** The breadcrumbs as the app draws them, so a wide screen's heading sits under them from the start. */
function breadcrumbs({ trail, current }: RecordCrumbs): string {
  const items = trail.map(({ label, href }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join("");
  return `<nav class="rc-breadcrumbs" aria-label="Breadcrumb" data-from="wide"><ol>${items}<li aria-current="page">${escapeHtml(current)}</li></ol></nav>`;
}

/**
 * The view's markup: the bars' room, then the breadcrumbs and the record's heading and summary in the
 * page's column. The breadcrumbs are links that work before the app does.
 */
export function recordFirstViewHtml(view: RecordFirstView): string {
  const title = previewLine(view.title, FIRST_VIEW_TITLE_MAX),
    summary = view.summary.trim() ? previewLine(view.summary, FIRST_VIEW_SUMMARY_MAX) : "";
  const words: RecordFirstViewWords = { path: view.path, program: view.program, title, summary };
  return (
    `<div class="rc-page" data-section="${view.section}">` +
    // The banner and the app bar, empty at their heights: no landmark, nothing to read or press.
    `<div class="rc-app-head"><div class="rc-site-banner"></div><div class="rc-app-header"></div></div>` +
    `<div class="rc-page-body"><main class="rc-main">${view.crumbs.trail.length ? breadcrumbs(view.crumbs) : ""}<div class="rc-narrow">` +
    `<h1 class="rc-heading" data-size="page">${escapeHtml(title)}</h1>` +
    `<p class="rc-card-meta" aria-hidden="true"><span class="rc-skeleton" data-shape="hold">${RECORD_META_HOLD}</span></p>` +
    (summary ? `<p class="rc-prose">${escapeHtml(summary)}</p>` : "") +
    `</div></main></div></div>` +
    `<script type="application/json" id="${RECORD_FIRST_VIEW_ID}">${scriptJson(words)}</script>`
  );
}

/**
 * The page with the record's first view in its root, marked with the path it was drawn for. A page whose
 * root is not the one empty root the app's shell has, such as one carrying Home's first view, goes as it
 * came, and so does a view for a path no record has.
 */
export function withRecordFirstView(html: string, view: RecordFirstView): string {
  if (!RECORD_FIRST_VIEW_PATH.test(view.path) || !view.title.trim() || html.split(EMPTY_ROOT).length !== 2) return html;
  return html.replace(EMPTY_ROOT, () => `<div id="root" data-first-view="${escapeHtml(view.path)}">${recordFirstViewHtml(view)}</div>`);
}
