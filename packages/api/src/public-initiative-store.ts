import type postgres from "postgres";
import { connectRestrictedIndexDatabase, shownProject } from "./project-index-db.ts";
import { PUBLIC_INITIATIVE_PASSAGES_MAX } from "./public-initiative-contract.ts";

/**
 * One shown project as the index holds it, and the support listings `private.weave_public_support_listings`
 * returns for it, read at one moment. Every field is the database's; the handler checks them all.
 */
export type StoredInitiative = { project: unknown; listings: unknown };
export type PublicInitiativeReader = {
  /** The project and its listings, or null where the public list does not show that project. */
  load(uri: string): Promise<StoredInitiative | null>;
  close(): Promise<void>;
};

/**
 * Reads one project in one read-only statement, under the public list's rule for which projects are shown,
 * so a project the list leaves out has no page either. Its card is built as the list builds one (name,
 * dates, publisher, place, kinds of group and work), with every passage in reading order instead of the
 * first two. Listings are read only for a shown project, from the function that returns only confirmed,
 * open and unexpired public records; the reader's login cannot see the workspace tables themselves.
 */
export function createPublicInitiativeReader(sql: postgres.Sql): PublicInitiativeReader {
  return {
    load: (uri) => sql.begin("read only", async (tx) => {
      await tx`set local statement_timeout = '4s'`;
      const [row] = await tx<{ project: unknown; listings: unknown }[]>`
        with card as (
          select s.project_uri, s.fetched_at, s.publisher_name, s.place_name, s.organization_types, s.work_scope,
            min(e.evidence->>'projectName') as name,
            min(e.evidence->>'sourceUrl') as source_url,
            -- least() skips nulls: never later than the source's index time or Weave's read.
            least(min((e.evidence->>'sourceCreatedAt')::timestamptz), min((e.evidence->>'sourceIndexedAt')::timestamptz),
              s.fetched_at) as shared_at,
            (array_agg(e.evidence->>'passage' order by (e.evidence->>'position')::int nulls last, e.id))[1:${PUBLIC_INITIATIVE_PASSAGES_MAX}::int]
              as passages
          from private.weave_project_index_source s
          join private.weave_project_index_evidence e
            on e.project_uri = s.project_uri and e.evidence->>'projectUri' = s.project_uri and e.evidence->>'cid' = s.cid
          where s.project_uri = ${uri} and ${shownProject(tx)}
          group by s.project_uri, s.fetched_at, s.publisher_name, s.place_name, s.organization_types, s.work_scope
        )
        select jsonb_build_object(
            'uri', c.project_uri, 'name', c.name, 'passages', to_jsonb(c.passages), 'sourceUrl', c.source_url,
            'organizationTypes', to_jsonb(c.organization_types), 'workScopes', to_jsonb(c.work_scope),
            'sharedAt', to_char(c.shared_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'checkedAt', to_char(c.fetched_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ) || jsonb_strip_nulls(jsonb_build_object('publisher', c.publisher_name, 'place', c.place_name)) as project,
          (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'uri', l.uri, 'cid', l.cid, 'record', l.record)
              order by l.kind, l.rkey collate "C"), '[]'::jsonb)
            from private.weave_public_support_listings(c.project_uri) l) as listings
        from card c
      `;
      return row ? { project: row.project, listings: row.listings } : null;
    }),
    close: () => sql.end({ timeout: 2 }),
  };
}

/** Reads with the index job's restricted login, as the public list does, and only inside read-only transactions. */
export async function connectPublicInitiativeReader(url: string, options: { ca?: string } = {}) {
  return createPublicInitiativeReader(await connectRestrictedIndexDatabase(url, "weave_index_job", options));
}
