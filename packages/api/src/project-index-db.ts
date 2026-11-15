import postgres from "postgres";

type JobRole = "weave_index_job" | "weave_query_embedding_job";

/**
 * Direct Postgres access for the two isolated index jobs and the public project list. Hosted
 * connections verify the server certificate: against `ca` when given (the app's
 * WEAVE_DATABASE_CA_PEM), otherwise against Node's trust store. Statements are not prepared, so the
 * same login works through Supabase's session or transaction pooler.
 */
export async function connectRestrictedIndexDatabase(url: string, role: JobRole, options: { ca?: string } = {}) {
  const endpoint = new URL(url);
  if (!["postgres:", "postgresql:"].includes(endpoint.protocol) || endpoint.search)
    throw Error("invalid_index_database_url");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: local ? false : options.ca
      ? { rejectUnauthorized: true, ca: options.ca, servername: endpoint.hostname }
      : "verify-full",
    connect_timeout: 5,
    idle_timeout: 5,
    connection: { statement_timeout: 5000, lock_timeout: 2500 },
    onnotice: () => undefined,
  });

  try {
    const [check] = await sql<{ permitted: boolean }[]>`
      select not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole
        and not r.rolreplication and pg_has_role(r.oid, job.oid, 'USAGE')
        and not exists (
          select 1 from pg_catalog.pg_roles other
          where other.oid <> r.oid and other.oid <> job.oid
            and pg_has_role(r.oid, other.oid, 'MEMBER')
        ) as permitted
      from pg_catalog.pg_roles r
      join pg_catalog.pg_roles job on job.rolname = ${role}
      where r.rolname = current_user
    `;
    if (!check?.permitted) throw Error("index_database_role_required");
  } catch {
    await sql.end({ timeout: 1 });
    throw Error("index_database_role_required");
  }
  return sql;
}

/**
 * The one rule for which indexed projects the public list shows, for a source row aliased `s`: listed at
 * the last complete traversal, unexpired, read within seven days and with current evidence to show. The
 * signed-in evidence snapshot applies the same conditions.
 */
export const shownProject = (sql: postgres.ISql) => sql`
  s.status = 'indexed' and s.permission_until > now() and s.fetched_at >= now() - interval '7 days'
  and exists (
    select 1 from private.weave_project_index_evidence shown_evidence
    where shown_evidence.project_uri = s.project_uri and shown_evidence.evidence->>'projectUri' = s.project_uri
      and shown_evidence.evidence->>'cid' = s.cid
  )`;
