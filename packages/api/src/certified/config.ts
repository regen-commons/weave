import postgres from "postgres";
import { cipherFromSecret } from "./crypto.ts";
import { certifiedEmailHints } from "./email-hint.ts";
import { validateConfig, type BridgeConfig } from "./bridge.ts";

export function readConfiguration(env: NodeJS.ProcessEnv) {
  const required = (name: string) => { const value=env[name]; if (!value) throw new Error("missing_bridge_configuration"); return value; };
  const config: BridgeConfig = {
    issuer: required("WEAVE_AUTH_ISSUER"), clientId: required("WEAVE_AUTH_CLIENT_ID"),
    clientSecret: required("WEAVE_AUTH_CLIENT_SECRET"), redirectUri: required("WEAVE_AUTH_REDIRECT_URI"),
    emailHints: certifiedEmailHints(env.WEAVE_CERTIFIED_EMAIL_HINT_KEY),
  };
  validateConfig(config);
  const database = new URL(required("WEAVE_AUTH_DATABASE_URL"));
  if (!["postgres:","postgresql:"].includes(database.protocol)) throw new Error("invalid_database_configuration");
  const local = ["127.0.0.1","[::1]","localhost"].includes(database.hostname);
  if (database.searchParams.has("sslmode") || database.searchParams.has("ssl")) throw new Error("database_tls_is_managed");
  const cipher = cipherFromSecret(required("WEAVE_AUTH_ENCRYPTION_KEYS"), config.issuer);
  const ingress = env.WEAVE_AUTH_INGRESS ?? "loopback";
  if (ingress !== "loopback" && ingress !== "render") throw new Error("invalid_bridge_ingress");
  const port = Number(ingress === "render" ? env.PORT : env.WEAVE_AUTH_PORT ?? "4531");
  if (!Number.isInteger(port) || port<1024 || port>65535) throw new Error("invalid_bridge_port");
  return { config, cipher, port, ingress, connect: (max = 8) => postgres(String(database), {
    ssl: local ? false : { rejectUnauthorized: true, ca: env.WEAVE_DATABASE_CA_PEM, servername: database.hostname }, max,
    connect_timeout: 5, idle_timeout: 20, onnotice: () => {},
    connection: { statement_timeout: 10000, idle_in_transaction_session_timeout: 30000 },
  }) };
}
