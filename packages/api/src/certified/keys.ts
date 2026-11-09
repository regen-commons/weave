import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, type webcrypto } from "node:crypto";

type JsonWebKey = webcrypto.JsonWebKey;
export interface SigningKey extends JsonWebKey { kid: string; alg: "ES256" | "RS256"; use: "sig" }
export interface SigningMaterial { version: 1; at: SigningKey[]; oidc: SigningKey[]; cookies: string[] }
const id = () => randomBytes(24).toString("base64url");
function generate(algorithm: "ES256" | "RS256"): SigningKey {
  const pair = algorithm === "ES256" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) :
    generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { ...pair.privateKey.export({ format: "jwk" }), kid: id(), alg: algorithm, use: "sig" };
}
/** Explicit provisioning only. The server must never silently generate a new identity. */
export function generateSigningMaterial(): SigningMaterial {
  return { version: 1, at: [generate("ES256")], oidc: [generate("RS256")], cookies: [randomBytes(48).toString("base64url")] };
}
export function parseSigningMaterial(input: unknown): SigningMaterial {
  if (!input || typeof input !== "object") throw new Error("invalid_signing_material");
  const o = input as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.cookies) || !o.cookies.length || o.cookies.length > 3 ||
      o.cookies.some(k => typeof k !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(k))) throw new Error("invalid_signing_material");
  const seen = new Set<string>();
  function parseKeys(value: unknown, alg: SigningKey["alg"]): SigningKey[] {
    if (!Array.isArray(value) || !value.length || value.length > 3) throw new Error("invalid_signing_material");
    return value.map(v => {
      if (!v || typeof v !== "object") throw new Error("invalid_signing_material");
      const k = v as SigningKey;
      if (k.alg !== alg || k.use !== "sig" || !/^[A-Za-z0-9_-]{32}$/.test(k.kid) || seen.has(k.kid) || !k.d)
        throw new Error("invalid_signing_material");
      try {
        const key = createPrivateKey({ key: k, format: "jwk" });
        if (alg === "ES256" ? key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1" :
          key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw Error();
      } catch { throw new Error("invalid_signing_material"); }
      seen.add(k.kid);
      return k;
    });
  }
  return { version: 1, at: parseKeys(o.at, "ES256"), oidc: parseKeys(o.oidc, "RS256"), cookies: o.cookies as string[] };
}
export function publicKeys(keys: SigningKey[]): (JsonWebKey & { kid: string })[] {
  return keys.map(key => ({ ...createPublicKey(createPrivateKey({ key, format: "jwk" })).export({ format: "jwk" }), kid: key.kid, alg: key.alg, use: key.use }));
}
/** Retain old keys until all instances reload and issued tokens/cookies have expired. */
export function rotateSigningMaterial(current: SigningMaterial): SigningMaterial {
  const checked = parseSigningMaterial(current);
  if (checked.at.length >= 3 || checked.oidc.length >= 3 || checked.cookies.length >= 3)
    throw new Error("retire_old_keys_before_rotation");
  const fresh = generateSigningMaterial();
  return { version: 1, at: [...fresh.at, ...checked.at], oidc: [...fresh.oidc, ...checked.oidc], cookies: [...fresh.cookies, ...checked.cookies] };
}
