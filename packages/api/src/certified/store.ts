import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";
import type { StateCipher } from "./crypto.ts";
import { parseSigningMaterial, type SigningMaterial } from "./keys.ts";

type Database = postgres.Sql | postgres.TransactionSql;
const MAX_TTL = 86400;
// Match oidc-provider's grantable models. An Interaction can reference the old
// grant while switching accounts; logout must revoke tokens without deleting it.
const grantable = new Set(["AccessToken", "AuthorizationCode", "RefreshToken", "DeviceCode", "BackchannelAuthenticationRequest", "PreAuthorizedCode"]
  .map(model => `oidc:${model}`));
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_stored_state");
  return value as Record<string, unknown>;
}
/** Every deployment instance shares this store. Async context keeps nested SDK locks on one transaction. */
export class AuthStore {
  private readonly transactions = new AsyncLocalStorage<postgres.TransactionSql>();
  private readonly sql: postgres.Sql;
  private readonly cipher: StateCipher;
  constructor(sql: postgres.Sql, cipher: StateCipher) { this.sql = sql; this.cipher = cipher; }
  private database(): Database { return this.transactions.getStore() ?? this.sql; }
  private key(namespace: string, id: string): string {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace) || !id || id.length > 4096) throw new Error("invalid_state_key");
    return this.cipher.index(namespace, id);
  }
  async withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const run = async (tx: postgres.TransactionSql): Promise<T> => {
      await tx`set local lock_timeout = '2s'`;
      await tx`set local statement_timeout = '10s'`;
      await tx`select pg_advisory_xact_lock(hashtextextended(${this.cipher.index("lock", name)}, 0))`;
      return this.transactions.run(tx, fn);
    };
    const current = this.transactions.getStore();
    if (current) return run(current);
    // SDK callbacks may perform network requests while locked; each fetch also has a deadline.
    return await this.sql.begin(run) as T;
  }
  async put(namespace: string, id: string, payload: unknown, ttl: number): Promise<void> {
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL) throw new Error("invalid_state_expiry");
    const key = this.key(namespace, id), value = object(payload);
    const grant = grantable.has(namespace) && typeof value.grantId === "string" ? this.cipher.index("grant", value.grantId) : null;
    const uid = typeof value.uid === "string" ? this.cipher.index("uid", value.uid) : null;
    const encrypted = this.cipher.seal(namespace, key, payload);
    await this.withLock(grant ? `grant:${grant}` : `record:${namespace}:${key}`, async () => {
      const db = this.database();
      if (grant) {
        const revoked = await db`select 1 from weave_auth.revoked_grants where grant_hash=${grant} and expires_at>now()`;
        if (revoked.length) throw new Error("grant_revoked");
      }
      await db`insert into weave_auth.records(namespace,key_hash,encrypted_payload,expires_at,grant_hash,uid_hash)
        values(${namespace},${key},${encrypted},now()+make_interval(secs=>${ttl}),${grant},${uid})
        on conflict(namespace,key_hash) do update set encrypted_payload=excluded.encrypted_payload,
        expires_at=excluded.expires_at,grant_hash=excluded.grant_hash,uid_hash=excluded.uid_hash`;
      // consumed_at is deliberately not reset by an upsert.
    });
  }
  private unpack(namespace: string, row: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!row) return undefined;
    if (typeof row.key_hash !== "string" || typeof row.encrypted_payload !== "string") throw new Error("invalid_stored_state");
    const result = object(this.cipher.open(namespace, row.key_hash, row.encrypted_payload));
    if (row.consumed_at) result.consumed = Math.floor(new Date(String(row.consumed_at)).getTime() / 1000);
    return result;
  }
  async find(namespace: string, id: string): Promise<Record<string, unknown> | undefined> {
    const key = this.key(namespace, id), db = this.database();
    const rows = await db`select * from weave_auth.records where namespace=${namespace} and key_hash=${key} and expires_at>now()`;
    return this.unpack(namespace, rows[0]);
  }
  async findByUid(namespace: string, uid: string): Promise<Record<string, unknown> | undefined> {
    this.key(namespace, uid);
    const db = this.database(), hash = this.cipher.index("uid", uid);
    const rows = await db`select * from weave_auth.records where namespace=${namespace} and uid_hash=${hash} and expires_at>now()`;
    return this.unpack(namespace, rows[0]);
  }
  async take(namespace: string, id: string): Promise<Record<string, unknown> | undefined> {
    const key = this.key(namespace, id), db = this.database();
    const rows = await db`delete from weave_auth.records where namespace=${namespace} and key_hash=${key}
      and expires_at>now() and consumed_at is null returning *`;
    return this.unpack(namespace, rows[0]);
  }
  async consume(namespace: string, id: string): Promise<void> {
    const key = this.key(namespace, id), db = this.database();
    const rows = await db`update weave_auth.records set consumed_at=now() where namespace=${namespace} and key_hash=${key}
      and expires_at>now() and consumed_at is null returning key_hash`;
    if (rows.length !== 1) throw new Error("state_already_used");
  }
  async remove(namespace: string, id: string): Promise<void> {
    const db = this.database();
    await db`delete from weave_auth.records where namespace=${namespace} and key_hash=${this.key(namespace,id)}`;
  }
  async revokeGrant(id: string): Promise<void> {
    const hash = this.cipher.index("grant", id);
    await this.withLock(`grant:${hash}`, async () => {
      const db = this.database();
      await db`insert into weave_auth.revoked_grants(grant_hash,expires_at) values(${hash},now()+interval '1 day')
        on conflict(grant_hash) do update set expires_at=excluded.expires_at`;
      // Old deployments also indexed Interaction rows. Preserve those at cutover.
      await db`delete from weave_auth.records where grant_hash=${hash} and namespace=any(${[...grantable]}::text[])`;
    });
  }
  async signingMaterial(): Promise<SigningMaterial> {
    const db = this.database();
    const rows = await db`select encrypted_payload from weave_auth.settings where name='signing'`;
    if (typeof rows[0]?.encrypted_payload !== "string") throw new Error("signing_keys_not_provisioned");
    return parseSigningMaterial(this.cipher.open("settings", "signing", rows[0].encrypted_payload));
  }
  async prune(): Promise<void> {
    const db = this.database();
    await db`delete from weave_auth.records where expires_at<=now()`;
    await db`delete from weave_auth.revoked_grants where expires_at<=now()`;
  }
}
/** Operator-only, insert-only provisioning. The runtime role cannot write settings. */
export async function provisionSigningMaterial(sql: postgres.Sql, cipher: StateCipher, material: SigningMaterial): Promise<void> {
  const encrypted = cipher.seal("settings", "signing", parseSigningMaterial(material));
  await sql`insert into weave_auth.settings(name,encrypted_payload) values('signing',${encrypted})`;
}
/** Compare-and-swap prevents two operators losing each other's rotation. */
export async function replaceSigningMaterial(sql: postgres.Sql, cipher: StateCipher, current: SigningMaterial, next: SigningMaterial): Promise<void> {
  await sql.begin(async tx => {
    const rows = await tx`select encrypted_payload from weave_auth.settings where name='signing' for update`;
    if (typeof rows[0]?.encrypted_payload !== "string" ||
        JSON.stringify(cipher.open("settings", "signing", rows[0].encrypted_payload)) !== JSON.stringify(current))
      throw new Error("signing_keys_changed");
    const encrypted = cipher.seal("settings", "signing", parseSigningMaterial(next));
    await tx`update weave_auth.settings set encrypted_payload=${encrypted} where name='signing'`;
  });
}
