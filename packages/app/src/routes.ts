import { uuid } from "@weave/api/account-contract";

/** Stable page keys; visible names follow the approved prototype. */
export type RouteName =
  | "home"
  | "new-initiative"
  | "initiative"
  | "needs"
  | "offers"
  | "your-initiative"
  | "your-initiatives"
  | "partners"
  | "funding"
  | "initiatives"
  | "initiative-detail"
  | "opportunity"
  | "settings"
  | "team-workspace";
/** The four tabs. A page inside one keeps that tab marked. */
export type Section = "home" | "funding" | "initiatives" | "your-initiatives";
export interface Route {
  readonly name: RouteName;
  readonly path: string;
  readonly title: string;
  /** The short name navigation uses where the title is a sentence. */
  readonly label?: string;
  readonly form: boolean;
  /**
   * Where the footer shows. `"wide"` leaves it out on a phone, for a page that should feel like an
   * app there: the steps of describing an initiative and the Your Initiatives tab. A wide screen
   * keeps it on every page.
   */
  readonly footer?: "wide";
  readonly section?: Section;
  /** The page one level up, where the back link goes when the app does not know where the person came from. Tabs have none. */
  readonly parent?: RouteName;
  /** Opens over the page the person is on: a sheet on phones, a dialog on wide screens. */
  readonly sheet?: boolean;
  readonly id?: string;
}
export const ROUTES: readonly Route[] = [
  {
    name: "home",
    path: "/",
    title: "Find Partners And Funding For Regenerative Work",
    label: "Home",
    form: false,
    section: "home",
  },
  {
    // Starts a new card, then shows step 1 at its own address. Every "Start An Initiative" comes here.
    name: "new-initiative",
    path: "/start/new",
    title: "Start An Initiative",
    form: true,
    footer: "wide",
    parent: "home",
  },
  {
    name: "initiative",
    path: "/start/initiative",
    title: "Tell Us About Your Initiative",
    label: "Describe Your Initiative",
    form: true,
    footer: "wide",
    parent: "home",
  },
  { name: "needs", path: "/start/needs", title: "Needs And Offers", form: true, footer: "wide", parent: "initiative" },
  { name: "offers", path: "/start/offers", title: "What You Can Offer", form: true, footer: "wide", parent: "needs" },
  {
    name: "your-initiative",
    path: "/your-initiative",
    title: "Your Initiative",
    form: false,
    section: "your-initiatives",
    parent: "your-initiatives",
  },
  {
    name: "your-initiatives",
    path: "/your-initiatives",
    title: "Your Initiatives",
    form: false,
    footer: "wide",
    section: "your-initiatives",
  },
  {
    name: "partners",
    path: "/partners",
    title: "Partners",
    form: false,
    section: "your-initiatives",
    parent: "your-initiative",
  },
  { name: "funding", path: "/funding", title: "Funding", form: false, section: "funding" },
  { name: "initiatives", path: "/initiatives", title: "Initiatives", form: false, section: "initiatives" },
  {
    name: "initiative-detail",
    path: "/initiatives/:id",
    title: "Initiative",
    form: false,
    section: "initiatives",
    parent: "initiatives",
    sheet: true,
  },
  {
    name: "opportunity",
    path: "/funding/:id",
    title: "Opportunity",
    form: false,
    section: "funding",
    parent: "funding",
    sheet: true,
  },
  {
    name: "settings",
    path: "/settings",
    title: "Settings",
    form: false,
    section: "your-initiatives",
    parent: "your-initiatives",
  },
  {
    name: "team-workspace",
    path: "/workspaces/:id",
    title: "Your Initiative",
    form: false,
    section: "your-initiatives",
    parent: "your-initiatives",
  },
];
export const INTAKE_STEPS = [
  { route: "initiative", label: "Initiative" },
  { route: "needs", label: "Needs And Offers" },
  { route: "your-initiative", label: "Funding And Partners" },
] as const satisfies readonly { route: RouteName; label: string }[];
/**
 * How a move between two pages is drawn on a phone (DL-094). A page deeper in is pushed on, the
 * way back up pops it off, and a move across sections, or to somewhere the app cannot place,
 * fades as it always did.
 */
export type PageMove = "push" | "pop" | "fade";
export function pageMove(from: string, to: string): PageMove {
  const [here, there] = [routeAt(from), routeAt(to)];
  if (!here || !there || here.name === there.name) return "fade";
  if (above(there).includes(here.name)) return "push";
  if (above(here).includes(there.name)) return "pop";
  // Describing an initiative is one way through: a later step is further in, wherever it hangs.
  const [was, next] = [stepOf(here), stepOf(there)];
  if (was === -1 || next === -1 || was === next) return "fade";
  return next > was ? "push" : "pop";
}
/** The pages above a page, nearest first. */
function above(route: Route): RouteName[] {
  const names: RouteName[] = [];
  for (let parent = route.parent; parent && !names.includes(parent); parent = ROUTES.find((candidate) => candidate.name === parent)?.parent) names.push(parent);
  return names;
}
/** Which step of describing an initiative a page belongs to: its own, or the one it hangs under. */
function stepOf(route: Route): number {
  return [route.name, ...above(route)].map((name) => INTAKE_STEPS.findIndex((step) => step.route === name)).find((index) => index !== -1) ?? -1;
}
export function matchRoute(pathname: string): Route | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const alias =
    path === "/matches"
      ? "/partners"
      : path === "/directory"
        ? "/funding"
        : path === "/start/finish"
          ? "/your-initiative"
          : // The describe step is one page now (DL-110). The page that checked the card is gone.
            path === "/start/initiative/check"
            ? "/start/initiative"
            : path;
  for (const route of ROUTES) {
    if (!route.path.includes(":id")) {
      if (route.path === alias) return route;
      continue;
    }
    const prefix = route.path.slice(0, -3);
    if (alias.startsWith(prefix)) {
      const id = alias.slice(prefix.length);
      if (route.name === "team-workspace") {
        if (uuid(id)) return { ...route, id: id.toLowerCase() };
        continue;
      }
      if ((route.name === "opportunity" ? /^[a-zA-Z0-9_-]+$/ : /^[a-z0-9-]+$/).test(id)) return { ...route, id };
    }
  }
  return undefined;
}
export function pathTo(name: RouteName): string {
  const route = ROUTES.find((candidate) => candidate.name === name);
  if (!route || route.path.includes(":id")) throw new Error(`Route ${name} needs a valid destination`);
  return route.path;
}
export function recordPath(kind: "initiative" | "funding", id: string): string {
  if (!(kind === "funding" ? /^[a-zA-Z0-9_-]+$/ : /^[a-z0-9-]+$/).test(id)) throw new Error("Record identifiers must be valid catalog IDs or initiative slugs");
  return `/${kind === "initiative" ? "initiatives" : "funding"}/${id}`;
}
export function teamWorkspacePath(id: string): string {
  if (!uuid(id)) throw new Error("Invalid workspace ID");
  return `/workspaces/${id.toLowerCase()}`;
}
/** A page's name in navigation: the tab, the back link and the footer. */
export function navLabel(name: RouteName): string {
  const route = ROUTES.find((candidate) => candidate.name === name)!;
  return route.label ?? route.title;
}
const routeAt = (route: string): Route | undefined => matchRoute(splitRoute(route).pathname);

/**
 * How a page was reached, kept in its history entry: the page to return to and how many
 * entries back it is. A sheet returns to the page it opened over.
 */
export interface Visit {
  readonly from: string;
  readonly hops: number;
}
/** Reads a history entry's state, which another script or an older build may have written. */
export function readVisit(state: unknown): Visit | null {
  if (typeof state !== "object" || state === null) return null;
  const { from, hops } = state as { from?: unknown; hops?: unknown };
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && Number.isInteger(hops) && (hops as number) > 0
    ? { from, hops: hops as number }
    : null;
}
/** The visit a move from `here` to `to` writes. Replacing an entry leaves the page before it unchanged. */
export function nextVisit(here: string, visit: Visit | null, to: string, replace: boolean): Visit | null {
  if (replace) return visit;
  const current = routeAt(here);
  const next = routeAt(to);
  // A new query on the same page, or another sheet over the same page, still returns to the same place.
  const stays = !!visit && !!current && !!next && (current.name === next.name || (!!current.sheet && !!next.sheet));
  return stays ? { from: visit.from, hops: visit.hops + 1 } : { from: here, hops: 1 };
}
/** The page under a sheet: the one it opened over, or its list when the sheet was opened from a link. */
export function sheetBackground(route: Route, visit: Visit | null): { route: string; hops: number } {
  const from = visit ? routeAt(visit.from) : undefined;
  return visit && from && !from.sheet
    ? { route: visit.from, hops: visit.hops }
    : { route: pathTo(route.parent ?? "home"), hops: 0 };
}
export interface BackTarget {
  readonly label: string;
  readonly href: string;
  /** History entries to step back, so the link and the back gesture agree. Zero opens `href` as a new page. */
  readonly hops: number;
}
/**
 * Where a page's back link goes: the page the person came from, otherwise one level up.
 * Tabs have no back link, and a sheet closes instead.
 */
export function backTarget(route: Route | undefined, visit: Visit | null): BackTarget | null {
  if (!route?.parent || route.sheet) return null;
  const from = visit ? routeAt(visit.from) : undefined;
  if (visit && from && from.name !== route.name) {
    // Going back to a sheet lands on the page under it, so the link names that page.
    return { label: navLabel(from.sheet && from.parent ? from.parent : from.name), href: visit.from, hops: visit.hops };
  }
  return { label: navLabel(route.parent), href: pathTo(route.parent), hops: 0 };
}
export interface Crumb {
  readonly label: string;
  readonly href: string;
}
/**
 * The pages above a page, outermost first, for the breadcrumb trail a wide screen shows in place
 * of the app bar's back link (DL-080). It follows the route table, not the way the person came,
 * so the trail is the same on every visit. Tabs and sheets have none. Nor do the steps of
 * describing an initiative: they follow one another, they are not pages inside one another, and the
 * step bar above their titles already says where the person is.
 */
export function breadcrumbTrail(route: Route | undefined): Crumb[] {
  if (!route?.parent || route.sheet || route.form) return [];
  const trail: Crumb[] = [];
  const seen = new Set<RouteName>([route.name]);
  for (let name: RouteName | undefined = route.parent; name && !seen.has(name); ) {
    seen.add(name);
    const parent: Route = ROUTES.find((candidate) => candidate.name === name)!;
    trail.unshift({ label: navLabel(parent.name), href: parent.path });
    name = parent.parent;
  }
  return trail;
}
export function documentTitle(route: Route | undefined): string {
  return !route ? "Page Not Found | Weave" : route.name === "home" ? "Weave" : `${route.title} | Weave`;
}
const ROUTE_BASE = "https://weave.example.org";
/** The prototype build keeps the route in the URL fragment. Anything that is not a route opens Home. */
export function routeFromFragment(fragment: string): string {
  const route = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return route.startsWith("/") && !route.startsWith("//") ? route : "/";
}
/** A route's path and query, such as `/funding` and `?q=water`. */
export function splitRoute(route: string): { pathname: string; search: string } {
  const url = new URL(route, ROUTE_BASE);
  return { pathname: url.pathname, search: url.search };
}
/** The route with one query value set, optionally on another path, as retries and example controls need. */
export function routeWith(route: string, key: string, value: string, pathname?: string): string {
  const url = new URL(route, ROUTE_BASE);
  url.searchParams.set(key, value);
  return `${pathname ?? url.pathname}${url.search}`;
}
/** Keep development scenarios while following internal links; never add them to external links. */
export function fixtureHref(href: string, search: string, enabled: boolean): string {
  if (!enabled || !href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, ROUTE_BASE);
  const source = new URLSearchParams(search);
  for (const key of ["fixture", "state", "view", "intake", "certified", "projects", "speech", "drafts"]) {
    const value = source.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
