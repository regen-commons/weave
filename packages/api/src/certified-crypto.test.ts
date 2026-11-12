import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { createCipher } from "./certified/crypto.ts";
import { identitySubject, identityClaims } from "./certified/identity.ts";
import { generateSigningMaterial, parseSigningMaterial, publicKeys, rotateSigningMaterial } from "./certified/keys.ts";

test("encrypted state survives key rotation and rejects swapped rows, issuers and corruption", () => {
  const k1 = randomBytes(32), k2 = randomBytes(32), lookup = randomBytes(32);
  const first = createCipher({ active: "one", keys: { one: k1 }, lookup }, "https://auth.example.test");
  const next = createCipher({ active: "two", keys: { one: k1, two: k2 }, lookup }, "https://auth.example.test");
  const value = { secret: "synthetic-refresh-token" }, sealed = first.seal("session", "id", value);
  assert.ok(!sealed.includes(value.secret));
  assert.deepEqual(next.open("session", "id", sealed), value);
  assert.equal(first.index("state", "id"), next.index("state", "id"));
  for (const [ns, id] of [["state", "id"], ["session", "another"]]) assert.throws(() => next.open(ns!, id!, sealed));
  assert.throws(() => next.open("session", "id", sealed.slice(0, -4)));
  const shortenedTag = sealed.split(".");
  shortenedTag[3] = Buffer.from(shortenedTag[3]!, "base64url").subarray(0, 4).toString("base64url");
  assert.throws(() => next.open("session", "id", shortenedTag.join(".")));
  assert.throws(() => createCipher({ active: "one", keys: { one: k1 }, lookup }, "https://other.example.test").open("session", "id", sealed));
});
test("identity projection never carries email and rejects unproven identities", () => {
  const did = "did:plc:synthetic";
  const subject = identitySubject("https://certified.one", did, { did, email: "fixture@example.invalid", email_verified: true });
  assert.deepEqual(identityClaims(subject), { sub: subject });
  assert.throws(() => identitySubject("https://other.invalid", did, { did }));
  assert.throws(() => identitySubject("https://certified.one", did, { did: "did:plc:other" }));
  assert.throws(() => identityClaims("https://other.invalid|" + did));
});
test("signing keys validate, persist and rotate without publishing private material", () => {
  const original = generateSigningMaterial(), restored = parseSigningMaterial(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  const rotated = rotateSigningMaterial(restored), old = original.oidc[0]!;
  const data = Buffer.from("synthetic-token"), signature = sign("sha256", data, createPrivateKey({ key: old, format: "jwk" }));
  const published = publicKeys(rotated.oidc);
  assert.ok(published.every(k => !k.d && !k.p && !k.q));
  assert.ok(verify("sha256", data, createPublicKey({ key: published.find(k => k.kid === old.kid)!, format: "jwk" }), signature));
  assert.equal(rotated.cookies[1], original.cookies[0]);
  assert.throws(() => parseSigningMaterial({ ...original, oidc: publicKeys(original.oidc) }));
  assert.throws(() => parseSigningMaterial({ ...original, cookies: ["short"] }));
});
