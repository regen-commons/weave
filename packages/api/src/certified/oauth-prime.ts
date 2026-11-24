import type { NodeOAuthClientOptions } from "@atproto/oauth-client-node";
import { CERTIFIED_ISSUER } from "./identity.ts";

/**
 * Readies Certified's OAuth server before a sign-in or a project permission needs it.
 *
 * Measured on production (24 November 2026), the bridge's step that sends a person to Certified took
 * about a second, warm. Most of it was four requests to Certified made one after another: its
 * protected-resource and authorization-server metadata, a pushed authorization request (PAR) that
 * Certified refused for want of a DPoP nonce, and the same request again with the nonce. The SDK
 * caches metadata and nonces for only 60 seconds, and the project client started each attempt with
 * empty caches, so after a quiet minute every start paid all four.
 *
 * Two things fix that. One set of caches per function instance, shared by every client it makes, keeps
 * metadata for as long as Certified allows (`Cache-Control: public, max-age=300`) and nonces for the
 * SDK's own 60 seconds. A primer fills them ahead of the press: it resolves the metadata through the
 * SDK, so it is validated exactly as a sign-in would validate it, and asks Certified's PAR endpoint for
 * a nonce with an empty request. Certified's server sets a fresh `DPoP-Nonce` on every PAR response,
 * the refusal of an empty one included, and refuses that request before it fetches any client metadata.
 * A nonce that has gone stale costs no more than today: Certified answers `use_dpop_nonce` and the SDK
 * retries once with the new one.
 */

/** Certified serves its authorization-server metadata with `max-age=300`. */
export const METADATA_TTL_MS = 300_000;
/** The SDK's own lifetime for a nonce. Certified accepts one for two to three minutes. */
export const NONCE_TTL_MS = 60_000;
const PRIME_TIMEOUT_MS = 5_000;
/** After a failure, priming waits this long before it asks Certified again, so no caller can make it ask at will. */
export const PRIME_RETRY_AFTER_MS = 20_000;
/** The longest a sign-in or consent start waits for readying before it goes on without it. */
export const PRIME_WAIT_MS = 1_500;
/** Nonce token syntax (RFC 9449), bounded. Certified's are 43 base64url characters. */
const NONCE = /^[\x21\x23-\x5B\x5D-\x7E]{8,512}$/u;

/** The SDK's store interface (`@atproto-labs/simple-store`), kept in memory with one lifetime for every entry. */
export interface MemoryStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  del(key: string): void;
  clear(): void;
}
export function memoryStore<V>(ttlMs: number, now: () => number = Date.now, max = 16): MemoryStore<V> {
  const entries = new Map<string, { value: V; expires: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) { entries.delete(key); return undefined; }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      // Only Certified's few origins are ever kept; the bound stops a surprise from growing without end.
      while (entries.size > max) entries.delete(entries.keys().next().value!);
    },
    del(key) { entries.delete(key); },
    clear() { entries.clear(); },
  };
}

type ClientOptions = NodeOAuthClientOptions;
type Stored<S> = S extends { set(key: string, value: infer V): unknown } ? V : never;
type ProtectedResourceMetadata = Stored<NonNullable<ClientOptions["protectedResourceMetadataCache"]>>;
type AuthorizationServerMetadata = Stored<NonNullable<ClientOptions["authorizationServerMetadataCache"]>>;

/** The caches every Certified OAuth client in one instance shares. Spread them into the client's options. */
export function certifiedOAuthCaches(now: () => number = Date.now) {
  return {
    protectedResourceMetadataCache: memoryStore<ProtectedResourceMetadata>(METADATA_TTL_MS, now),
    authorizationServerMetadataCache: memoryStore<AuthorizationServerMetadata>(METADATA_TTL_MS, now),
    dpopNonceCache: memoryStore<string>(NONCE_TTL_MS, now),
  } satisfies Pick<ClientOptions, "protectedResourceMetadataCache" | "authorizationServerMetadataCache" | "dpopNonceCache">;
}
export type CertifiedOAuthCaches = ReturnType<typeof certifiedOAuthCaches>;

export type PrimeOutcome = "ready" | "primed" | "skipped" | "failed";
/** `late` when a start stopped waiting for readying, which then carries on in the background. */
export type PrimeWait = PrimeOutcome | "late";

/**
 * Waits for readying no longer than `ms`. A Certified that is slow to answer the nonce request would be
 * just as slow with the PAR, so a start does not pay for both: past the limit it goes on, and its PAR
 * fetches what it needs, as it did before readying existed.
 */
export async function primeWithin(readying: Promise<PrimeOutcome>, ms = PRIME_WAIT_MS): Promise<PrimeWait> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">(resolve => { timer = setTimeout(() => resolve("late"), ms); timer.unref?.(); });
  try { return await Promise.race([readying, late]); }
  finally { clearTimeout(timer); }
}
interface PrimerOptions {
  caches: Pick<CertifiedOAuthCaches, "dpopNonceCache">;
  /** The SDK's resolver for Certified's issuer, which fills the shared metadata caches. */
  resolve(signal: AbortSignal): Promise<{ metadata: { issuer: string; pushed_authorization_request_endpoint?: string } }>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Returns `prime()`, which never rejects and runs once at a time. Called with everything cached, it
 * makes no request. It sends nothing of any person's: the nonce request carries no client, no state
 * and no credentials. The outcome is for timing labels and tests, not for deciding anything.
 */
export function certifiedPrimer({ caches, resolve, fetch = globalThis.fetch, timeoutMs = PRIME_TIMEOUT_MS, now = Date.now }: PrimerOptions) {
  let pending: Promise<PrimeOutcome> | undefined;
  let failedAt = Number.NEGATIVE_INFINITY;
  const run = async (): Promise<PrimeOutcome> => {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const { metadata } = await resolve(signal);
      const par = metadata.pushed_authorization_request_endpoint;
      // Only Certified's own PAR endpoint, over HTTPS, is ever asked.
      if (metadata.issuer !== CERTIFIED_ISSUER || !par || !URL.canParse(par)) return "skipped";
      const endpoint = new URL(par);
      if (endpoint.protocol !== "https:" || endpoint.origin !== CERTIFIED_ISSUER || endpoint.username || endpoint.password)
        return "skipped";
      // The SDK keys nonces by the origin it sends to.
      if (caches.dpopNonceCache.get(endpoint.origin)) return "ready";
      const response = await fetch(endpoint.href, {
        method: "POST", body: new URLSearchParams(), redirect: "error", signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      });
      void response.body?.cancel().catch(() => {});
      const nonce = response.headers.get("DPoP-Nonce");
      if (!nonce || !NONCE.test(nonce)) return "failed";
      caches.dpopNonceCache.set(endpoint.origin, nonce);
      return "primed";
    } catch {
      // A sign-in that meets cold caches fetches what it needs itself, as it always has.
      return "failed";
    }
  };
  return (): Promise<PrimeOutcome> => {
    if (now() - failedAt < PRIME_RETRY_AFTER_MS) return Promise.resolve("failed");
    return pending ??= run().then(outcome => {
      if (outcome === "failed") failedAt = now();
      return outcome;
    }).finally(() => { pending = undefined; });
  };
}
