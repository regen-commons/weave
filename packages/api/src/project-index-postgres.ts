import { connectRestrictedIndexDatabase } from "./project-index-db.ts";
import { partnerLexicalText } from "./partner-matcher.ts";
import { PROJECT_EXTRACTION_VERSION } from "./project-index-source.ts";
import type { ProjectCheckpoint, ProjectIndexStore } from "./project-index.ts";

type CheckpointRow = {
  revision: string;
  offset: number;
  retryAfter: number | null;
  generation: number;
  hash: string;
};

export async function connectProjectIndex(url: string): Promise<{ store: ProjectIndexStore; close(): Promise<void> }> {
  const sql = await connectRestrictedIndexDatabase(url, "weave_index_job");

  const store: ProjectIndexStore = {
    async hasEmbedding(uri, contentHash, modelVersion) {
      const [result] = await sql<{ current: boolean }[]>`
        select exists (select 1 from private.weave_project_index_source
          where project_uri = ${uri} and content_hash = ${contentHash}
            and extraction_version = ${PROJECT_EXTRACTION_VERSION} and embedding_model = ${modelVersion}
        ) as "current"
      `;
      return result?.current ?? false;
    },
    open(manifest, hash) {
      return sql.begin(async (tx): Promise<ProjectCheckpoint> => {
        await tx`insert into private.weave_project_index_checkpoint default values on conflict do nothing`;
        const [current] = await tx<CheckpointRow[]>`
          select revision::text, next_offset as offset,
            (extract(epoch from retry_after) * 1000)::double precision as "retryAfter",
            manifest_generation as generation, manifest_hash as hash
          from private.weave_project_index_checkpoint where singleton for update
        `;
        if (!current || current.generation > manifest.generation
          || (current.generation === manifest.generation && current.hash !== hash))
          throw Error("obsolete_or_conflicting_manifest");
        if (current.hash === hash && current.generation === manifest.generation) return current;
        const [next] = await tx<CheckpointRow[]>`
          update private.weave_project_index_checkpoint
          set revision = revision + 1, manifest_generation = ${manifest.generation}, manifest_hash = ${hash},
              next_offset = 0, project_count = ${manifest.permissions.length},
              completed_at = case when ${manifest.permissions.length} = 0 then now() end, updated_at = now()
          where singleton
          returning revision::text, next_offset as offset,
            (extract(epoch from retry_after) * 1000)::double precision as "retryAfter"
        `;
        await tx`
          update private.weave_project_index_source
          set status = 'restricted', permission_until = least(permission_until, now()),
            embedding_model = null, error_code = 'permission_removed'
          where not (project_uri = any(${manifest.permissions.map(({ uri }) => uri)}::text[]))
        `;
        await tx`
          delete from private.weave_project_index_evidence e
          using private.weave_project_index_source s
          where e.project_uri = s.project_uri and s.error_code = 'permission_removed'
        `;
        await tx`
          update private.weave_project_index_source s
          set permission_until = least(s.permission_until, approved."redisplayUntil")
          from jsonb_to_recordset(${tx.json(manifest.permissions)})
            as approved(uri text, "redisplayUntil" timestamptz)
          where s.project_uri = approved.uri
        `;
        if (!next) throw Error("checkpoint_missing");
        return next;
      });
    },
    commit({ checkpoint, permission, read, embedding, nextOffset, completedAt, retryAfter, checkedAt }) {
      return sql.begin(async (tx) => {
        const [next] = await tx<CheckpointRow[]>`
          update private.weave_project_index_checkpoint
          set revision = revision + 1, next_offset = ${nextOffset},
              completed_at = coalesce(${completedAt}::timestamptz, completed_at),
              updated_at = ${checkedAt}, retry_after = ${retryAfter}
          where singleton and revision = ${checkpoint.revision}
          returning revision::text, next_offset as offset,
            (extract(epoch from retry_after) * 1000)::double precision as "retryAfter"
        `;
        if (!next) return null;

        const [previous] = await tx<{
          cid: string | null; hash: string | null; version: string | null;
          indexedAt: string | null; status: string; fetchedAt: string | null;
        }[]>`
          select cid, content_hash as hash, extraction_version as version, status, source_indexed_at::text as "indexedAt", fetched_at::text as "fetchedAt"
          from private.weave_project_index_source where project_uri = ${permission.uri}
        `;
        if (read.status === "indexed" && previous) {
          const observed = read.sourceIndexedAt ? Date.parse(read.sourceIndexedAt) : -Infinity;
          const last = previous.indexedAt ? Date.parse(previous.indexedAt) : -Infinity;
          const tombstoned = previous.status === "missing" && read.cid === previous.cid
            && (!previous.indexedAt || observed <= last);
          if (tombstoned || (previous.status === "missing" && observed < last))
            read = { status: "missing", code: "record_not_found" };
          else if (observed < last) read = { status: "failed", code: "source_unavailable" };
        }
        const sameProjection = read.status === "indexed" && previous?.version === PROJECT_EXTRACTION_VERSION
          && previous.hash === read.contentHash && (previous.status === "indexed" || (previous.status === "failed" && previous.fetchedAt !== null));
        // A CID identifies immutable source content. A divergent projection under the same
        // CID is only expected when the extraction contract changes.
        if (read.status === "indexed" && previous?.cid === read.cid
          && previous.version === PROJECT_EXTRACTION_VERSION && previous.hash !== read.contentHash)
          read = { status: "failed", code: "invalid_source_record" };

        if (read.status !== "indexed") embedding = undefined;
        const retainHistory = read.status !== "indexed";
        const keepOld = read.status === "failed"
          && (read.code === "source_unavailable" || read.code === "source_rate_limited");
        await tx`
          insert into private.weave_project_index_source as s (
            project_uri, status, permission_until, cid, content_hash, extraction_version, checked_at, fetched_at, error_code, embedding_model, source_indexed_at
          ) values (
            ${permission.uri}, ${read.status}, ${permission.redisplayUntil},
            ${read.status === "indexed" ? read.cid : null}, ${read.status === "indexed" ? read.contentHash : null},
            ${read.status === "indexed" ? PROJECT_EXTRACTION_VERSION : null}, ${checkedAt},
            ${read.status === "indexed" ? read.fetchedAt : null}, ${read.status === "indexed" ? null : read.code},
            ${embedding?.modelVersion ?? null}, ${read.status === "indexed" ? read.sourceIndexedAt : null}
          ) on conflict (project_uri) do update set
            status = case when ${keepOld} and s.status in ('missing', 'restricted') then s.status else excluded.status end,
            permission_until =
              case when ${keepOld} then least(s.permission_until, excluded.permission_until) else excluded.permission_until end,
            cid = case when ${retainHistory} then s.cid else excluded.cid end,
            content_hash = case when ${retainHistory} then s.content_hash else excluded.content_hash end,
            extraction_version = case when ${retainHistory} then s.extraction_version else excluded.extraction_version end,
            checked_at = excluded.checked_at,
            fetched_at = case when ${keepOld} then s.fetched_at else excluded.fetched_at end,
            error_code = excluded.error_code,
            source_indexed_at = case when ${retainHistory} then s.source_indexed_at else excluded.source_indexed_at end,
            embedding_model = case when ${keepOld} or (${sameProjection} and excluded.embedding_model is null)
              then s.embedding_model else excluded.embedding_model end
        `;
        const committed = { ...next, sourceStatus: read.status, embedded: embedding?.vectors.length ?? 0 };
        if (keepOld) return committed;
        if (read.status === "indexed" && sameProjection) {
          const sourceIndexedAt = read.sourceIndexedAt;
          await tx`
            update private.weave_project_index_evidence
            set evidence = evidence || jsonb_build_object(
              'cid', ${read.cid}::text, 'sourceIndexedAt', ${sourceIndexedAt}::text
            ) where project_uri = ${permission.uri}
              and (evidence->>'cid' is distinct from ${read.cid}::text
                or evidence->>'sourceIndexedAt' is distinct from ${sourceIndexedAt}::text)
          `;
          if (embedding) {
            for (const [index, evidence] of read.passages.entries()) {
              await tx`
                update private.weave_project_index_evidence
                set embedding = ${JSON.stringify(embedding.vectors[index])}::extensions.vector,
                  embedding_model = ${embedding.modelVersion}
                where id = ${evidence.id}
              `;
            }
          }
          return committed;
        }

        await tx`delete from private.weave_project_index_evidence where project_uri = ${permission.uri}`;
        if (read.status === "indexed" && read.passages.length) {
          const rows = read.passages.map((evidence, index) => ({
            id: evidence.id,
            project_uri: permission.uri,
            lexical_text: partnerLexicalText(evidence.passage),
            evidence: tx.json(evidence),
            embedding: embedding ? JSON.stringify(embedding.vectors[index]) : null,
            embedding_model: embedding?.modelVersion ?? null,
          }));
          await tx`insert into private.weave_project_index_evidence ${tx(rows, "id", "project_uri", "lexical_text", "evidence", "embedding", "embedding_model")}`;
        }
        return committed;
      });
    },
  };
  return { store, close: () => sql.end({ timeout: 3 }) };
}
