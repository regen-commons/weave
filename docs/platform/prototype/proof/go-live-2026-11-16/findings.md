# Uncovered go-live findings

These six findings are tracked in the consolidated evidence draft PR because
GitHub returned **410: Issues has been disabled in this repository**. No issue
was created, repository settings were not changed, and no empty fix PRs were
opened. Each section is a separate follow-up with reproduction, triage and
acceptance criteria. The two user-designated launch blockers have their own fix
drafts, linked from the [evidence record](README.md#findings-and-tracking).

"Fix this week" and "later" are triage recommendations, not additional launch
blockers. Evidence is **production, Brave**, on 15 to 16 November 2026 Pacific at
`21a0900`, except the explicitly handover-only localhost finding. No implementation
or production change is included here.

## Certified source place and links

**Fix this week.** Linking an existing Certified project preserved its name and
shortDescription but left Where and links blank, although the public source had
those fields. The duplicate warning appeared, and Use this project reused the
workspace without creating a duplicate. The shortDescription was already
shortened at source; that shortening is not the defect.

Reproduce with a synthetic Certified project carrying an explicit place and
business links. Link it through the duplicate/reuse path and compare the checked
card with the source. The tested production projects already had workspaces, so
the separate On Certified entry was unavailable; no workspace was removed to
force that route.

Acceptance criteria:

- Source place and links arrive through both fresh linking and existing-workspace
  reuse, with no invented values or replacement of reviewed local edits.
- Reload preserves the imported fields; duplicate handling creates no extra
  project and does not overwrite a team card without the existing review step.
- Private/device-only status stays explicit. Test missing and ambiguous source
  fields separately.

## Soil research and test data

**Fix this week.** The synthetic need `We need open research and soil test data.`
and offer `We offer open research and soil test data.` both suggested Intellectual
and Living. Expected: Intellectual only. These are two of the four failures in
the [20-sample production check](quality-results.json). The other two failures,
explicit negation, are covered by [draft #80](https://github.com/regen-commons/weave/pull/80).

Reproduce in keyword mode on Needs and offers before manual correction. This
finding is outside the negation patch.

Acceptance criteria:

- Soil research/data alone does not suggest an actual living resource.
- Requests and offers of soil, seeds and water still suggest Living; mixed
  resource/data examples retain every justified kind.
- Manual correction, Keep and reload retain the person's reviewed choice.

## Selective deletion and QA cleanup

**Fix this week.** The UI has no individual saved-card or device-backup delete
control. Read-only review found `/api/account` supports list/load/save/sign-out,
with narrow authenticated RPCs and no initiative-delete command.
`DraftRepository` supports load/save/replace/backups; blank replacement backs up
the previous draft first. Supported controls therefore cannot finish the
[retained manifest](README.md#cleanup-retained-not-completed): two synthetic cloud
cards, one device draft and seven backups. No current-task support entry was
shared, so withdrawals needed are zero.

Reproduce with disposable synthetic saves and a device draft with two backups.
Preserve real data, older QA, workspaces and withdrawn entries. No whole-account
deletion, browser-wide clearing or arbitrary IndexedDB mutation is an acceptable
substitute for a supported selective operation.

Acceptance criteria:

- Cloud deletion checks owner, exact initiative UUID and expected revision, and
  rejects unsafe workspace/publication references before any cascading removal.
- Local deletion uses exact keys/draft IDs/revisions and compare-before-delete.
  Displayed time is `draft.updatedAt`, not the backup key timestamp; title/time
  alone cannot identify the target safely.
- Unauthorized callers and stale revisions fail safely. Tests prove unrelated
  records/backups and shared workspaces survive.
- A supported cleanup reports exactly what was removed and retained. Keep
  private selectors out of public evidence and obtain any required action-time
  confirmation before irreversible deletion.

## Stale catalog notes and date header

**Fix this week.** All [13 checked deadline dates](deadline-checks.md) matched
official sources, but the Haymarket `sustaining-grants2026-27` note says its page
uses `was` while the checked page uses `is`. The page also retains an inconsistent
October 2025 application-package reference. Weave Funding still labels its data
`Research snapshot 29 October 2026` after later research updates.

Recheck the [Haymarket source](https://www.haymarket.org/grants-1) and the catalog's
authoritative research metadata. This finding does not establish a wrong
deadline, resolve a CDFW timezone or authorize Funding Commons publication.

Acceptance criteria:

- Update the source note through the catalog workflow and preserve uncertainty
  in the source's conflicting package reference.
- Derive the displayed snapshot date from the authoritative research metadata,
  with an honest fallback if it is missing.
- Regenerate output from its inputs; run importer/build/tests as the catalog
  guide requires. Keep publication separate from the draft PR.

## PDF structured place

**Later.** A one-page synthetic PDF was read on device and its source words were
retained, including an explicit place, but structured Where stayed blank. This
is incomplete structured extraction, not evidence of invented text. Audio/model
extraction was N/A in Brave.

Reproduce with a synthetic PDF naming one initiative and an explicit place.

Acceptance criteria:

- Preserve the source words and propose only explicitly stated places for
  review; do not silently infer a country or map location.
- Prove structured-field assignment, manual correction and reload.
- Ambiguous or missing places remain unassigned with a usable review path.

## Expired sign-in returns to localhost

**Later / known, handover evidence only.** The original go-live handover identifies
an expired Certified sign-in path to localhost associated with the shared
Platform Auth Site URL. This behavior was not reproduced in this production QA;
all observed sign-ins finished within five minutes without localhost. Existing
issue/PR searches found no matching tracker. Treat this as a known follow-up,
not a newly observed regression.

Acceptance criteria:

- First reproduce a deliberately expired authorization and record a safe
  error/return path without exposing identity, code or token data.
- Any proposal to change the shared Auth Site URL/redirect settings includes
  other consumers and needs the user's separate approval.
- Verify existing application redirects and recovery after expiry before any
  approved shared configuration change is considered complete.
