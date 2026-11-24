import postgres from "postgres";
import { createSupabaseAccountProvider } from "./account-provider.ts";
import { WEAVE_APP_ORIGIN, WEAVE_BRIDGE_ORIGIN } from "./certified/bridge-config.ts";
import { cipherFromSecret } from "./certified/crypto.ts";
import { certifiedEmailHints } from "./certified/email-hint.ts";
import { postgresSignInStore } from "./sign-in-store.ts";

export function accountConfiguration(env: NodeJS.ProcessEnv) {
  if (env.WEAVE_ACCOUNTS_ENABLED !== "true") return null;
  const required = (name: string) => { if (!env[name]) throw Error("accounts_not_configured"); return env[name]!; };
  const app = new URL(required("WEAVE_APP_ORIGIN"));
  const supabase = new URL(required("WEAVE_SUPABASE_URL"));
  const local = env.WEAVE_LOCAL_AUTH === "true" && !env.VERCEL && env.NODE_ENV !== "production";
  const permitted = (url: URL) => url.origin !== "null" && !url.username && !url.password &&
    (url.protocol === "https:" || (local && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)));
  if (!permitted(app) || app.origin !== env.WEAVE_APP_ORIGIN || !permitted(supabase) || supabase.origin !== env.WEAVE_SUPABASE_URL)
    throw Error("invalid_account_origin");
  const key = required("WEAVE_SUPABASE_PUBLISHABLE_KEY");
  if (!key.startsWith("sb_publishable_")) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(key.split(".")[1]!, "base64url").toString()).role; } catch {}
    if (!local || role !== "anon") throw Error("publishable_key_required");
  }
  const database = new URL(required("WEAVE_SIGN_IN_DATABASE_URL"));
  if (!["postgres:", "postgresql:"].includes(database.protocol) || database.searchParams.has("ssl") || database.searchParams.has("sslmode"))
    throw Error("invalid_sign_in_database");
  const cipher = cipherFromSecret(required("WEAVE_SIGN_IN_ENCRYPTION_KEYS"), app.origin);
  // Only production knows its bridge without being told. Another Weave names its own, or wakes none.
  // Waking is a courtesy with no part in who may sign in, so a value that is not an exact origin wakes
  // no bridge and leaves accounts as they are; it never switches them off.
  const named = env.WEAVE_CERTIFIED_BRIDGE_ORIGIN || (app.origin === WEAVE_APP_ORIGIN ? WEAVE_BRIDGE_ORIGIN : undefined);
  const bridge = named && URL.canParse(named) && permitted(new URL(named)) && new URL(named).origin === named ? named : undefined;
  return { origin: app.origin, bridge, supabase: supabase.origin, key, database, cipher, databaseCa: env.WEAVE_DATABASE_CA_PEM,
    secureCookies: app.protocol === "https:", emailHints: certifiedEmailHints(env.WEAVE_CERTIFIED_EMAIL_HINT_KEY) };
}
/** How long the bridge stays warm enough that waking it again would only add requests. */
const WAKE_EVERY_MS = 30_000;
/**
 * Wakes the identity bridge before a sign-in needs it. Its first request after a quiet spell loads its
 * libraries, opens its database and reads its keys, which took the first redirect of a sign-in several
 * seconds. This asks for its `/warm` address, which starts all of that and readies Certified's metadata
 * and a DPoP nonce, so the step that sends the person to Certified makes one request there, not four.
 * (A bridge without that address still starts, and answers 404.) It sends nothing of the person's,
 * reads nothing back and never fails a sign-in: the bridge works the same without it. One function
 * instance asks at most once in 30 seconds, however many pages ask it to.
 */
export function bridgeWarmer(bridge: string | undefined, request: typeof fetch = fetch, now: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY, pending: Promise<void> | undefined;
  return (): Promise<void> => {
    if (!bridge) return Promise.resolve();
    if (pending) return pending;
    if (now() - last < WAKE_EVERY_MS) return Promise.resolve();
    last = now();
    const wake = (async () => {
      try {
        const response = await request(`${bridge}/warm`, {
          headers: { Accept: "*/*" }, redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(8000),
        });
        // The document is not read. Dropping it is not waited for, so it cannot outlast the limit above.
        void response.body?.cancel().catch(() => {});
      } catch { /* A bridge that cannot be woken is still asked by the sign-in itself. */ }
    })().finally(() => { pending = undefined; });
    return pending = wake;
  };
}
let runtime: ReturnType<typeof createRuntime> | undefined;
function createRuntime(config: NonNullable<ReturnType<typeof accountConfiguration>>) {
  const sql = postgres(config.database.href, { max: 3, connect_timeout: 5, idle_timeout: 10, onnotice: () => {},
    ssl: ["127.0.0.1", "localhost", "[::1]"].includes(config.database.hostname) ? false : {
      rejectUnauthorized: true, ca: config.databaseCa, servername: config.database.hostname,
    },
    connection: { statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 } });
  return { origin: config.origin, secureCookies: config.secureCookies,
    emailHints: config.emailHints,
    warmBridge: bridgeWarmer(config.bridge),
    provider: createSupabaseAccountProvider(config.supabase, config.key),
    store: postgresSignInStore(sql, config.cipher) };
}
export function accountRuntime() {
  if (runtime) return runtime;
  try {
    const config = accountConfiguration(process.env);
    if (!config) return null;
    return runtime = createRuntime(config);
  } catch { return null; }
}
/** What session renewal needs outside /api/account, or null when accounts are off. Shares the cached provider. */
export function renewalSettings() {
  const current = accountRuntime();
  return current ? { provider: current.provider, secureCookies: current.secureCookies } : null;
}
