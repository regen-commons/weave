import type postgres from "postgres";
import { connectRestrictedIndexDatabase, shownProject } from "./project-index-db.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";

/** Every shown project, newest first, with the words search looks in, and the index state at that moment. */
export type PublicProjectSnapshot = {
  cards: (PublicProjectCard & { text: string })[];
  checkpoint: { completedAt: string | null; offset: number } | null;
};
export type PublicProjectReader = {
  load(): Promise<PublicProjectSnapshot>;
  close(): Promise<void>;
};

/**
 * Reads every shown card in one read-only statement, so the cards and the index state describe the same
 * moment. A card is built from the project's current evidence rows: its name, its first two passages in
 * reading order and its dates. Search covers the name and every passage. Projects with no evidence are
 * not shown.
 */
export function createPublicProjectReader(sql: postgres.Sql): PublicProjectReader {
  return {
    load: () => sql.begin("read only", async (tx) => {
      await tx`set local statement_timeout = '4s'`;
      const [row] = await tx<PublicProjectSnapshot[]>`
        with cards as (
          select s.project_uri, s.fetched_at,
            min(e.evidence->>'projectName') as name,
            min(e.evidence->>'sourceUrl') as source_url,
            -- least() skips nulls: never later than the source's index time or Weave's read.
            least(min((e.evidence->>'sourceCreatedAt')::timestamptz), min((e.evidence->>'sourceIndexedAt')::timestamptz),
              s.fetched_at) as shared_at,
            (array_agg(e.evidence->>'passage' order by (e.evidence->>'position')::int nulls last, e.id))[1:2] as passages,
            string_agg(e.evidence->>'passage', ' ' order by (e.evidence->>'position')::int nulls last, e.id) as text
          from private.weave_project_index_source s
          join private.weave_project_index_evidence e
            on e.project_uri = s.project_uri and e.evidence->>'projectUri' = s.project_uri and e.evidence->>'cid' = s.cid
          where ${shownProject(tx)}
          group by s.project_uri, s.fetched_at
        )
        select coalesce((select jsonb_agg(jsonb_build_object(
            'uri', c.project_uri, 'name', c.name, 'passages', to_jsonb(c.passages), 'text', c.text,
            'sourceUrl', c.source_url,
            'sharedAt', to_char(c.shared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'checkedAt', to_char(c.fetched_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ) order by c.shared_at desc, c.project_uri desc) from cards c), '[]'::jsonb) as cards,
          (select jsonb_build_object('offset', c.next_offset,
              'completedAt', to_char(c.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
            from private.weave_project_index_checkpoint c where c.singleton) as checkpoint
      `;
      return { cards: row?.cards ?? [], checkpoint: row?.checkpoint ?? null };
    }),
    close: () => sql.end({ timeout: 2 }),
  };
}

/** The public list reads with the index job's restricted login, and only inside read-only transactions. */
export async function connectPublicProjectReader(url: string, options: { ca?: string } = {}) {
  return createPublicProjectReader(await connectRestrictedIndexDatabase(url, "weave_index_job", options));
}
