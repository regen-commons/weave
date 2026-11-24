/**
 * Takes one browser round trip out of a sign-in start (measured 330 to 790 ms, 24 November 2026).
 *
 * A start used to send the browser to Supabase's `/auth/v1/authorize`, which only answers with a
 * redirect to the identity bridge's `/auth`. That answer sets no sign-in cookie: the one cookie on it
 * is Cloudflare's own `__cf_bm`. Supabase keeps the flow under the state it puts in the redirect, and
 * the PKCE challenge Weave sent. So `/api/sign-in` can ask for the same URL itself and send the
 * browser straight to the bridge.
 *
 * The answer is used only when it is exactly what the browser would have been sent: a 302 or 303 to
 * the configured bridge's `/auth`, with a single `redirect_to` equal to this attempt's own callback
 * (which carries its state). Anything else, a Cloudflare challenge, an error, a refusal or no answer
 * within the time limit, gives the browser Supabase's own URL, as before, and the instance then lets
 * browsers go to Supabase themselves for a minute. The request carries no cookie, nothing of the
 * browser's and nothing set on the answer reaches the browser.
 */

/** How long a start waits for Supabase. Measured at about 120 to 170 ms; past this the browser goes itself. */
export const SUPABASE_DIRECT_TIMEOUT_MS = 450;
/**
 * After a timeout or any answer that could not be used, the instance sends browsers to Supabase themselves
 * for this long, so a slow or refusing Supabase costs one start its wait, not every start.
 */
export const SUPABASE_DIRECT_PAUSE_MS = 60_000;

export type DirectOutcome = "direct" | "fallback";

/**
 * Returns `toBridge(authorizeUrl, callback)`, which resolves to the bridge address to send the browser
 * to, or undefined when the browser should go to Supabase itself. It never rejects. With no bridge
 * configured it asks nothing.
 */
export function supabaseDirect(bridge: string | undefined, request: typeof fetch = fetch, timeoutMs = SUPABASE_DIRECT_TIMEOUT_MS,
  now: () => number = Date.now) {
  let pausedUntil = Number.NEGATIVE_INFINITY;
  const ask = async (authorizeUrl: string, callback: string): Promise<string | undefined> => {
    try {
      // Supabase's own callback, where the bridge must send the code: from the URL Weave built itself.
      const supabaseCallback = `${new URL(authorizeUrl).origin}/auth/v1/callback`;
      const response = await request(authorizeUrl, {
        method: "GET", redirect: "manual", credentials: "omit", cache: "no-store",
        headers: { Accept: "text/html" }, signal: AbortSignal.timeout(timeoutMs),
      });
      // Nothing in the answer is read but its status and Location; its cookies go nowhere.
      void response.body?.cancel().catch(() => {});
      if (response.status !== 302 && response.status !== 303) return undefined;
      const location = response.headers.get("location");
      if (!location || !URL.canParse(location)) return undefined;
      const target = new URL(location);
      if (target.protocol !== "https:" || target.origin !== bridge || target.pathname !== "/auth" ||
          target.username || target.password || target.hash) return undefined;
      // The attempt's own return address, state included, exactly once, and the request Weave's bridge
      // client always makes. Anything else, such as a misconfigured provider, goes the old way.
      const one = (name: string) => { const values = target.searchParams.getAll(name); return values.length === 1 ? values[0] : undefined; };
      if (one("redirect_to") !== callback || one("redirect_uri") !== supabaseCallback || one("response_type") !== "code" ||
          !one("client_id") || !one("state")) return undefined;
      return target.href;
    } catch {
      return undefined;
    }
  };
  return async (authorizeUrl: string, callback: string): Promise<string | undefined> => {
    if (!bridge || now() < pausedUntil) return undefined;
    const target = await ask(authorizeUrl, callback);
    if (!target) pausedUntil = now() + SUPABASE_DIRECT_PAUSE_MS;
    return target;
  };
}
