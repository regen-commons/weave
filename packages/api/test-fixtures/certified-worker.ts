// Integration-only process. Never imported by the production server.
import { createServer } from "node:http";
import postgres from "postgres";
import { createCipher } from "../src/certified/crypto.ts";
import { AuthStore } from "../src/certified/store.ts";
import { createBridge } from "../src/certified/bridge.ts";
import { identitySubject } from "../src/certified/identity.ts";
const config = JSON.parse(process.env.WEAVE_BRIDGE_FIXTURE_CONFIG ?? "null");
if (!config || new URL(config.database).hostname !== "127.0.0.1" || new URL(config.issuer).hostname !== "127.0.0.1") throw Error("fixture_loopback_required");
const sql = postgres(config.database, { max: 6, onnotice: () => {} });
const cipher = createCipher({ active: "test", keys: { test: Buffer.from(config.key, "base64url") }, lookup: Buffer.from(config.lookup, "base64url") }, config.issuer);
const store = new AuthStore(sql, cipher);
const handler = await createBridge({ issuer: config.issuer, clientId: "weave-test", clientSecret: config.secret,
  redirectUri: "http://127.0.0.1:1/callback", loopbackTest: true }, store, {
  metadata: { scope: "atproto" }, jwks: { keys: [] },
  async authorize(state) { return new URL(`https://certified.example.test/authorize?state=${state}`); },
  async callback(params) {
    if (params.get("code") !== "synthetic-code") throw Error("fixture_code_required");
    return { state: params.get("state"), subject: identitySubject("https://certified.one", "did:plc:synthetic", { did: "did:plc:synthetic" }) };
  },
});
const server = createServer(handler);
server.listen(Number(new URL(config.issuer).port), "127.0.0.1", () => process.send?.({ ready: true }));
process.on("message", async message => {
  if (message !== "stop") return;
  server.closeAllConnections();
  server.close();
  await sql.end();
  process.exit(0);
});
