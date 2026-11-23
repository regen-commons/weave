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
  projects: { methods: ["POST"], load: () => import("./projects.ts") },
  "public-projects": { methods: ["GET"], load: () => import("./public-projects.ts") },
  "record-page": { methods: ["GET", "HEAD"], load: () => import("./record-page.ts") },
  transcribe: { methods: ["GET", "POST"], load: () => import("./transcribe.ts") },
} as const satisfies Record<string, { methods: readonly Method[]; load: () => Promise<Partial<Record<Method, Handler>>> }>;
export type Endpoint = keyof typeof ENDPOINTS;

const isEndpoint = (name: string | null): name is Endpoint => name !== null && Object.hasOwn(ENDPOINTS, name);

/** A fund's or an initiative's own address, as a link names it. */
const RECORD_ADDRESS = /^\/(funding|initiatives)\/([^/]+)$/u;

/**
 * Which endpoint a request is for, and the address its handler should see: `/api/<endpoint>` with the
 * request's own query, less the routing key. The rewrite says which endpoint in `__route`. A request that
 * reaches here without one is read from its path: an endpoint's own address, or a record's, which goes to
 * the record page as its rewrite would send it. A request that names an endpoint twice, or one that does
 * not exist, is for none.
 */
export function routeOf(url: URL): { endpoint: Endpoint; url: URL } | null {
  const named = url.searchParams.getAll(ROUTE_KEY);
  if (named.length > 1) return null;
  const target = new URL(url);
  target.searchParams.delete(ROUTE_KEY);
  const record = named.length ? null : RECORD_ADDRESS.exec(url.pathname);
  if (record) {
    let id: string;
    try { id = decodeURIComponent(record[2]!); } catch { return null; }
    target.searchParams.set("kind", record[1] === "funding" ? "funding" : "initiative");
    target.searchParams.set("id", id);
  }
  const endpoint = record ? "record-page" : named[0] ?? /^\/api\/([a-z-]+)$/u.exec(url.pathname)?.[1] ?? null;
  if (!isEndpoint(endpoint)) return null;
  target.pathname = `/api/${endpoint}`;
  return { endpoint, url: target };
}

const notFound = () => new Response(null, { status: 404 });

async function route(request: Request): Promise<Response> {
  const found = routeOf(new URL(request.url));
  if (!found) return notFound();
  const { methods, load } = ENDPOINTS[found.endpoint];
  const method = request.method as Method;
  // ENDPOINTS' `satisfies` checks each module's handlers; read one by the request's method.
  const handlers: Partial<Record<Method, Handler>> | undefined = (methods as readonly string[]).includes(method) ? await load() : undefined;
  const handler = handlers?.[method];
  if (typeof handler !== "function") return new Response(null, { status: 405 });
  // The same request at the endpoint's own address: method, headers, body and abort signal as they came.
  const body = method === "GET" || method === "HEAD" ? undefined : request.body;
  return handler(new Request(found.url, {
    method, headers: request.headers, body, signal: request.signal, ...(body ? { duplex: "half" } : {}),
  } as RequestInit));
}

export const GET = route;
export const HEAD = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
