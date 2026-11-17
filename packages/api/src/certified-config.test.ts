import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { readConfiguration } from "./certified/config.ts";
import { validateConfig } from "./certified/bridge.ts";
import { recoveryOrigin, WEAVE_APP_ORIGIN } from "./certified/bridge-config.ts";

test("runtime requires HTTPS, strong key material and verified database TLS", () => {
  const config = { issuer:"https://identity.example.test",clientId:"weave",clientSecret:"x".repeat(40),redirectUri:"https://database.example.test/auth/v1/callback" };
  validateConfig(config);
  assert.throws(()=>validateConfig({...config,issuer:"http://identity.example.test"}));
  assert.throws(()=>validateConfig({...config,issuer:"https://identity.example.test/changed"}));
  assert.throws(()=>validateConfig({...config,redirectUri:"https://user:pass@example.test/callback"}));
  assert.throws(()=>validateConfig({...config,clientSecret:"short"}));
  const env = {
    WEAVE_AUTH_ISSUER:config.issuer,WEAVE_AUTH_CLIENT_ID:config.clientId,WEAVE_AUTH_CLIENT_SECRET:config.clientSecret,
    WEAVE_AUTH_REDIRECT_URI:config.redirectUri, WEAVE_AUTH_DATABASE_URL:"postgres://fixture:fixture@database.example.test/auth",
    WEAVE_AUTH_ENCRYPTION_KEYS:JSON.stringify({active:"one",keys:{one:randomBytes(32).toString("base64url")},lookup:randomBytes(32).toString("base64url")}),
  };
  assert.equal(readConfiguration(env).config.issuer,config.issuer);
  assert.equal(readConfiguration({...env,PORT:"10000"}).ingress,"loopback");
  assert.equal(readConfiguration({...env,WEAVE_AUTH_INGRESS:"render",PORT:"10000"}).port,10000);
  assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_INGRESS:"render"}));
  assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_INGRESS:"public"}));
  assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_DATABASE_URL:env.WEAVE_AUTH_DATABASE_URL+"?sslmode=disable"}));
  assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_ENCRYPTION_KEYS:"{}"}));
  assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_PORT:"0"}));
  assert.throws(()=>readConfiguration({}));
});
test("expired sign-ins return to one exact HTTPS Weave origin, production unless configured", () => {
  const config = { issuer:"https://identity.example.test",clientId:"weave",clientSecret:"x".repeat(40),redirectUri:"https://database.example.test/auth/v1/callback" };
  const env = {
    WEAVE_AUTH_ISSUER:config.issuer,WEAVE_AUTH_CLIENT_ID:config.clientId,WEAVE_AUTH_CLIENT_SECRET:config.clientSecret,
    WEAVE_AUTH_REDIRECT_URI:config.redirectUri, WEAVE_AUTH_DATABASE_URL:"postgres://fixture:fixture@database.example.test/auth",
    WEAVE_AUTH_ENCRYPTION_KEYS:JSON.stringify({active:"one",keys:{one:randomBytes(32).toString("base64url")},lookup:randomBytes(32).toString("base64url")}),
  };
  // A preview bridge that omits the setting sends expired attempts to production Weave.
  assert.equal(recoveryOrigin(readConfiguration(env).config), WEAVE_APP_ORIGIN);
  assert.equal(WEAVE_APP_ORIGIN, "https://weave.regencommons.com");
  const preview = "https://weave-preview.example.test";
  assert.equal(recoveryOrigin(readConfiguration({...env,WEAVE_AUTH_APP_ORIGIN:preview}).config), preview);
  for (const appOrigin of ["http://weave.example.test", `${preview}/`, `${preview}/settings`, "https://user:pass@weave.example.test",
    "http://127.0.0.1:5173", "not-an-origin"])
    assert.throws(()=>readConfiguration({...env,WEAVE_AUTH_APP_ORIGIN:appOrigin}), appOrigin);
  validateConfig({...config,issuer:"http://127.0.0.1:4531",appOrigin:"http://127.0.0.1:5173",loopbackTest:true});
});
