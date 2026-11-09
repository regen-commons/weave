import type postgres from "postgres";

/** Shared by startup and readiness; an operator connection must never run the bridge. */
export async function assertBridgeRuntimeRole(sql: postgres.Sql): Promise<void> {
  const roles = await sql`select rolsuper,rolbypassrls,has_table_privilege(current_user,'weave_auth.settings','INSERT,UPDATE,DELETE,TRUNCATE') can_provision
    from pg_roles where rolname=current_user`;
  if (roles.length !== 1 || roles[0]?.rolsuper || roles[0]?.rolbypassrls || roles[0]?.can_provision)
    throw new Error("restricted_database_role_required");
}
