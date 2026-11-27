# Draft AT Protocol support listing

[`com.regencommons.weave.supportListing`](com/regencommons/weave/supportListing.json)
is a proposed record for one public need or offer. “Support listing” describes
what someone is seeking or offering before a match or partnership exists.
The `kind` field distinguishes the two. Each listing points back to a Certified
project with `projectUri`. The project record needs no schema change.

`capitalForms` names one or more forms of capital, and the Lexicon allows up to
16 so the list can grow. Weave publishes one to eight of its existing values. More
than one can apply, and order does not indicate priority. Publishers must reject
duplicate values, as the [Weave account contract](../src/account-contract.ts) does.
The Lexicon limits the array's length and each value to 64 bytes. The publishing
service also checks each value, uniqueness and, when `expiresAt` is present, that
expiry follows creation.
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

## Closed and open value sets

`kind` is a closed `enum`: a listing is a need or an offer, and nothing else.
`capitalForms`, `lenses` and `status` use `knownValues`, following the
[Lexicon style guide](https://atproto.com/guides/lexicon-style-guide), so the lists
can grow without a new record type. Weave still publishes only the listed values,
and a test keeps the Lexicon's lists equal to the ones the publisher accepts.

Readers must tolerate values they do not recognize. Treat a listing whose
`status` is anything other than `open` as inactive, and ignore unrecognized forms
of capital or lenses rather than rejecting the listing. Weave's own readers are not
there yet: the public initiative page runs the strict `parseSupportListing`, the
browser's `publicListingReview` is as strict, and both leave out a listing with
any value they do not know.
That is safe while only Weave writes these records. They must become tolerant
before Weave reads listings other apps write (D47) or adds a value.

Records under this name are already public, so from this change on, change the
schema only by adding optional fields or new known values, and leave every length
limit as it is.

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

Since DL-155, Make It Public publishes from the device draft with no private save.
The app links the person's own project with `link` and no `initiativeId`, which
makes a project link no saved card anchors; the verified Certified DID that owns the
repository holds it. `support_review` with an `entry` (`title`, optional
`description`, `capitalForms` and optional `lenses`) builds the public record from
those fields alone, under the same limits `parseSupportListing` puts on the record,
and Weave never sees the draft again. A review of a saved entry, with
`expectedRevision` and `expectedEntryRevision`, still works until private saves
retire, as step 4 of the
[removal plan](../../../docs/platform/08-accounts-and-saving.md#retiring-private-saves-and-weave-only-sharing)
sets out. Both need `supabase/candidates/weave-publish-from-draft.sql` on Platform.

`support_review` returns the exact public record, repository DID, audience
`public-atproto`, saved revision, entry revision and a ten-minute review expiry. A
draft's review names revision 0 for both, and the app refuses any other answer.
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

A listing published from a draft does not follow later edits: the public record stays
as it is until the person withdraws it and publishes again, which keeps its record
key and first date. For a listing published from a saved entry, editing published
details or closing or deleting the entry queues withdrawal with the private change,
and replacement details stay private until another explicit publish. Confirming that
the parent project was removed or unlisted queues withdrawal of either. Deleting a
saved card leaves its project link and Weave's record of the listing, so the
withdrawal can still finish. Deletion sends the
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
including listings whose private entries were removed. A project link no saved card
anchors is not in `list_workspaces`; a signed-in device reaches it through `lookup`
or `link` on the project, and `support_withdraw` takes its listings from there. The
app has no screen for withdrawing those listings yet.

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
