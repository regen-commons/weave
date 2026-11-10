# Certified index validation, 10 November 2026

Production browser reads enumerated 1,128 unique project records across 12 pages,
with no final cursor. A second traversal checked the documented visibility field
and found no explicitly unlisted records. The terminal indexing job still cannot
reach the API, and no project-specific redisplay manifest was supplied. Relevance,
domain coverage, propagation lag and job ingestion remain unverified. The production
pilot and semantic retrieval stay off.

## Reproduce the read-only audit

From the repository root, with Node 24 and the committed dependencies:

```sh
node packages/api/scripts/project-index.ts --probe-network 100
```

An optional existing permission manifest can be supplied as the third argument:

```sh
node packages/api/scripts/project-index.ts --probe-network 100 /path/to/approved-projects.json
```

The source adapter supports network-wide `listCollections` pagination without an
`authors` filter. Five records per page keep each response within the existing
512 KiB bound. It fixes `sortDirection=asc`, follows opaque cursors and validates
record identity, project type, organization visibility and extraction fields.
The audit counts duplicates, rejects cursor cycles and reports `partial` when its
page budget is exhausted. It does not connect to PostgreSQL, create permissions,
persist passages or enable retrieval. A complete traversal describes this API's
current view; it is not an atomic snapshot or a census of all AT Protocol records.

The [terminal aggregate output](project-index-public-audit-2026-11-10.json) came from the
normal Node CLI. It returned `status=failed`, `code=source_unavailable`, `pages=0`
at 09:17 UTC. A direct public GET also failed with `CONNECT tunnel failed,
response 403`, in both sandboxed and escalated execution. The web reader could
read the official documentation but could not fetch this API query. These terminal
access failures do not establish that a project was deleted or unlisted. The in-app
browser succeeded through a separate read path, described below.

The exact public query was:

```text
https://api.hypercerts.dev/xrpc/org.hypercerts.collection.listCollections?types=project&limit=5&sortDirection=asc
```

To resume: permit read access to `api.hypercerts.dev` in the execution environment,
rerun the audit to a completed traversal, and verify the applicable reuse basis
before adding any records to the permission manifest. A bounded discovery pass
can prepare that review; it cannot grant its own redisplay permission. Existing
`--refresh` ingestion still requires the reviewed manifest and retains durable
checkpoints, expiry and withdrawal handling.

## Production browser aggregate

Proof class: `production`. Browser: Codex in-app browser. The
[browser aggregate](project-index-browser-audit-2026-11-10.json) contains counts and
time bounds only, with no source descriptions, project identities or URL values.
At 09:43 UTC, a second traversal completed 12 pages of at most 100 records. It
observed 1,128 records and 1,128 unique AT-URIs, no duplicates and no continuation.
Organization `visibility=unlisted`, the older `unlisted=true` flag and collection
`visibility=unlisted` each counted zero. Its basic envelope check required project
type, the collection NSID, URI/CID strings and a URI prefix matching the view's DID.
That check does not establish canonical CID validity or every extraction invariant.

The first traversal at 09:40 UTC counted 12,244 nonempty direct
`description.blocks[].block.plaintext` strings. It did not recurse into lists.
Index timestamps ranged from 6 October to 10 November 2026. These are timestamps
in an API view, not measured source-update propagation delay. This traversal also
found one embedded signed-link occurrence; neither that URL nor its value was
followed or retained in an artifact.

Nonexclusive keyword indicators counted art 167, software 131, research 296 and
place 1,014. Each record counted at most once per indicator. The inspected text
was its title, raw short description and direct block plaintext. The exact
case-insensitive, word-bounded patterns were:

```text
art:      art|arts|artist|music|culture
software: software|open source|code|digital|platform
research: research|scientific|science|data
place:    land|farm|forest|community|local|river|soil
```

These counts are search-term indicators. They are not project classification,
representative domain coverage or judgments of relevance. Raw short-description
HTML also makes them unsuitable as an extraction-quality score. No public passage
was retained, no redisplay permission was granted and no hosted write was made.
The two paginated traversals were not atomic snapshots.

To repeat the browser aggregate, read
`org.hypercerts.collection.listCollections?types=project&limit=100&sortDirection=asc`
on the production API. Append the previous response's cursor as an encoded query
parameter until it is omitted. Keep AT-URIs only in an ephemeral set for duplicate
counts; retain aggregate counts and timestamp extremes only. Check organization
`visibility` rather than treating the legacy boolean as the authoritative field.
The terminal adapter uses smaller pages and requires its own successful ingestion
proof; these browser totals do not replace that proof.

## Source contract checked

The [production services list](https://docs.hypercerts.org/reference/services)
names `api.hypercerts.dev` as the read API. The
[API documentation](https://docs.hypercerts.org/reference/services/hypercerts-api)
says public reads need no user session, coverage is limited to followed PDSs and
Jetstream's retained collections, indexed reads may lag and malformed records
must be handled defensively. This establishes a supported read path, not observed
launch coverage.

The [upstream OpenAPI reference](https://github.com/hypercerts-org/api/blob/main/docs/openapi.json)
was read on this date. `listCollections` supports an omitted `authors` filter,
`types=project`, limits from 1 through 100, `(createdAt, uri)` ordering and opaque
cursors. `cursor` is omitted on the final page. The query selects the current
record at an AT-URI, not a pinned CID version. The
[collection schema](https://docs.hypercerts.org/lexicons/hypercerts-lexicons/collection)
defines a project as `org.hypercerts.collection` with `type=project`.

[Certified's terms](https://certified.app/terms), updated 6 May 2026, describe
federated replication, caching, indexing and display and retain user ownership.
They are source-level policy evidence. This review did not establish a blanket
project-content license or manufacture per-record permissions from public access.
The [rights schema](https://docs.hypercerts.org/lexicons/hypercerts-lexicons/rights)
attaches publisher terms to activity claims; absent or unresolved terms must not
be treated as an open license. An activity's rights statement does not
automatically grant reuse of its parent collection's description.

The [organization schema](https://docs.hypercerts.org/lexicons/certified-lexicons/organization)
defines `unlisted` as a request to omit an account from directories and search,
even though its public records remain readable. Weave suppresses such projects.
The [record lifecycle documentation](https://docs.hypercerts.org/architecture/data-flow-and-lifecycle)
separates stable AT-URIs from content CIDs and explains that source deletions may
leave external copies. The
[relay documentation](https://docs.hypercerts.org/reference/services/relay)
describes create, update and delete events; archival backfill requires an API key.
No such key or authenticated source was used here.

## Bounded extraction and manifest preparation

The pinned [Hypercerts collection schema](https://github.com/hypercerts-org/hypercerts-lexicon/blob/v2.0.1/lexicons/org/hypercerts/collection.json)
references [Leaflet linear documents](https://github.com/hypercerts-org/hypercerts-lexicon/blob/v2.0.1/lexicons/pub/leaflet/pages/linearDocument.json).
The browser's first five inspected descriptions used the same blocks envelope
without a parent `$type`. The adapter accepts the released type and that observed
legacy envelope, and retains only direct text/header `plaintext` with its original
block-index field path. It caps inspection at 100 blocks, 20,000 narrative
characters and five long-description passages per project. The existing short
summary allows at most five further passages, with deduplication across fields.

Website `src`, preview fields, facets, code, HTML, child lists and linked records
are not fetched or indexed. A `membersOnlyDelimiter` stops extraction before later
blocks. Explicit organization visibility and the older unlisted boolean both
suppress discovery. Fixtures prove these boundaries without storing a real URL or
private source content. Version `hypercerts-collection-v2-leaflet` requires
re-projection when the job next refreshes an approved record. Real extraction yield
and retained-corpus relevance still need a permitted ingestion run.

The [manifest size measurements](project-index-manifest-bounds-2026-11-10.json)
use synthetic permission metadata only. A manifest with the observed 1,128-record
count and common-length addresses uses 152,321 bytes. At maximum accepted address
lengths the same count uses 532,457 bytes, exceeding the old 512 KiB file cap.
The 10,000-record maximum uses 4,720,041 bytes in that worst-address fixture.
The job now accepts at most 10,000 explicit grants in an 8 MiB manifest file;
outbound API bodies remain capped separately at 512 KiB and refresh batches at 25.
No real grant was added. Separate manifests cannot be used to work around a count
cap because each manifest generation replaces the permission set.

## What is proven locally

Synthetic fixtures exercise three-page discovery, duplicate rows, unlisted
organizations, expired and explicit grants, page-budget exhaustion, source outage
and cursor cycles. They prove adapter behavior, not real art, software, research,
place-based or language coverage. The older semantic comparison and 1k/10k/100k
scale benchmark remain synthetic too.

`indexed` in the aggregate means a structurally extractable source view, not a
persisted record or a redisplay grant. `permittedProjects` is the extractable,
listed subset with unexpired entries in the supplied manifest. Without that
manifest it is zero by construction. `indexAgeMs` measures time since the API's
index timestamp when available; neither `createdAt` nor `indexedAt` establishes
source-update time, so propagation lag is deliberately null.

A real evaluation still needs a permitted corpus, held-out need/offer judgments,
evidence accuracy, recall and relevance by domain/language, lexical-versus-hybrid
comparison and latency through actual PostgreSQL retrieval. Source changes and
withdrawal must be observed through read-back before claiming freshness or removal
latency. No write was made to a live Certified record during this review.

## Readiness CLI correction

The normal readiness entrypoint imported `config.ts`, which imported `bridge.ts`
only for its configuration validator. That loaded `oidc-provider` and the server
module graph before invalid configuration could be rejected. Measured CLI runs
took 7.29 to 11.77 seconds, approaching or exceeding the existing 10-second guard.

The same configuration contract now lives in lightweight `bridge-config.ts`;
`bridge.ts` re-exports it for existing callers. Invalid configuration fails through
the same sanitized CLI result in 0.26 to 0.40 seconds in focused runs. The regression
check runs the normal entrypoint with an import hook that rejects any load of
`oidc-provider`; it retains the 10-second timeout and checks that no private
configuration reaches output. This is local process proof, not hosted readiness.
