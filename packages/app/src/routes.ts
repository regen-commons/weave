/** Stable page keys; visible names follow the approved prototype. */
export type RouteName =
  | "home"
  | "initiative"
  | "check-card"
  | "needs"
  | "offers"
  | "finish"
  | "partners"
  | "funding"
  | "initiatives"
  | "initiative-detail"
  | "opportunity"
  | "settings";
export interface Route {
  readonly name: RouteName;
  readonly path: string;
  readonly title: string;
  readonly form: boolean;
  readonly section?: "home" | "partners" | "funding" | "initiatives";
  readonly id?: string;
}
export const ROUTES: readonly Route[] = [
  {
    name: "home",
    path: "/",
    title: "Find partners and funding for regenerative work",
    form: false,
    section: "home",
  },
  { name: "initiative", path: "/start/initiative", title: "Tell us about your initiative", form: true },
  { name: "check-card", path: "/start/initiative/check", title: "Check your card", form: true },
  { name: "needs", path: "/start/needs", title: "What does your initiative need?", form: true },
  { name: "offers", path: "/start/offers", title: "What can your initiative offer?", form: true },
  { name: "finish", path: "/start/finish", title: "Your first matches", form: false, section: "partners" },
  { name: "partners", path: "/partners", title: "Partners", form: false, section: "partners" },
  { name: "funding", path: "/funding", title: "Funding", form: false, section: "funding" },
  { name: "initiatives", path: "/initiatives", title: "Initiatives", form: false, section: "initiatives" },
  {
    name: "initiative-detail",
    path: "/initiatives/:id",
    title: "Initiative",
    form: false,
    section: "initiatives",
  },
  { name: "opportunity", path: "/funding/:id", title: "Opportunity", form: false, section: "funding" },
  { name: "settings", path: "/settings", title: "Settings", form: false },
];
export const INTAKE_STEPS = [
  { route: "initiative", label: "Initiative" },
  { route: "needs", label: "Needs" },
  { route: "offers", label: "Offers" },
] as const satisfies readonly { route: RouteName; label: string }[];
export function matchRoute(pathname: string): Route | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const alias = path === "/matches" ? "/partners" : path === "/directory" ? "/funding" : path;
  for (const route of ROUTES) {
    if (!route.path.includes(":id")) {
      if (route.path === alias) return route;
      continue;
    }
    const prefix = route.path.slice(0, -3);
    if (alias.startsWith(prefix)) {
      const id = alias.slice(prefix.length);
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
export function documentTitle(route: Route | undefined): string {
  return !route ? "Page not found | Weave" : route.name === "home" ? "Weave" : `${route.title} | Weave`;
}
/** Keep development scenarios while following internal links; never add them to external links. */
export function fixtureHref(href: string, search: string, enabled: boolean): string {
  if (!enabled || !href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://weave.example.org");
  const source = new URLSearchParams(search);
  for (const key of ["fixture", "state", "view", "intake"]) {
    const value = source.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
