import postgres from "postgres";
import { createSupabaseAccountProvider } from "./account-provider.ts";
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
  return { origin: app.origin, supabase: supabase.origin, key, database, cipher, databaseCa: env.WEAVE_DATABASE_CA_PEM,
    secureCookies: app.protocol === "https:", emailHints: certifiedEmailHints(env.WEAVE_CERTIFIED_EMAIL_HINT_KEY) };
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
