// The Initiatives list's first page drawn into the page the server sends (23 November 2026), so the
// cards are on screen at first paint instead of after the app's script and the list's request. The
// build draws the page's first view with a skeleton where the cards go (dev/prerender.ts in
// @weave/app); GET /initiatives draws the first page of cards in its place, with the same markup the
// app's own cards have (src/partners/PublicProjects.tsx), and carries the same page as JSON in the head.
// The app reads that JSON before its first draw (src/partners/public-projects.ts), so its first draw has
// the same cards, it sends no request for them, and replacing this view moves nothing.
import { escapeHtml, scriptJson } from "./page-preview.ts";
import { projectSlug, type PublicProjectCard, type PublicProjectPage } from "./public-projects-contract.ts";

/** The address of the list, the one page this draws. */
export const LIST_FIRST_VIEW_PATH = "/initiatives";
/**
 * Where the build writes the list's page, for GET /initiatives to start from. Not at the list's address:
 * Vercel serves a file at an address before any rewrite, so a file there would never reach the route.
 */
export const LIST_PAGE_FILE = "share/initiatives.html";
/** The id of the JSON in the head, which the app and its first-page script read. */
export const LIST_FIRST_PAGE_ID = "initiatives-first-page";
/** The list request this page stands for: the first page, newest first, with no search or filter. */
export const LIST_FIRST_PAGE_REQUEST = "/api/public-projects";
/** The address keys the list reads a search, filter or order from. A page that has one is not this page. */
export const LIST_CHOICE_KEYS = ["q", "organizationType", "workScope", "sort"] as const;

/** What the head carries for the app: the request it stands for and the page that answered it. */
export interface ListFirstPage {
  readonly path: typeof LIST_FIRST_PAGE_REQUEST;
  readonly page: PublicProjectPage;
}

/** The skeleton grid the build draws where the cards go: one list, hidden from assistive technology. */
const SKELETON_GRID = /<ul class="rc-card-grid" aria-hidden="true">[\s\S]*?<\/ul>/gu;
/** The view the build drew for the list, which is the only one cards go into. */
const LIST_ROOT = `<div id="root" data-first-view="${LIST_FIRST_VIEW_PATH}"`;
const HEAD = "<head>";

const UTC_DAY = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
/** A day as the app's cards write it: the date's UTC day, in words. */
const day = (iso: string): string =>
  UTC_DAY.format(new Date(`${new Date(iso).toISOString().slice(0, 10)}T00:00:00Z`));

/** The design system's icon, from the site's own sprite, as the app's Icon draws it. */
const icon = (name: "place" | "clock"): string =>
  `<svg class="rc-icon" data-size="sm" aria-hidden="true"><use href="/brand/icons.svg#${name}"></use></svg>`;

/** The words a card's meta line says in full, for its title: who shared it, then where. */
const sharedByLine = (card: PublicProjectCard): string =>
  [card.publisher && `Shared by ${card.publisher}.`, card.place && `Place: ${card.place}.`].filter(Boolean).join(" ");

/**
 * One card, as the app draws it: its name linked to its Weave address (or alone, where it has none:
 * its record's raw data is no page to read), who shared it and where, its own words, when it was checked
 * and shared.
 * Every word from the project is escaped; nothing from it is markup.
 */
export function listCardHtml(card: PublicProjectCard): string {
  const slug = projectSlug(card.uri);
  const link = slug
    ? `<a href="${escapeHtml(`/initiatives/${slug}`)}">${escapeHtml(card.name)}</a>`
    : escapeHtml(card.name);
  const line = sharedByLine(card);
  const publisher = card.publisher ? `<span class="rc-visually-hidden">Shared by </span>${escapeHtml(card.publisher)}` : "";
  const place = card.place
    ? `${icon("place")}<span class="rc-visually-hidden">${card.publisher ? ". Place: " : "Place: "}</span>${escapeHtml(card.place)}`
    : "";
  return (
    `<li tabindex="-1"><article class="rc-card" data-layout="listing" data-kind="initiative" data-rows="fixed">` +
    `<h2 class="rc-card-title">${link}</h2>` +
    `<p class="rc-card-meta"${line ? ` title="${escapeHtml(line)}"` : ""}>${publisher}${place}</p>` +
    `<p class="rc-card-summary">${escapeHtml(card.passages.join(" "))}</p>` +
    `<p class="rc-meta">Source: Certified, checked on <time datetime="${escapeHtml(card.checkedAt)}">${day(card.checkedAt)}</time>.</p>` +
    `<p class="rc-time">${icon("clock")}Shared <time datetime="${escapeHtml(card.sharedAt)}">${day(card.sharedAt)}</time></p>` +
    `</article></li>`
  );
}

/** Whether a page is one the list shows as cards: switched on and holding projects. */
export const drawsCards = (page: PublicProjectPage): boolean =>
  page.index.status !== "off" && page.projects.length > 0;

/**
 * Whether an address for the list asks for its own first page: no search, filter or order. Only the query
 * is read, since the router hands the request on at its endpoint's address.
 */
export const asksFirstPage = (url: URL): boolean => LIST_CHOICE_KEYS.every((key) => !url.searchParams.has(key));

/** The one skeleton grid inside the build's view of the list, or null where the page has no such view. */
function skeletonGrid(html: string): string | null {
  if (html.split(LIST_ROOT).length !== 2) return null;
  const grids = html.match(SKELETON_GRID) ?? [];
  const grid = grids[0];
  return grids.length === 1 && grid && !grid.slice(1).includes("<ul") && html.indexOf(grid) > html.indexOf(LIST_ROOT) ? grid : null;
}

/**
 * The page with the list's first page in it: the page as JSON at the start of the head, before any
 * script, so every script finds it and the app's first draw has the cards, and, where the page is the
 * build's view of the list, the cards in place of its skeleton grid. A page whose root holds anything
 * else, such as the app's empty root, gets the JSON alone: nothing is drawn into it. A page with more or
 * fewer than one head, or a list the app would not show as cards, goes as it came. Nothing else on the
 * page changes: its head, the build's view around the cards and the list's end are kept.
 */
export function withListFirstPage(html: string, page: PublicProjectPage): string {
  if (!drawsCards(page) || html.split(HEAD).length !== 2) return html;
  const data: ListFirstPage = { path: LIST_FIRST_PAGE_REQUEST, page };
  const withData = html.replace(HEAD, () => `${HEAD}\n    <script type="application/json" id="${LIST_FIRST_PAGE_ID}">${scriptJson(data)}</script>`);
  const grid = skeletonGrid(withData);
  return grid ? withData.replace(grid, () => `<ul class="rc-card-grid">${page.projects.map(listCardHtml).join("")}</ul>`) : withData;
}
