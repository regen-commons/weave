import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/** Wrapping keys come from deployment secrets, never from the database they protect. */
export interface EncryptionKeys {
  active: string;
  keys: Readonly<Record<string, Buffer>>;
  lookup: Buffer;
}
export function createCipher(keys: EncryptionKeys, issuer: string) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(keys.active) || !keys.keys[keys.active] || keys.lookup.length !== 32 ||
      Object.entries(keys.keys).some(([id, key]) => !/^[a-zA-Z0-9_-]{1,40}$/.test(id) || key.length !== 32))
    throw new Error("invalid_encryption_keys");
  const aad = (namespace: string, id: string) => Buffer.from(JSON.stringify([1, issuer, namespace, id]));
  return {
    index(namespace: string, value: string): string {
      return createHmac("sha256", keys.lookup).update(aad(namespace, value)).digest("hex");
    },
    seal(namespace: string, id: string, value: unknown): string {
      const serialized = JSON.stringify(value);
      if (!serialized || Buffer.byteLength(serialized) > 256 * 1024) throw new Error("invalid_state_payload");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keys.keys[keys.active]!, iv);
      cipher.setAAD(aad(namespace, id));
      const encrypted = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
      return ["1", keys.active, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
    },
    open(namespace: string, id: string, envelope: string): unknown {
      try {
        const parts = envelope.split(".");
        if (parts.length !== 5 || parts[0] !== "1") throw Error();
        const [, keyId, nonce, tag, payload] = parts;
        const key = keys.keys[keyId!];
        if (!key || !/^[A-Za-z0-9_-]{16}$/.test(nonce!) || !/^[A-Za-z0-9_-]{22}$/.test(tag!) ||
            !/^[A-Za-z0-9_-]+$/.test(payload!) || payload!.length > 350000) throw Error();
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce!, "base64url"), { authTagLength: 16 });
        decipher.setAAD(aad(namespace, id));
        decipher.setAuthTag(Buffer.from(tag!, "base64url"));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload!, "base64url")), decipher.final()]).toString("utf8")) as unknown;
      } catch { throw new Error("invalid_encrypted_state"); }
    },
  };
}
export type StateCipher = ReturnType<typeof createCipher>;

export function cipherFromSecret(serialized: string, issuer: string): StateCipher {
  const input: unknown = JSON.parse(serialized);
  if (!input || typeof input !== "object") throw new Error("invalid_encryption_keys");
  const record = input as Record<string, unknown>;
  if (typeof record.active !== "string" || !record.keys || typeof record.keys !== "object" ||
      Array.isArray(record.keys) || typeof record.lookup !== "string") throw new Error("invalid_encryption_keys");
  const decode = (value: unknown) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("invalid_encryption_keys");
    return Buffer.from(value, "base64url");
  };
  const keys = Object.fromEntries(Object.entries(record.keys).map(([id, value]) => [id, decode(value)]));
  return createCipher({ active: record.active, keys, lookup: decode(record.lookup) }, issuer);
}
