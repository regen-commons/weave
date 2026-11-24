import type { RequestListener, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { readConfiguration } from "./certified/config.ts";
import { createBridgeObserver, observeBridgeRequests, pruneExpiredState } from "./certified/operations.ts";
import { httpsIngress } from "./certified/https-ingress.ts";
import { openBridgeRuntime } from "./certified/runtime.ts";
import { responseTiming } from "./certified/server-timing.ts";

function unavailable(response: ServerResponse): void {
  response.writeHead(503, { "Cache-Control": "no-store", "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "sign_in_unavailable" }));
}

/** Cache only the runtime client. Interaction state and signing keys live in Postgres. */
export function createVercelBridge(env: NodeJS.ProcessEnv): RequestListener {
  const observer = createBridgeObserver(line => console.log(line));
  const issuer = env.WEAVE_AUTH_ISSUER;
  if (!issuer || env.VERCEL !== "1") return (_req, res) => unavailable(res);

  let runtime: ReturnType<typeof openBridgeRuntime> | undefined;
  let handler: RequestListener | undefined;
  let nextCleanup = 0;
  try {
    return httpsIngress(issuer, async (req, res) => {
      let pending: typeof runtime;
      const timing = responseTiming(res), started = performance.now();
      try {
        const cold = !runtime;
        pending = runtime ??= openBridgeRuntime(readConfiguration(env), observer, 2);
        const { store, bridge } = await pending;
        timing.add("runtime", performance.now() - started, cold ? "cold" : "warm");
        handler ??= observeBridgeRequests(bridge, observer);
        const now = performance.now();
        if (now >= nextCleanup) {
          nextCleanup = now + 60_000;
          await timing.time("prune", () => pruneExpiredState(store, observer));
        }
        if (!res.destroyed) await handler(req, res);
      } catch {
        if (!handler && runtime === pending) runtime = undefined;
        observer.event("request_failed");
        if (!res.headersSent && !res.destroyed) unavailable(res);
        else if (!res.writableEnded) res.end();
      }
    }, true);
  } catch {
    return (_req, res) => unavailable(res);
  }
}
