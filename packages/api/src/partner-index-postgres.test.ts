import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { connectProjectIndex } from "./project-index-postgres.ts";
import { extractCollection, PROJECT_EXTRACTION_VERSION } from "./project-index-source.ts";
import { refreshProjectIndex } from "./project-index.ts";
import { rankPartnerMatches } from "./partner-matcher.ts";

const database = process.env.WEAVE_MATCH_EVAL_DATABASE_URL;
let sql: postgres.Sql;
let connection: Awaited<ReturnType<typeof connectProjectIndex>>;
before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_match_eval") throw Error("dedicated_loopback_evaluation_database_required");
  sql = postgres(database, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop schema if exists private, extensions cascade;
    create schema private; create schema extensions;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      if not exists(select 1 from pg_roles where rolname='weave_eval_index') then
        create role weave_eval_index login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      end if;
    end $$;`);
  await sql.unsafe(await readFile(new URL("../../../supabase/candidates/weave-project-index.sql", import.meta.url), "utf8"));
  await sql`grant weave_index_job to weave_eval_index`;
  url.username = "weave_eval_index"; url.password = "";
  connection = await connectProjectIndex(url.href);
});
after(async () => { await connection?.close(); await sql?.end(); });

test("restricted public index refresh retrieves different wording without changing evidence or enabling vectors", { skip: !database }, async () => {
  const did = "did:plc:pktwukejt6bnubpkhldnaeyc", uri = `at://${did}/org.hypercerts.collection/atlas`;
  const time = new Date().toISOString();
  const permission = { uri, redisplayUntil: new Date(Date.now()+3600000).toISOString() };
  const read = extractCollection({ uri, did, indexedAt: time,
    cid: "bafyreicr6uunzpaa7hzwbkvctviqz6pvnab5sziptgdqwe5jboqlhm55vi", author: { did, organization: null },
    record: { $type: "org.hypercerts.collection", type: "project", title: "Public atlas", createdAt: time,
      shortDescription: "Our ongoing practice is cartography." },
  }, uri, time);
  assert.equal(read.status, "indexed");
  if (read.status !== "indexed") return;
  const manifest = { generation: 1, permissions: [permission] };
  await connection.store.open(manifest, "previous-extraction-hash");
  await assert.rejects(refreshProjectIndex({ manifest, store: connection.store, source: { get: async () => read }, batchSize: 1 }),
    /obsolete_or_conflicting_manifest/);
  const report = await refreshProjectIndex({ manifest: { ...manifest, generation: 2 }, store: connection.store,
    source: { get: async () => read }, batchSize: 1 });
  assert.equal(report.indexed, 1);
  assert.equal(report.embedded, 0);
  const [stored] = await sql`select s.content_hash, s.extraction_version, e.evidence, e.lexical_text, e.embedding
    from private.weave_project_index_source s join private.weave_project_index_evidence e using(project_uri)`;
  assert.equal(stored!.content_hash, read.contentHash);
  assert.equal(stored!.extraction_version, PROJECT_EXTRACTION_VERSION);
  assert.equal(stored!.evidence.passage, "Our ongoing practice is cartography.");
  assert.ok(stored!.lexical_text.includes("mapmaking"));
  assert.equal(stored!.embedding, null);
  const [found] = await sql`select private.weave_public_project_shortlist('mapmaking', 80) as evidence`;
  assert.equal(found!.evidence.length, 1);
  const [match] = rankPartnerMatches({ queries: [{ initiativeId: "private", entryId: "need", kind: "need", revision: 1,
    summary: {}, value: { title: "Mapmaking", status: "open" } }], publicEvidence: found!.evidence });
  assert.equal(match?.evidenceKind, "inferred_capability");
  assert.ok(match?.unknowns.includes("availability"));
  // Upgrade an existing unchanged source projection: the version forces lexical text to rebuild.
  await sql`update private.weave_project_index_source set extraction_version='hypercerts-collection-v2-leaflet'`;
  await sql`update private.weave_project_index_evidence set lexical_text='cartography'`;
  await refreshProjectIndex({ manifest: { ...manifest, generation: 2 }, store: connection.store,
    source: { get: async () => read }, batchSize: 1 });
  const [rebuilt] = await sql`select private.weave_public_project_shortlist('mapmaking', 80) as evidence`;
  assert.equal(rebuilt!.evidence.length, 1);
  // Permission loss removes expanded index entries as well as the raw evidence.
  await refreshProjectIndex({ manifest: { generation: 3, permissions: [] }, store: connection.store,
    source: { get: async () => { throw Error("must not fetch"); } }, batchSize: 1 });
  const [withdrawn] = await sql`select private.weave_public_project_shortlist('mapmaking', 80) as evidence`;
  assert.deepEqual(withdrawn!.evidence, []);
});
