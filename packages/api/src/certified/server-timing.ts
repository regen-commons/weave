import type { ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";

/**
 * Durations for a `Server-Timing` response header, so a browser's network panel shows where a sign-in
 * spends its time. Names and descriptions are fixed labels chosen in code. Nothing from a request, a
 * person, a token or an error is ever written here.
 */
const LABEL = /^[a-z][a-z0-9_-]{0,31}$/u;
const MAX_ENTRIES = 16;

export interface ServerTiming {
  /** Records one duration. A label that is not a fixed lowercase name is dropped. */
  add(name: string, durationMs: number, description?: string): void;
  /** Runs `step` and records how long it took, whether it succeeded or not. */
  time<T>(name: string, step: () => Promise<T>, description?: string): Promise<T>;
  /** The header value, or undefined when nothing was recorded. */
  header(): string | undefined;
}

export function serverTiming(now: () => number = () => performance.now()): ServerTiming {
  const entries: string[] = [];
  const add = (name: string, durationMs: number, description?: string) => {
    if (entries.length >= MAX_ENTRIES || !LABEL.test(name) || (description !== undefined && !LABEL.test(description))) return;
    const duration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
    entries.push(`${name};${description ? `desc=${description};` : ""}dur=${duration}`);
  };
  return {
    add,
    async time(name, step, description) {
      const start = now();
      try { return await step(); }
      finally { add(name, now() - start, description); }
    },
    header: () => entries.length ? entries.join(", ") : undefined,
  };
}

/** Sets the header on a Fetch response. A response with immutable headers is returned as it is. */
export function withServerTiming(response: Response, timing: ServerTiming): Response {
  const value = timing.header();
  if (value) { try { response.headers.set("Server-Timing", value); } catch { /* Timing never changes an answer. */ } }
  return response;
}

const nodeTimings = new WeakMap<ServerResponse, ServerTiming>();
/**
 * The timing for a Node response, written as its headers go out, whoever writes them (the bridge's own
 * redirects or oidc-provider). The first call for a response sets it up.
 */
export function responseTiming(res: ServerResponse): ServerTiming {
  let timing = nodeTimings.get(res);
  if (timing) return timing;
  const created = serverTiming();
  nodeTimings.set(res, created);
  const writeHead = res.writeHead;
  res.writeHead = function (this: ServerResponse, ...args: unknown[]) {
    const value = created.header();
    if (value && !this.headersSent) { try { this.setHeader("Server-Timing", value); } catch { /* Timing never changes an answer. */ } }
    return (writeHead as (...input: unknown[]) => ServerResponse).apply(this, args);
  } as ServerResponse["writeHead"];
  return timing = created;
}
