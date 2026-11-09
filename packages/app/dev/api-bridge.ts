// Answers /api requests in development the way Vercel answers them in production, from
// the same api/<name>.ts entry files, so the app and its functions run on one server.
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/** Loads an entry by its name under api/, such as `health` or `catalog/funders`. */
export type LoadEntry = (name: string) => Promise<Record<string, unknown>>;

/** The entry name Vercel runs for a pathname, when its file exists: /api/a/b runs api/a/b.ts. */
export function entryName(apiDir: string, pathname: string): string | undefined {
  const name = /^\/api\/([\w-]+(?:\/[\w-]+)*)$/.exec(pathname)?.[1];
  return name && existsSync(join(apiDir, `${name}.ts`)) ? name : undefined;
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
  const name = entryName(apiDir, url.pathname);
  const method = request.method ?? "GET";
  const handler = name ? (await load(name))[method] : undefined;
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
