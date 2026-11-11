# Draft AT Protocol support listing

[`com.regencommons.weave.supportListing`](com/regencommons/weave/supportListing.json)
is a proposed record for one public need or offer. “Support listing” describes
what someone is seeking or offering before a match or partnership exists.
The `kind` field distinguishes the two. Each listing points back to a Certified
project with `projectUri`. The project record needs no schema change.

`capitalForms` requires one to eight of Weave's existing values. More than one
can apply, and order does not indicate priority. Publishers must reject duplicate
values, as the [Weave account contract](../src/account-contract.ts) does. The
Lexicon constrains the array and its item values. The publishing service also
checks uniqueness and, when `expiresAt` is present, that expiry follows creation.
Omit `expiresAt` for an undated listing. It stays open until someone closes or
withdraws it, subject to the project's eligibility.

`lenses` optionally carries the reviewed initiative types of work, including
`learning`. Older listings may omit it. The public review names these fields
before confirmation. Changing included types queues withdrawal of the previous
listing and requires a fresh review before republication.

`createdAt` identifies the first publication at the entry's stable record key.
Weave includes a later `updatedAt` in each new reviewed publication. The timestamp
advances even when someone republishes the same details, giving the replacement
a different CID so a delayed conditional delete cannot remove it.

Example public record with fictional data:

```json
{
  "$type": "com.regencommons.weave.supportListing",
  "projectUri": "at://did:web:example.org/org.hypercerts.collection/3jui7kd54zh2y",
  "kind": "offer",
  "title": "Oral history transcription",
  "description": "We can transcribe up to five hours of recordings for a community archive.",
  "capitalForms": ["experiential", "cultural"],
  "status": "open",
  "createdAt": "2026-11-09T18:00:00Z",
  "updatedAt": "2026-11-10T18:00:00Z",
  "expiresAt": "2027-01-31T00:00:00Z"
}
```

## Pilot boundaries

- Keep private saves and Weave-only shares in Platform. A workspace editor explicitly
  publishes the reviewed public fields. AT repositories are
  [public](https://atproto.com/specs/repository).
- Resolve `projectUri` to a current project record. For the pilot, accept a
  listing as project-authored only when its repository DID matches the project
  repository DID. Personal and group writes need separate checks of the
  person's authority and consent.
- Retain one public record key per exported entry so retries and edits keep its
  identity. Index updates and deletions. Treat a closed or expired listing as
  inactive even if an old snapshot still exists.
- First prove one need and one offer in a disposable repository, with an
  independent reader that can discover, validate, and group them by project.
  This draft is ready for local validation. Hosted write permissions, read-back,
  and index behavior still need that pilot.

## Local publication lifecycle

`support_review` returns the exact public record, repository DID, audience
`public-atproto`, saved revision, entry revision and a ten-minute review expiry.
That review expiry is separate from the optional listing end date. The explicit
`support_publish` command confirms that audience and the reviewed record. Personal
writes require the repository owner and collection-limited create or delete consent.
Group writes also require a current Certified member with an explicit Weave editor
grant, and Certified enforces the record's author permissions on each write.

The server stores the intended record and stable key before sending a create.
Only one durable claim may send that operation. Retries read the same public AT URI
and compare its content and CID. A definite authorization rejection can be retried
after authority changes. An uncertain create that has never been observed remains
pending; the server does not send a second create that might arrive after withdrawal.

Editing published details, closing or deleting the entry, or confirming that the
parent project was removed or unlisted queues withdrawal with the private change.
Replacement details stay private until another explicit publish. Deletion sends the
expected public CID as `swapRecord` and remains pending until independent public
read-back confirms absence. Withdrawal remains available for a paused project when
the editor has the required upstream authority. A provider outage leaves the request
and private work intact.

This slice recognizes withdrawal through another app when verified read-back returns
`RecordNotFound`. A changed record, including one that now has a terminal status,
reports a conflict for review. A terminal status alone does not prove that the public
details were deleted. External deletion changes only the public publication state;
it preserves the saved entry and any eligible Weave matching share. Other readers
may retain records that were previously public.

`support_state` returns at most 100 current or historical publication rows and a
workspace-bound `nextCursor`. Follow the cursor to reach older pending withdrawals,
including listings whose private entries were removed.

The standalone public-reader fixture in
[`support-publication.test.ts`](../src/support-publication.test.ts) discovers a need
and an offer through public `listRecords`, reads each with `getRecord`, checks the
draft Lexicon and groups both by project. Personal and group lifecycle fixtures use
synthetic repositories. They establish local behavior, not hosted permissions.

Keep `WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED` unset or `false` until the selected
Certified Group Service and backing PDS pass the hosted conditional-delete proof.
The adapter blocks both group creation and deletion while this gate is off. The
[upstream handler](https://github.com/hypercerts-org/certified-group-service/blob/main/src/api/repo/deleteRecord.ts)
forwards its input to the PDS, but source inspection does not verify a deployed
service. The standard
[delete Lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/repo/deleteRecord.json)
defines the expected-CID condition. Group-page display, partner indexing and schema
publication remain separate work.

Regen Commons can [publish the schema](https://atproto.com/guides/publishing-lexicons)
under its own namespace. After the independent reader test, ask Hypercerts about
[Jetstream ingestion](https://docs.hypercerts.org/reference/services/relay#default-lexicons)
and discuss API and Certified project-page support separately.
