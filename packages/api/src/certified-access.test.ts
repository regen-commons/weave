import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { createCipher } from "./certified/crypto.ts";
import { postgresSignInStore } from "./sign-in-store.ts";
import { createSupabaseAccountProvider } from "./account-provider.ts";
import { createAccountHandlers } from "./account.ts";

// Run only against an explicitly marked disposable Supabase database, after applying
// the website's private-saving migration and both candidate schemas. No schema resets.
const database = process.env.WEAVE_PRIVATE_TEST_DATABASE_URL;
let sql: postgres.Sql;
before(async () => {
  if (!database) return;
  const url = new URL(database);
  assert.equal(url.hostname, "127.0.0.1");
  sql = postgres(database, { max: 4, onnotice: () => {}, connect_timeout: 5 });
  const rows = await sql`select shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()`;
  assert.equal(rows[0]?.marker, "weave-certified-disposable-test");
});
after(async () => { if (sql) await sql.end(); });
const integration = (name: string, run: () => Promise<void>) => test(name, { skip: !database, timeout: 120000 }, run);
const rollback = Symbol("rollback");
async function isolated(run: (tx: postgres.TransactionSql) => Promise<void>) {
  try { await sql.begin(async tx => { await run(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
}
interface ActorOptions { provider?: string; subject?: string; email?: boolean; anonymous?: boolean; banned?: boolean; expired?: boolean; noIdentity?: boolean }
async function actor(tx: postgres.TransactionSql, options: ActorOptions = {}) {
  const id = randomUUID(), session = randomUUID();
  await tx`insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,is_anonymous,banned_until,raw_user_meta_data,created_at,updated_at)
    values(${id},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${options.email ? `${id}@example.test` : null},
      ${options.email ? new Date() : null},${options.anonymous ?? false},${options.banned ? new Date(Date.now()+3600000) : null},
      ${tx.json({ provider: "custom:certified", sub: "https://certified.one|did:plc:forged-metadata" })},now(),now())`;
  // GoTrue initializes these legacy nullable string columns to empty strings.
  await tx`update auth.users set confirmation_token='',recovery_token='',email_change='',email_change_token_new='',
    email_change_token_current='',reauthentication_token='',phone_change='',phone_change_token='' where id=${id}`;
  if (!options.noIdentity) await tx`insert into auth.identities(id,user_id,provider,provider_id,identity_data,created_at,updated_at)
    values(${randomUUID()},${id},${options.provider ?? "custom:certified"},${options.subject ?? `https://certified.one|did:plc:${id}`},${tx.json({ sub: id })},now(),now())`;
  await tx`insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
    values(${session},${id},now(),now(),${options.expired ? new Date(Date.now()-1000) : null})`;
  return { id, session };
}
async function asActor(tx: postgres.TransactionSql, user: { id: string; session: string }, override = {}) {
  const claims = { sub: user.id, role: "authenticated", session_id: user.session, is_anonymous: false,
    exp: Math.floor(Date.now()/1000)+3600, ...override };
  await tx`set local role authenticated`;
  await tx`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
}
integration("Certified access requires trusted identity and a current, unbanned, nonanonymous session", async () => {
  for (const options of [
    {}, { email: true }, { noIdentity: true, email: true }, { provider: "email", email: true },
    { subject: "https://attacker.example|did:plc:test" }, { subject: "https://certified.one|not-a-did" },
    { anonymous: true }, { banned: true }, { expired: true },
  ]) await isolated(async tx => {
    const user = await actor(tx, options); await asActor(tx, user);
    const allowed = Object.keys(options).length === 0 || (Object.keys(options).length === 1 && "email" in options);
    assert.equal((await tx`select weave.account_access() allowed`)[0]?.allowed, allowed, JSON.stringify(options));
  });
  for (const override of [{ exp: 1 }, { session_id: randomUUID() }, { is_anonymous: true }, { role: "anon" }])
    await isolated(async tx => {
      const user = await actor(tx); await asActor(tx, user, override);
      assert.equal((await tx`select weave.account_access() allowed`)[0]?.allowed, false);
    });
});
integration("private save, retry, reload and RLS keep the same initiative under its Certified owner", async () => {
  const document = JSON.parse(await readFile(new URL("./test-data/account.json", import.meta.url), "utf8"));
  await isolated(async tx => {
    const owner = await actor(tx), other = await actor(tx), id = randomUUID(), request = randomUUID();
    await asActor(tx, owner);
    const save = () => tx`select weave.save_initiative(${id},0,${request},${tx.json(document)}) saved`;
    const first = (await save())[0]!.saved;
    assert.deepEqual((await save())[0]!.saved, first);
    assert.equal(first.id, id); assert.equal(first.revision, 1);
    assert.deepEqual((await tx`select weave.load_initiative(${id}) saved`)[0]!.saved, first);
    assert.equal((await tx`select visibility from weave.initiatives where id=${id}`)[0]!.visibility, "private");
    await asActor(tx, other);
    assert.deepEqual((await tx`select weave.list_initiatives() items`)[0]!.items, []);
    assert.equal((await tx`select * from weave.initiatives where id=${id}`).length, 0);
    await assert.rejects(tx.savepoint(async sp => { await sp`select weave.load_initiative(${id})`; }), { code: "PT404" });
    await assert.rejects(tx.savepoint(async sp => { await sp`select weave.save_initiative(${id},1,${randomUUID()},${sp.json(document)})`; }), { code: "PT404" });
    await asActor(tx, owner);
    const updated = (await tx`select weave.save_initiative(${id},1,${randomUUID()},${tx.json(document)}) saved`)[0]!.saved;
    assert.equal(updated.id, id); assert.equal(updated.revision, 2);
    await assert.rejects(tx.savepoint(async sp => { await sp`select weave.save_initiative(${id},1,${randomUUID()},${sp.json(document)})`; }), { code: "PT409" });
  });
});
integration("email-only sessions cannot read or save, and revocation removes access immediately", async () => {
  const document = JSON.parse(await readFile(new URL("./test-data/account.json", import.meta.url), "utf8"));
  await isolated(async tx => {
    const user = await actor(tx, { email: true, noIdentity: true }); await asActor(tx, user);
    await assert.rejects(tx.savepoint(async sp => { await sp`select weave.list_initiatives()`; }), { code: "PT401" });
    await assert.rejects(tx.savepoint(async sp => { await sp`select weave.save_initiative(${randomUUID()},0,${randomUUID()},${sp.json(document)})`; }), { code: "PT401" });
    assert.equal((await tx`select * from weave.initiatives`).length, 0);
  });
  await isolated(async tx => {
    const user = await actor(tx); await asActor(tx, user);
    assert.equal((await tx`select weave.account_access() allowed`)[0]!.allowed, true);
    await tx`reset role`;
    await tx`delete from auth.sessions where id=${user.session}`;
    await asActor(tx, user);
    assert.equal((await tx`select weave.account_access() allowed`)[0]!.allowed, false);
  });
});
test("real local Auth and PostgREST support the same session for private Save and Load", {
  skip: !database || !process.env.WEAVE_PRIVATE_TEST_API_URL, timeout: 120000,
}, async () => {
  const api = process.env.WEAVE_PRIVATE_TEST_API_URL!, key = process.env.WEAVE_PRIVATE_TEST_PUBLISHABLE_KEY!, secret = process.env.WEAVE_PRIVATE_TEST_JWT_SECRET!;
  assert.equal(new URL(api).hostname, "127.0.0.1");
  assert.ok(key && secret);
  const user = await sql.begin(tx => actor(tx));
  try {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: user.id, session_id: user.session, role: "authenticated", aud: "authenticated",
      iss: `${api}/auth/v1`, is_anonymous: false, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, aal: "aal1" })).toString("base64url");
    const unsigned = `${header}.${payload}`, token = `${unsigned}.${createHmac("sha256",secret).update(unsigned).digest("base64url")}`;
    const auth = await fetch(`${api}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!auth.ok) { const error = await auth.json() as { error_code?: string }; throw Error(`local_auth_${auth.status}_${error.error_code ?? "unknown"}`); }
    const access = await fetch(`${api}/rest/v1/rpc/account_access`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Profile": "weave" }, body: "{}" });
    if (!access.ok) { const error = await access.json() as { code?: string }; throw Error(`local_rest_${access.status}_${error.code ?? "unknown"}`); }
    const handlers = createAccountHandlers({ provider: createSupabaseAccountProvider(api,key) });
    const cookie = `__Host-weave_account=${token}`, origin = "https://weave.example.test";
    const get = (query = "") => handlers.GET(new Request(`${origin}/api/account${query}`, { headers: { Cookie: cookie } }));
    const status = await get(); assert.equal(status.status, 200);
    const account = await status.json() as { user: { id: string; email: string | null }; items: unknown[] };
    assert.equal(account.user.id, user.id); assert.equal(account.user.email, null); assert.deepEqual(account.items, []);
    const document = JSON.parse(await readFile(new URL("./test-data/account.json", import.meta.url), "utf8")), id = randomUUID();
    const command = { action: "save", accountId: user.id, id, requestId: randomUUID(), expectedRevision: 0, document };
    const save = () => handlers.POST(new Request(`${origin}/api/account`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(command) }));
    const first = await save(); assert.equal(first.status, 200); const saved = await first.json();
    assert.deepEqual(await (await save()).json(), saved);
    const loaded = await get(`?id=${id}`); assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json() as { saved: unknown }).saved, (saved as { saved: unknown }).saved);
    await sql`delete from auth.sessions where id=${user.session}`;
    const revoked = await get(); assert.equal(revoked.status, 401); assert.match(revoked.headers.get("set-cookie")!, /Max-Age=0/);
  } finally { await sql`delete from auth.users where id=${user.id}`; }
});
integration("app callback state survives connections, is encrypted and one-use, and rejects privileged roles", async () => {
  const user = `weave_test_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("base64url");
  await sql.unsafe(`create role ${user} login password '${password}'`);
  await sql.unsafe(`grant weave_app_auth_runtime to ${user}`);
  const url = new URL(database!); url.username = user; url.password = password;
  const first = postgres(url.href, { max: 2 }), second = postgres(url.href, { max: 2 });
  const cipher = createCipher({ active: "test", keys: { test: randomBytes(32) }, lookup: randomBytes(32) }, "https://weave.example.test");
  const id = randomBytes(32).toString("base64url"), attempt = { state: randomBytes(32).toString("base64url"), verifier: randomBytes(32).toString("base64url"), returnTo: "/settings" };
  try {
    const a = postgresSignInStore(first, cipher), b = postgresSignInStore(second, cipher);
    await assert.rejects(postgresSignInStore(sql, cipher).put(id, attempt), /restricted_sign_in_role_required/);
    await a.put(id, attempt);
    const rows = await sql`select * from weave_auth.app_signins where key_hash=${cipher.index("app:sign_in",id)}`;
    assert.ok(!JSON.stringify(rows).includes(id)); assert.ok(!JSON.stringify(rows).includes(attempt.verifier));
    const taken = await Promise.all([a.take(id), b.take(id)]);
    assert.equal(taken.filter(Boolean).length, 1); assert.deepEqual(taken.find(Boolean), attempt);
    await a.put(id, attempt);
    await sql`update weave_auth.app_signins set expires_at=now()-interval '1 second' where key_hash=${cipher.index("app:sign_in",id)}`;
    assert.equal(await b.take(id), undefined);
    await assert.rejects(first`select * from weave_auth.settings`);
    await assert.rejects(first`select * from weave_auth.records`);
    await assert.rejects(first`select * from auth.users`);
    await assert.rejects(first`select * from weave.initiatives`);
  } finally {
    await first.end(); await second.end();
    await sql`delete from weave_auth.app_signins where key_hash=${cipher.index("app:sign_in",id)}`;
    await sql.unsafe(`drop role ${user}`);
  }
});
