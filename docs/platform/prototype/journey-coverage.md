# Weave journey coverage

Updated 11 November 2026. The implementation branch `codex/weave-social-live`
starts at design commit `2cf6a7a`, which includes `develop` at `0520df8` and the
review through DL-045. This report records implementation and local evidence. Hosted validation is
deferred at the maker's request, and the production pilot remains off. The design polish that
followed PR #38 is under [Design polish on develop](#design-polish-on-develop-11-november-2026).

## One interface over real services

**Target changed 12 November 2026:** the user chose
[public creation in Ma Earth or Certified, followed by linking in Weave](../08-accounts-and-saving.md#public-project-creation-and-return).
Existing records are reused. The creation forms and fixture results documented
below describe the implementation before that decision, not the new target.
The [local handoff implementation](#external-editor-handoff-13-november-2026) covers
draft preservation, external-editor choice, a possible second code/consent step,
return/discovery, explicit selection, private upstream drafts and canceled or failed
handoff. Real external publication and return still need hosted validation.
Do not claim prefill, automatic return or
Ma Earth adoption is available. The four account flows and all viewer/access,
private-save, sharing and support-publication boundaries remain required.

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

## Design polish on develop, 11 November 2026

The design branch `claude/weave-ui-polish` starts at `develop` `810e199`, after PR #38. It
polishes the API-connected screens instead of adding new ones, and keeps every behaviour
listed above. The production pilot stays off.

| Journey | What changed |
|---|---|
| First visit with a Certified project | Home's hero carries the website's mycelium and paper grain, matched to regencommons.com, and on phones a tuft grows on its own every few seconds (DL-046, DL-048). On wide screens the header holds three sections and the logo goes home (DL-049). On Your initiatives the In Weave and On Certified lists lead, and the signed-in line closes the page. A workspace this account cannot open now says what to do: ask a workspace admin for an invitation link. |
| First visit without a project | Your initiative takes the initiative's name as its heading, under a Your initiative eyebrow, and the card no longer repeats it (DL-047). Funding that fits says plainly when nothing in the catalog matches yet. |
| Returning with a project | The team workspace names the initiative under a Team workspace eyebrow, then says what this person can do there. The header's save status steps aside, so the page's own rows are the one account of saving and sharing. Manage teammates leads with the default: choose what they can do, then create an invitation link. Adding someone by handle sits behind a disclosure, and each pending invitation says what it is, when it expires and what the admin can do. |
| Returning without a linked project | The same named heading on Your initiative, and the account line at the end of Your initiatives. |

Every section now has its own accent for where you are (Home forest, Initiatives teal, Funding
gold, Your initiatives signal blue), while buttons and links stay green and funding cards keep
funding gold wherever they appear (DL-050).

Home now reads the live funding catalog. Until this round it read funding only from the
development examples, so production showed no funding-closing-soon link and an empty Funding
closing soon section. Home shares Funding's request, starts it once the page is idle, shows the
three open calls that close soonest with Funding's own card, and counts closing calls with the
Funding filter's rule, so the hero's number matches the list its link opens.

### Proof

Proof class: **fixture**. The `app-fixture` server ran on port 5173 with
`WEAVE_ACCOUNT_FIXTURE=1`, using the synthetic visitor and admin accounts.

- **Home hero, Chrome with DevTools emulation, 360 px with touch and 1280 px with a mouse, light
  and dark.** Under reduced motion the mycelium is drawn at once, and its pixels do not change
  over three seconds or under mouse moves. With motion allowed, a mouse grows tufts that fade
  back to the identical resting picture, and touch never changes it. On a phone with touch and no
  mouse, the canvas changed on its own eight times in five seconds; under reduced motion it stayed
  still. The phone canvas is capped at 1.5 times pixel density, its threads grow from the top
  corners, and a theme change recolours it without a reload. The hero shows no band against the
  page in either theme. No page overflowed horizontally.
- **Header, Chrome, 1280 px light.** Initiatives, Funding and Your initiatives sit at their own
  widths, 32 px apart and 32 px from the logo, which is the current page on Home. During a page
  transition nothing in the header animates. At 360 px the bottom bar keeps four 90 px tabs.
- **Manage teammates, Chrome, 360 px dark, keyboard only.** Focus starts inside the sheet, Tab
  follows the new order with a visible focus ring, and Escape returns focus to Manage teammates.
- **Headings, Chrome and the Claude desktop browser pane.** The workspace heading at 1280 px
  light and 360 px dark, and Your initiatives at 360 px dark, with no overflow.
- **Home's live catalog, Chrome and the Claude desktop browser pane.** With no example scenario,
  Home loads the committed catalog release: the hero read 19 funds closing soon, and Funding
  listed 19 of 768 records for the same filter, opening without a skeleton. With the first
  catalog request blocked, Home showed its notice and said funding did not load; Try again
  recovered both. Checked at 1280 px light and 360 px dark; Tab reaches the link with a visible
  focus ring.

Voice capture could not be exercised in either browser. No hosted Certified, database or
production check was made.

Local checks passed: `bun run ci` ran 129 site and catalog tests, 27 design-system tests, 156
API tests with the 38 opt-in database checks skipped, 210 app tests and 78 harness tests, and
confirmed current design tokens and guidance. The app typecheck and `git diff --check` passed,
and the build changed no tracked files. No dependencies or lockfile changed.

### Still waiting on the backend

- Claimed invitations return only a DID, so the list reads "Certified account ending …". The
  server should return the verified handle, so an admin knows who asked before approving.
  [The Codex task](../handover/04-invitation-handles.md) sets out the work; quality checks
  start once it lands.
- Shared initiatives exist only in the example world. In production, Home's Recently shared, its
  shared count and the Initiatives list show their empty states until public listings arrive.

### Decided by the maker

- The mycelium goes beyond Home, onto doorways: signing in to Your initiatives and a missing page
  (DL-053).
- The header's logo is the website's living ring, grown once and filled under a mouse (DL-054).
- A project that fits several needs and offers shows once in Partners for you, naming each fit
  (DL-052).
- The grain now uses the website's strength, so it no longer shows behind the search field.
- A card on a shared device follows the account it belongs to (DL-055). Checked with the editor
  and admin fixture accounts in one tab: after the editor opened a project, the admin saw it once,
  as their own Certified entry, with a quiet line for the set-aside card; Home, the header, the
  card's pages, partners and funding fit left it out; switching back gave the editor the card again.

### Accessibility checks, 11 November 2026

Proof class: **fixture**, Chrome with DevTools emulation.

- **Forced colours.** The mycelium and grain hide, buttons and cards keep system borders, and
  keyboard focus shows a clear ring. Every header tab showed a bar, because transparent borders
  become visible; now only the current tab keeps one, in the system highlight, in App header,
  Bottom navigation and Tabs.
- **200 percent zoom** (a 1280 by 800 window): eight pages reflow to the phone layout with no
  horizontal scrolling. The sticky header and bottom bar leave 70 percent of the window for
  content.
- **Voice.** Speech stays on the device. This Chrome reports its English speech pack as
  downloadable, not installed, so Weave hides Speak and people type. With a simulated local
  engine, Speak shows "Listening on this device", writes words as they come and puts the
  finished text in the field. Real speech with a microphone is left for quality checks with a
  person. Weave could offer to download the speech pack where Chrome reports it as downloadable.


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

## External editor handoff, 13 November 2026

The app replaces new inline public creation with a choice of Ma Earth or Certified.
The project step reads existing authorized projects first. Leaving waits for a
stored device draft, including source words and file bytes. A small session-storage
hint is scoped to the same account and draft; no draft content or identity token
is placed in the external URL. Your initiative and Your Initiatives offer Find my
project on return. Discovery refreshes, and the person explicitly selects and links
the canonical project through the existing server checks. Linking preserves need
and offer identities and does not save to a team, share or publish entries.

`src/initiative/editor-handoff.ts` owns navigation safety and return hints;
`src/initiative/ProjectEditor.tsx` uses the existing choice and dialog patterns.
The legacy creator only resumes a stored intent. The existing server create command
remains for older clients; server retirement is a separate reviewed change.

Local validation uses `app-fixture`, the creator account at `/__fixture`, and a
synthetic external editor. That stand-in can return without publishing or expose a
fictional group project, then run discovery, selection and workspace setup using
the app's real adapter over synthetic handlers. It never contacts an external
editor. Unit and fixture tests cover failed/conflicting storage, changed drafts,
account isolation, cancellation, malformed return hints, legacy uncertain requests,
repeated discovery without duplicate links and stale response suppression.

**Fixture proof, Codex in-app browser:** checked the handoff and return at 360 px
and 1280 px in light and dark themes, including keyboard radio selection, Tab,
Enter, task focus and scroll access to the primary action. Both editor choices
reached only the local editor stand-in. Returning without publication kept the
device draft and offered discovery again. After synthetic publication, the project
was not selected automatically. Explicit linking and reload retained the original
private need and offer, and the team workspace still required its separate setup
action. No horizontal page overflow or browser console errors were observed.
This does not establish actual Ma Earth / Certified publication or discovery.

Checks: `bun install --frozen-lockfile`, `bun run --filter @weave/app typecheck`,
`bun run ci` and `git diff --check`. CI passed 711 tests, including all 273 app
tests and the production-bundle fixture exclusion check. The existing 47 opt-in
PostgreSQL tests were skipped; this slice changes no API handler or database schema.

Independent review found and fixed an early task-unmount race and permissive editor
hint parsing. The live service now completes durable device storage and hint cleanup
before emitting a project selection. Delayed and failed writes, cancellation and
concurrent edits have regression tests. A second fixture browser check linked from
Your initiative, verified hint cleanup in Your Initiatives, and reloaded the original
private need and offer. Re-review found no remaining behavioral issues.

Hosted checks still need actual publication in each external editor, another
code/consent step where required, enumeration after return, a second project under
one existing organization and current group authority. Prefill, automatic callbacks,
Ma Earth adoption of existing external projects and membership synchronization
remain unverified. No deployment, migration or production setting is part of this slice.
