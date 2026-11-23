// Answers /api requests in development the way Vercel answers them in production, from
// the same api/<name>.ts entry files, so the app and its functions run on one server.
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/**
 * Loads an entry by its name under api/, such as `health` or `catalog/funders`: its file, or a development
 * stand-in for that name. Undefined when there is neither, so a name vercel.json rewrites can go on to its
 * function. A failure to load either rejects, and reaches the dev server's error page.
 */
export type LoadEntry = (name: string) => Promise<Record<string, unknown> | undefined>;

/** The entry name Vercel runs for a pathname, when its file exists: /api/a/b runs api/a/b.ts. */
export function entryName(apiDir: string, pathname: string): string | undefined {
  const name = /^\/api\/([\w-]+(?:\/[\w-]+)*)$/.exec(pathname)?.[1];
  return name && existsSync(join(apiDir, `${name}.ts`)) ? name : undefined;
}

/**
 * The addresses under /api that vercel.json rewrites to another function, as Vercel does for an address
 * no function has (23 November 2026: several endpoints share api/router.ts to stay within the Hobby
 * plan's 12 functions). Read from the vercel.json beside the api folder; none where there is none.
 */
export function apiRewrites(apiDir: string): ReadonlyMap<string, string> {
  try {
    const config = JSON.parse(readFileSync(join(apiDir, "..", "vercel.json"), "utf8")) as { rewrites?: { source?: unknown; destination?: unknown }[] };
    return new Map((config.rewrites ?? []).flatMap(({ source, destination }) =>
      typeof source === "string" && typeof destination === "string" && /^\/api\/[\w-]+$/.test(source) && destination.startsWith("/api/")
        ? [[source, destination] as const] : []));
  } catch {
    return new Map();
  }
}

/** The rewrite's destination for a request, with the request's own query after the destination's, as Vercel merges them. */
function rewritten(url: URL, destination: string): URL {
  const target = new URL(destination, url);
  for (const [key, value] of url.searchParams) target.searchParams.append(key, value);
  return target;
}

/**
 * Calls the entry's handler for the request method with a Fetch `Request`, then streams
 * its `Response` back with every header, including each Set-Cookie. Every path under
 * /api belongs to functions: an unknown one gets 404, never the app's HTML, and a method
 * the entry does not export gets 405.
 */
export async function answerApiRequest(
  request: IncomingMessage & { originalUrl?: string },
  response: ServerResponse,
  apiDir: string,
  load: LoadEntry,
): Promise<void> {
  // Vercel builds the URL from the Host header, so handlers see the origin the browser used.
  const url = new URL(request.originalUrl ?? request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  let name = entryName(apiDir, url.pathname);
  const method = request.method ?? "GET";
  let entry = name ? await load(name) : undefined;
  // An address vercel.json sends to another function is answered by that function, unless development
  // has a stand-in for the address's own name (the example account, or production's project list).
  const destination = name ? undefined : apiRewrites(apiDir).get(url.pathname);
  if (destination) {
    entry = await load(url.pathname.slice("/api/".length));
    if (!entry) {
      const target = rewritten(url, destination);
      name = entryName(apiDir, target.pathname);
      entry = name ? await load(name) : undefined;
      url.href = target.href;
    }
    name ??= url.pathname.slice("/api/".length);
  }
  const handler = entry?.[method];
  if (typeof handler !== "function") {
    response.statusCode = name ? 405 : 404;
    response.end();
    return;
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    for (const item of [value ?? []].flat()) headers.append(key, item);
  }
  const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(request);
  const result: Response = await handler(new Request(url, { method, headers, body, duplex: "half" } as RequestInit));
  // Navigation can close the socket while a handler is still working.
  if (response.destroyed || response.writableEnded) {
    await result.body?.cancel();
    return;
  }
  response.statusCode = result.status;
  if (result.statusText) response.statusMessage = result.statusText;
  for (const [key, value] of result.headers) {
    if (key !== "set-cookie") response.setHeader(key, value);
  }
  const cookies = result.headers.getSetCookie();
  if (cookies.length) response.setHeader("set-cookie", cookies);
  if (result.body) {
    try {
      await pipeline(Readable.fromWeb(result.body as WebReadableStream), response);
    } catch (error) {
      // Pipeline cancels its source on disconnect. Preserve actual handler/source errors.
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (!response.destroyed || (code !== "ERR_STREAM_PREMATURE_CLOSE" && code !== "ERR_STREAM_UNABLE_TO_PIPE")) throw error;
    }
  } else response.end();
}
