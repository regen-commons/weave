import { performance } from "node:perf_hooks";
import type { RequestListener } from "node:http";

const events = ["started", "stopped", "start_failed", "stop_failed", "cleanup_succeeded",
  "cleanup_failed", "provider_error", "request_failed"] as const;
type BridgeEvent = typeof events[number];
const routes = ["discovery", "keys", "authorization", "token", "certified_callback", "interaction", "end_session", "unknown"] as const;
type BridgeRoute = typeof routes[number];
const startStages = ["interaction_details", "browser_state", "email_hint", "oauth_discovery",
  "oauth_state", "oauth_authorize", "authorize_redirect"] as const;
export type BridgeStartStage = typeof startStages[number];
const startErrors = ["state_store_failed", "upstream_rejected", "upstream_timeout",
  "upstream_request_failed", "validation_failed"] as const;
const oauthErrors = ["invalid_client", "invalid_request", "invalid_scope", "unauthorized_client",
  "unsupported_response_type", "invalid_grant", "use_dpop_nonce", "server_error", "temporarily_unavailable"] as const;
export function allowlistedOAuthError(value: unknown) {
  return oauthErrors.find(code => code === value);
}
export interface BridgeStartFailure {
  stage: BridgeStartStage;
  error: typeof startErrors[number];
  upstreamStatus?: number;
  oauthError?: typeof oauthErrors[number];
}
export interface BridgeObserver {
  event(name: BridgeEvent): void;
  request(route: BridgeRoute, status: number, durationMs: number, aborted: boolean): void;
  startFailure(failure: BridgeStartFailure): void;
}

/** The sink accepts only reconstructed, bounded labels. It never receives a request or error. */
export function createBridgeObserver(write: (line: string) => void = () => {}): BridgeObserver {
  const emit = (value: Record<string, string | number | boolean>) => {
    try { write(JSON.stringify({ component: "certified_bridge", ...value })); }
    catch { /* A failed log sink must not change authentication or response handling. */ }
  };
  return {
    event(name) { if (events.includes(name)) emit({ event: name }); },
    startFailure({ stage, error, upstreamStatus, oauthError }) {
      if (!startStages.includes(stage) || !startErrors.includes(error)) return;
      const code = error === "upstream_rejected" ? allowlistedOAuthError(oauthError) : undefined;
      emit({ event: "certified_start_failed", stage, error,
        ...(typeof upstreamStatus === "number" && Number.isInteger(upstreamStatus) &&
          upstreamStatus >= 100 && upstreamStatus <= 599 ? { upstream_status: upstreamStatus } : {}),
        ...(code ? { oauth_error: code } : {}) });
    },
    request(route, status, durationMs, aborted) {
      emit({ event: "request", route: routes.includes(route) ? route : "unknown",
        status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0,
        duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
        aborted: aborted === true });
    },
  };
}

function routeLabel(raw: string | undefined): BridgeRoute {
  const path = (raw ?? "").split("?", 1)[0];
  if (path === "/.well-known/openid-configuration" || path === "/client-metadata.json") return "discovery";
  if (path === "/jwks" || path === "/at-jwks.json") return "keys";
  if (path === "/token") return "token";
  if (path === "/at/callback") return "certified_callback";
  if (/^\/auth(?:\/[A-Za-z0-9_-]+)?$/.test(path ?? "")) return "authorization";
  if (/^\/interaction\/[A-Za-z0-9_-]+(?:\/complete)?$/.test(path ?? "")) return "interaction";
  if (/^\/session\/end(?:\/(?:confirm|success))?$/.test(path ?? "")) return "end_session";
  return "unknown";
}

/** Capture one completion per request; paths, query strings, headers and bodies stay private. */
export function observeBridgeRequests(handler: RequestListener, observer: BridgeObserver): RequestListener {
  return (req, res) => {
    const start = performance.now(), route = routeLabel(req.url);
    let recorded = false;
    const record = (aborted: boolean) => {
      if (recorded) return;
      recorded = true;
      observer.request(route, aborted ? 0 : res.statusCode, performance.now() - start, aborted);
    };
    res.once("finish", () => record(false));
    res.once("close", () => record(!res.writableFinished));
    return handler(req, res);
  };
}

export async function pruneExpiredState(store: { prune(): Promise<void> }, observer: BridgeObserver): Promise<void> {
  try { await store.prune(); observer.event("cleanup_succeeded"); }
  catch { observer.event("cleanup_failed"); }
}
