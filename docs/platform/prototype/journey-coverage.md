# Weave journey coverage

Updated 11 November 2026. The implementation branch `codex/weave-social-live`
starts at design commit `2cf6a7a`, which includes `develop` at `0520df8` and the
review through DL-045. This report records implementation and local evidence. Hosted validation is
deferred at the maker's request, and the production pilot remains off.

## One interface over real services

`LiveSocialProvider` supplies the agreed Your initiatives, Your initiative and
project steps with the account and project APIs. The team route uses the same
card and status-row patterns. Sharing and public publishing open focused dialogs
around the existing server-reviewed commands, preserving revision checks,
consent, uncertain-request recovery and viewer restrictions. The parallel project
directory layout has been removed. Settings retains account and backup recovery.

Your initiatives separates device cards, private saves and granted team workspaces
under **In Weave**, and eligible projects not yet in Weave under **On Certified**.
Names open the cards. Opening a workspace does not copy the device draft into it.

## Journeys and proof

“API-connected fixture” means the production-facing components call same-origin
handlers backed by synthetic data in `app-fixture`. It does not mean hosted
Certified, PostgreSQL or Supabase Auth was exercised.

| Journey | Implemented behavior | Evidence and remaining boundary |
|---|---|---|
| First visit with a Certified project | Read personal and group projects, choose explicitly, open a granted workspace or request setup, then save needs and offers privately. | API-connected fixture: named groups, project selection and member setup request. A request survives reload and grants no access. Real Certified sign-in and activation need hosted validation. |
| First visit without a project | Describe locally, explore funding, save privately after Certified sign-in, then review creation of a group and project. The group address is proposed; Change the address reveals its field. | API-connected fixture: private save and reload without another sign-in. Creation validation and durable retry have automated tests. The fixture deliberately does not create a Certified group; the real creation round trip remains unverified here. |
| Returning with a project | Home can resume a currently granted team workspace. Your initiatives opens its canonical workspace, keeping device work. Editors manage entries; admins manage teammates. | API-connected fixture: Home resume, private team edit, selected sharing, direct fit and viewer read-only access. Invitations and handle resolution also have local proof. No hosted two-account proof in this round. |
| Returning without a linked project | Resume a device draft or private account save, browse funding, then choose a Certified project or create one without re-entering the card. | API-connected fixture and adapter tests: account save/load, backups before switching and explicit duplicate selection. Exact-ID missing-save recovery has automated tests; it was not rendered against a deleted hosted record. |

## Actions and boundaries

- **Needs and offers:** editors save privately to the team. An entry can have no kind
  of support privately; sharing requires at least one reviewed kind. A sharing
  review includes only the selected entries. Undated shares remain active until
  closed or withdrawn. Viewers have no mutation controls.
- **Partners:** public Certified evidence is compared on the device without sharing
  private entries. It is labelled relevant experience or possible use, with unknown
  availability. Direct fits from shared entries stay separate. Network matching
  requires a linked workspace and a shared entry.
- **Teammates:** invitation links are the default. Pending and claimed invitations
  appear with Revoke. Direct entry uses a Certified handle resolved on the server
  with handle-to-DID and DID-to-handle verification. Resolution grants no access.
  Roles read Can view, Can edit and Manages teammates. Group membership and a
  separate workspace grant remain required.
- **Project metadata:** group display names and handles are optional public profile
  metadata, never authority. Imported projects replace only the fields actually
  supplied by Certified; missing place and links preserve the device card.
- **Duplicates:** signed-in checks at Needs and offers and beside Save compare
  names and links against the person's project list. Linking always requires a
  choice. The current provider exposes verified name and description, so URL
  matching needs actual source links before it can improve these results.
- **Learning and education:** `learning` is accepted in matching summaries,
  publication validation, the draft Lexicon and team-content candidate SQL. Optional
  public `lenses` are visible in the review. Changing a published lens projection
  queues withdrawal and requires a new publication review.
- **Recovery:** a missing first-page list item is checked by its exact ID. Only a
  confirmed 404 under the same authenticated account clears the saved binding;
  changed revisions and unavailable services require reload or retry. Device work
  stays intact. A 503 shows retry, without claiming there are no Certified projects.
- **Example only:** reminders, account deletion (R42) and fund suggestions remain
  outside the live service contract. Synthetic records, example controls and the
  local account switcher are excluded from production bundles.

## Public search before sign-in

Certified's API repository defines an unauthenticated
[`org.hypercerts.collection.searchCollections` query](https://github.com/hypercerts-org/api/blob/dcd83196ac47c94866b55bfdca480cf8b944e6fc/packages/api/src/lexicons/org/hypercerts/collection/searchCollections.defs.ts).
It accepts a search string and a project-type filter; the documented match is a
case-insensitive substring of title or short description. The contract was
verified, but a live response could not be checked from this environment. It is
not a URL-duplicate query, an exhaustive index guarantee or proof of ownership.

This round does not send a visitor's private card to public search. A future
pre-sign-in check should use a deliberate public search action, explain the words
being sent, review indexed coverage and limits, and retain explicit linking after
sign-in.

## Rendered verification

Proof class: **fixture, Codex in-app browser**, using the `app-fixture` environment
on port 5175. No hosted bridge was needed. At 360 px and 1280 px, light and dark
views were inspected with keyboard interaction; the checked pages had no
horizontal overflow. The five-minute review covered the card, status rows,
audiences, focus visibility, modal dismissal and recovery.

Observed flows include private team editing, an editable support suggestion,
Escape preserving unfinished words, private save, selected sharing with the
unselected offer remaining private, a direct fit afterward, Home resuming the
team, admin pending invitations, handle resolution, member setup request and
private save surviving reload, viewer read-only suggestions, and the 503 retry
state preserving the device card. Keyboard checks included opening the edit and
sharing dialogs, Tab and Shift+Tab traversal and retained focus after saving.
This is focused browser proof, not a complete accessibility audit.

Run `WEAVE_ACCOUNT_FIXTURE=1 bun run --filter @weave/app dev --port 5175` when that
port is free. `/__fixture` selects a synthetic viewer, editor, admin, member or
unavailable-service account. The admin starts with pending invitations. The member
has a project that needs setup. These controls exist only in the local fixture
server and do not change the production tester gate.

## Independent review, 11 November 2026

Separate reviewers inspected the API/database boundaries and the app state/access
flows. The API review found no actionable defects. The app review found three
regressions, now fixed and re-reviewed: first-page refresh could hide older private
saves, results-only matching omitted retry feedback, and hiding a sharing or
publication task discarded uncertain request state.

Account pagination now resets when its first page changes and rejects a stale
in-flight page. Every matching view retains notices and exact-command retry.
Sharing and publication tasks retain their instances when hidden, while nested
reviews follow visibility. A delayed native close event cannot close a different
task. Regression tests cover pagination and retry command identity. The local
Codex browser also confirmed that a sharing choice survives closing the task,
opening publication and reopening sharing, using Escape and Enter at 360 px in
dark and 1280 px in light. No public write was made in that check.

The user authorized commit and merge into `develop` after review and fixes, while
explicitly deferring live validation. No deployment, tester-gate change or SQL
application is part of that integration. Hosted preview proof remains a release
check rather than evidence claimed by this merge.

## Before release

Local checks passed: `bun run ci` ran 129 site/catalog tests, 156 API tests,
207 app tests, 20 design-system tests and 78 harness tests successfully. The 38
opt-in PostgreSQL, Auth and PostgREST checks skipped. `bun run typecheck` and
`git diff --check` passed. CI also verified guidance, current design tokens and
the exclusion of synthetic fixtures from the production bundle. The app guide's
social-module description was updated to match the live adapter and passed the
guidance check. No dependencies, lockfile or tracked generated output changed.

1. Execute the opt-in PostgreSQL, Auth and PostgREST suites against an isolated
   database. Candidate SQL has not been applied to Platform in this round.
2. Validate real Certified group creation, named profiles, handle resolution,
   invitations, setup approval and access changes with the approved two accounts.
   Repeat sign-in and private save/load across a redeploy.
3. Keep group public publication disabled until the hosted group service proves
   conditional deletion and read-back. Review and withdrawal tests are not proof of
   successful public publication.
4. Confirm permitted corpus ingestion, refresh/removal, match quality and latency.
   Semantic retrieval remains disabled. Confirm the six-lens launch metric with
   the council; the learning lens does not resolve that product metric decision.

## Implementation request, 10 November 2026

> The Weave design branch is rebased onto `develop` (`0520df8`) in the pull request
> that adds this file. It keeps your live wiring and adds the second design review,
> native back navigation (DL-041), the Learning and education lens (DL-040) and the
> duplicate prompt (DL-042). Read `docs/platform/prototype/journey-coverage.md` first,
> then `packages/design-system/decision-log.md` DL-033 to DL-042. Keep the production
> pilot off, validate locally with the `app-fixture` server, and run `bun run ci`.
>
> 1. **One set of screens.** The design screens (Your initiatives, Your initiative,
>    and the sharing, publishing and project steps in `src/social`) are the agreed
>    interface. The live screens (`LiveYourInitiatives`, `AccountSection`,
>    `ProjectDirectory`, `TeamWorkspace`, `TeamEntries`, `PublicSupport`,
>    `SavedMatching`) show the same journeys in another shape. Implement the
>    `SocialService` contract in `src/social/fixture.ts`, or an adapter with the same
>    shape, against the live API, so the design screens run in production. Then retire
>    or restyle the parallel live layouts. Keep every viewer rule and recovery state
>    you built. Your initiatives lists "In Weave" (the card on this device, private
>    saves, team workspaces) and "On Certified" (projects not yet in Weave), each card
>    opening from its name. The workspace route renders the initiative page: card first,
>    one status row per open step with one filled button, then Partners for you and
>    Funding that fits.
> 2. **Teammates by handle.** Replace "Teammate's Certified DID" with a Certified
>    handle resolved to a DID on the server. Make an invitation link the default way to
>    add someone. Show pending invitations as a short list with Revoke, and name roles
>    "Can view", "Can edit" and "Manages teammates".
> 3. **Group names.** `list_project_groups` returns only DIDs. Return each group's
>    display name and handle from Certified so the project picker can show names.
> 4. **Duplicate check in production.** When someone is signed in, compare the card's
>    name and links with their Certified projects (`list_projects`), using
>    `src/initiative/duplicates.ts`, at the needs step and beside Save. Link only when
>    the person chooses. Catching duplicates before sign-in needs a public project
>    search; say whether Certified can offer one.
> 5. **Learning lens.** `account-contract.ts` accepts `learning`. Add it wherever else
>    lenses are validated or indexed: matching, the publication Lexicon and the
>    Supabase candidates.
> 6. **Project creation.** Propose the group's web-address name from the initiative
>    name, validate it on the server, and show the field only behind a "Change the
>    address" link.
> 7. **Resume and stale state.** Let Home resume a team workspace as well as the card on
>    this device. When the account no longer has the record the device thinks it saved,
>    say so and offer to save again, instead of showing Saved.
> 8. **Fixtures.** Extend the `app-fixture` server with an admin who has pending
>    invitations, a member who must request a workspace, and a project list. Your
>    initiatives and journeys 1 and 3 can then be checked locally without the hosted
>    bridge, along with the 503 path.
> 9. **Still example only.** Reminders, account deletion (R42) and the suggest-a-fund
>    endpoint need contracts before their screens leave the example world.
>
> Report which journeys run end to end live, what you verified at 360 and 1280 px in
> both themes with the keyboard, and what still waits on Certified or the database.
