import { createPublicKey, randomBytes } from "node:crypto";
import { get } from "node:http";
import { isDeepStrictEqual } from "node:util";
import { readConfiguration } from "./config.ts";
import type { BridgeConfig } from "./bridge.ts";
import { publicKeys, type SigningKey, type SigningMaterial } from "./keys.ts";
import { assertBridgeRuntimeRole } from "./runtime-access.ts";
import { AuthStore } from "./store.ts";

const paths = ["/.well-known/openid-configuration", "/jwks", "/client-metadata.json", "/at-jwks.json"] as const;
type ProbePath = typeof paths[number];
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Only loopback is contacted. No redirect, caller URL, credential or cookie is sent. */
function readPublishedJson(port: number, host: string, path: ProbePath): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get({ hostname: "127.0.0.1", port, path, agent: false,
      headers: { Host: host, "X-Forwarded-Proto": "https" }, signal: AbortSignal.timeout(3000) }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(Error("bridge_not_ready")); return; }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65536) { response.destroy(); reject(Error("bridge_not_ready")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(Error("bridge_not_ready")); }
      });
      response.on("error", () => reject(Error("bridge_not_ready")));
      response.on("aborted", () => reject(Error("bridge_not_ready")));
    });
    request.on("error", () => reject(Error("bridge_not_ready")));
  });
}

function matchingKeys(value: unknown, expected: SigningKey[]): boolean {
  const keys = record(value)?.keys;
  if (!Array.isArray(keys) || keys.length !== expected.length) return false;
  const seen = new Set<string>();
  return keys.every(input => {
    const key = record(input), known = expected.find(k => k.kid === key?.kid);
    if (!key || !known || seen.has(known.kid) ||
      ["d", "p", "q", "dp", "dq", "qi", "oth", "k"].some(name => Object.hasOwn(key, name)) ||
      (key.alg !== undefined && key.alg !== known.alg) || (key.use !== undefined && key.use !== "sig")) return false;
    seen.add(known.kid);
    try {
      const actual = createPublicKey({ key, format: "jwk" }).export({ format: "jwk" });
      const wanted = createPublicKey({ key: publicKeys([known])[0]!, format: "jwk" }).export({ format: "jwk" });
      return isDeepStrictEqual(actual, wanted);
    } catch { return false; }
  });
}

/** Check published identity scope and both key sets, including a stale worker after rotation. */
export async function checkPublishedBridge(config: BridgeConfig, port: number, signing: SigningMaterial): Promise<void> {
  const [discovery, oidcKeys, metadata, atKeys] = await Promise.all(
    paths.map(path => readPublishedJson(port, new URL(config.issuer).host, path)));
  const oidc = record(discovery), at = record(metadata);
  if (oidc?.issuer !== config.issuer || oidc?.authorization_endpoint !== `${config.issuer}/auth` ||
      oidc?.token_endpoint !== `${config.issuer}/token` || oidc?.jwks_uri !== `${config.issuer}/jwks` ||
      !isDeepStrictEqual(oidc?.scopes_supported, ["openid"]) ||
      at?.client_id !== `${config.issuer}/client-metadata.json` || at?.scope !== "atproto" ||
      at?.jwks_uri !== `${config.issuer}/at-jwks.json` ||
      !isDeepStrictEqual(at?.redirect_uris, [`${config.issuer}/at/callback`]) ||
      at?.token_endpoint_auth_method !== "private_key_jwt" || at?.dpop_bound_access_tokens !== true ||
      !matchingKeys(oidcKeys, signing.oidc) || !matchingKeys(atKeys, signing.at))
    throw new Error("bridge_not_ready");
}

export async function checkCertifiedReadiness(env: NodeJS.ProcessEnv): Promise<void> {
  const { config, cipher, port, connect } = readConfiguration(env), sql = connect();
  const store = new AuthStore(sql, cipher), probeId = randomBytes(32).toString("base64url");
  try {
    await assertBridgeRuntimeRole(sql);
    const signing = await store.signingMaterial();
    // A read-only connection is not sufficient for OAuth's durable, single-use state.
    try {
      await store.put("ops:readiness", probeId, { ready: true }, 30);
      if ((await store.take("ops:readiness", probeId))?.ready !== true) throw Error("bridge_not_ready");
    } finally { await store.remove("ops:readiness", probeId); }
    await checkPublishedBridge(config, port, signing);
  } finally { await sql.end({ timeout: 5 }); }
}
