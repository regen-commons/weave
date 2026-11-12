import type postgres from "postgres";
import type { StateCipher } from "./certified/crypto.ts";
import { record } from "./account-contract.ts";

export interface SignInAttempt { verifier: string; state: string; returnTo: string }
export interface SignInStore {
  put(id: string, attempt: SignInAttempt): Promise<void>;
  take(id: string): Promise<SignInAttempt | undefined>;
}
/** App-only role and wrapping secrets; it cannot read Certified tokens or bridge keys. */
export function postgresSignInStore(sql: postgres.Sql, cipher: StateCipher): SignInStore {
  const namespace = "app:sign_in";
  let checked: Promise<void> | undefined;
  const restricted = () => checked ??= (async () => {
    const rows = await sql`select rolsuper, rolbypassrls,
      has_table_privilege(current_user,'weave_auth.app_signins','UPDATE,TRUNCATE,REFERENCES,TRIGGER') can_admin_state,
      has_table_privilege(current_user,to_regclass('weave_auth.settings'),'SELECT,INSERT,UPDATE,DELETE') can_access_keys,
      has_table_privilege(current_user,to_regclass('weave_auth.records'),'SELECT,INSERT,UPDATE,DELETE') can_access_bridge,
      has_table_privilege(current_user,(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='auth' and c.relname='users'),'SELECT,INSERT,UPDATE,DELETE') can_access_users
      from pg_roles where rolname=current_user`;
    if (rows.length !== 1 || Object.values(rows[0]!).some(value => value === true))
      throw Error("restricted_sign_in_role_required");
  })().catch(error => { checked = undefined; throw error; });
  return {
    async put(id, attempt) {
      await restricted();
      const hash = cipher.index(namespace, id);
      await sql.begin(async tx => {
        await tx`delete from weave_auth.app_signins where expires_at <= clock_timestamp()`;
        await tx`insert into weave_auth.app_signins(key_hash,encrypted_payload,expires_at)
          values(${hash},${cipher.seal(namespace, hash, attempt)},clock_timestamp()+interval '10 minutes')`;
      });
    },
    async take(id) {
      await restricted();
      const hash = cipher.index(namespace, id);
      const rows = await sql`delete from weave_auth.app_signins where key_hash=${hash}
        and expires_at>clock_timestamp() returning encrypted_payload`;
      if (!rows[0]) return undefined;
      const value = record(cipher.open(namespace, hash, rows[0].encrypted_payload));
      if (typeof value.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.verifier) ||
          typeof value.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.state) || typeof value.returnTo !== "string")
        throw new Error("invalid_sign_in_state");
      return { verifier: value.verifier, state: value.state, returnTo: value.returnTo };
    },
  };
}
