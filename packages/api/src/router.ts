// One Vercel function for the endpoints that need no address of their own (23 November 2026). Vercel's
// Hobby plan deploys at most 12 functions, and Weave had 13. The ones Certified knows by address, the
// account and sign-in, and the daily index refresh keep their own; these share this one. packages/app/
// vercel.json rewrites each one's address here with `__route` naming it, and this hands the request on
// with the address and query it had, so each handler answers exactly as it did as a function of its own.
// Each handler is loaded only when its endpoint is first asked for, so a cold start loads one.

/** The query key the rewrites add to say which endpoint a request is for. Taken off before the handler sees it. */
export const ROUTE_KEY = "__route";

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (request: Request) => Response | Promise<Response>;

/**
 * Each endpoint, the methods its own function exported (no more: any other gets 405, as Vercel gives a
 * function for a method it does not export) and how to load its handlers.
 */
export const ENDPOINTS = {
  health: { methods: ["GET"], load: () => import("./health.ts") },
  matching: { methods: ["POST"], load: () => import("./matching.ts") },
  // Answers GET and DELETE itself, with 405, so the switch that turns it off covers them too.
  mcp: { methods: ["GET", "POST", "DELETE"], load: () => import("./mcp.ts") },
  projects: { methods: ["POST"], load: () => import("./projects.ts") },
  "public-projects": { methods: ["GET"], load: () => import("./public-projects.ts") },
  "record-image": { methods: ["GET", "HEAD"], load: () => import("./record-image.ts") },
  "record-page": { methods: ["GET", "HEAD"], load: () => import("./record-page.ts") },
  sitemap: { methods: ["GET", "HEAD"], load: () => import("./sitemap.ts") },
  transcribe: { methods: ["GET", "POST"], load: () => import("./transcribe.ts") },
} as const satisfies Endpoints;
export type Endpoint = keyof typeof ENDPOINTS;

/** An endpoint the router can hand a request to: the methods it answers and how to load its handlers. */
export type Endpoints = Readonly<Record<string, { readonly methods: readonly Method[]; load: () => Promise<Partial<Record<Method, Handler>>> }>>;

const isEndpoint = (name: string | null): name is Endpoint => name !== null && Object.hasOwn(ENDPOINTS, name);

/** A fund's or an initiative's own address, as a link names it. */
const RECORD_ADDRESS = /^\/(funding|initiatives)\/([^/]+)$/u;

/**
 * Which endpoint a request is for, and the address its handler should see: `/api/<endpoint>` with the
 * request's own query, less the routing key. At the router's own address the rewrite names the endpoint
 * in `__route`, once. At an endpoint's, a record's or the sitemap's own address (if Vercel hands a
 * rewritten request on with the address it came to) the path decides and any `__route` a client added is ignored, so no address
 * can be made to answer as another endpoint. Anything else is for no endpoint.
 */
export function routeOf(url: URL): { endpoint: Endpoint; url: URL } | null {
  const target = new URL(url);
  target.searchParams.delete(ROUTE_KEY);
  let endpoint: string | null = null;
  const record = RECORD_ADDRESS.exec(url.pathname);
  if (url.pathname === "/api/router") {
    const named = url.searchParams.getAll(ROUTE_KEY);
    if (named.length !== 1) return null;
    endpoint = named[0]!;
  } else if (url.pathname === "/sitemap.xml") {
    endpoint = "sitemap";
  } else if (record) {
    let id: string;
    try { id = decodeURIComponent(record[2]!); } catch { return null; }
    target.searchParams.set("kind", record[1] === "funding" ? "funding" : "initiative");
    target.searchParams.set("id", id);
    endpoint = "record-page";
  } else {
    endpoint = /^\/api\/([a-z-]+)$/u.exec(url.pathname)?.[1] ?? null;
  }
  if (!isEndpoint(endpoint)) return null;
  target.pathname = `/api/${endpoint}`;
  return { endpoint, url: target };
}

const notFound = () => new Response(null, { status: 404 });

/**
 * A router over these endpoints. A request is handed to its endpoint's own handler untouched: the same
 * method, headers (Origin, Content-Type, cookies and the rest) and abort signal, its body as the stream it
 * came as (never read, parsed or capped here: cloud speech reads up to 3 MB of audio itself), at its
 * endpoint's own address on the same origin. The handler's response goes back as it is, Set-Cookie
 * headers and all, so a session the handler's wrapper renewed reaches the browser.
 */
export function createRouter(endpoints: Endpoints = ENDPOINTS) {
  return async function route(request: Request): Promise<Response> {
    const found = routeOf(new URL(request.url));
    const target = found && Object.hasOwn(endpoints, found.endpoint) ? endpoints[found.endpoint]! : undefined;
    if (!found || !target) return notFound();
    const method = request.method as Method;
    // ENDPOINTS' `satisfies` checks each module's handlers; read one by the request's method.
    const handlers = (target.methods as readonly string[]).includes(method) ? await target.load() : undefined;
    const handler = handlers?.[method];
    if (typeof handler !== "function") return new Response(null, { status: 405 });
    const body = method === "GET" || method === "HEAD" ? undefined : request.body;
    return handler(new Request(found.url, {
      method, headers: request.headers, body, signal: request.signal, ...(body ? { duplex: "half" } : {}),
    } as RequestInit));
  };
}

const route = createRouter();
export const GET = route;
export const HEAD = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
