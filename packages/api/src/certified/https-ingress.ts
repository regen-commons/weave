import type { RequestListener } from "node:http";
import { performance } from "node:perf_hooks";

const requestsPerMinute = 600;
const minuteMs = 60_000;

/** The hosting edge terminates TLS before forwarding HTTP to this listener. */
export function httpsIngress(issuer: string, bridge: RequestListener, requireForwardedHttps: boolean): RequestListener {
  const host = new URL(issuer).host;
  let windowEnd = performance.now() + minuteMs;
  let remaining = requestsPerMinute;
  return (req, res) => {
    if (req.headers.host !== host || req.headersDistinct.host?.length !== 1 ||
      (requireForwardedHttps && req.headers["x-forwarded-proto"] !== "https")) {
      res.writeHead(421, { "Cache-Control": "no-store" }).end();
      return;
    }
    const now = performance.now();
    if (now >= windowEnd) {
      windowEnd = now + minuteMs;
      remaining = requestsPerMinute;
    }
    if (remaining === 0) {
      res.writeHead(429, { "Cache-Control": "no-store", "Retry-After": Math.ceil((windowEnd - now) / 1000) }).end();
      return;
    }
    remaining--;
    for (const header of Object.keys(req.headers)) {
      if (header === "forwarded" || header === "x-real-ip" || header.startsWith("x-forwarded-")) {
        delete req.headers[header];
      }
    }
    req.headers["x-forwarded-proto"] = "https";
    bridge(req, res);
  };
}
