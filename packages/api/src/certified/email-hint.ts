import { randomBytes } from "node:crypto";
import { createCipher } from "./crypto.ts";

const lifetimeSeconds = 120;
// Hints from the older form cannot authorize disclosure in a browser redirect.
const purpose = "certified:login_hint:redirect";

export function signInEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim();
  return Buffer.byteLength(email) <= 254 && /^[^\p{Cc}\s@]+@[^\p{Cc}\s@]+\.[^\p{Cc}\s@]+$/u.test(email) ? email : undefined;
}

/** A short-lived hint, shared only between Weave and its Certified bridge. */
export function certifiedEmailHints(secret: string | undefined) {
  if (!secret) return undefined;
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw Error("invalid_email_hint_key");
  const key = Buffer.from(secret, "base64url");
  const cipher = createCipher({ active: "v1", keys: { v1: key }, lookup: key }, "weave:certified");
  return {
    seal(email: string): string {
      return cipher.seal(purpose, "email", {
        email,
        id: randomBytes(32).toString("base64url"),
        expires: Date.now() + lifetimeSeconds * 1000,
      });
    },
    open(hint: unknown): { email: string; id: string } | undefined {
      if (typeof hint !== "string" || hint.length > 2500) return undefined;
      try {
        const data = cipher.open(purpose, "email", hint) as Record<string, unknown>;
        const email = signInEmail(data.email);
        if (email && typeof data.id === "string" && /^[A-Za-z0-9_-]{43}$/.test(data.id) &&
            typeof data.expires === "number" && data.expires > Date.now()) return { email, id: data.id };
      } catch { /* An untrusted or stale hint falls back to Certified's email screen. */ }
    },
    lifetimeSeconds,
  };
}
