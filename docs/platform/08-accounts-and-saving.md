# Saving initiatives and accounts

Status: revised 26 November 2026, when needs and offers moved to two places, this device and public listings (DL-155). The [removal plan](#retiring-private-saves-and-weave-only-sharing) retires private saves and Weave-only sharing. Earlier: public project creation policy revised 12 November 2026; the editor handoff was added locally on 13 November, with hosted validation pending. See [journey coverage](prototype/journey-coverage.md#external-editor-handoff-13-november-2026) for its proof and limits. The earlier matching flows and their evidence remain below. Certified sign-in and private Save/Load have local and limited hosted proof, including return after a bridge redeploy. Shared-entry matching and the external-evidence index are implemented, and the matching migrations and preview rollout are complete. The live public corpus, semantic activation and full release acceptance remain pending. See the [rollout evidence](05-technical-spec.md#hosted-preview-rollout-8-november) for verified behavior and remaining checks.
Companions: [PRD](04-prd.md) · [technical spec](05-technical-spec.md#5-identity-and-access) · [decision register](open-decisions.md#certified-only-sign-in-and-private-saving) · [design spec](research/certified-hypercerts-2026-11-06/design-spec.md#one-sign-in-including-first-use).

Certified is the only sign-in flow. Weave automatically creates or retrieves an
internal account record for the proven identity, which also owns any private saves
made before DL-155. People do not register separately with Weave. Drafting needs no
account. Publishing needs Certified authority for the project, not Ma Earth
participation or Regen Commons membership.

## The decision

Revised 26 November 2026 by DL-155: items 2 and 3 now name publishing, not saving.

1. Show value before sign-in. Browse public initiatives and funding, and prepare an initiative draft on this device.
2. Offer “Sign in with Certified” when the person chooses to publish or withdraw a need or offer, or to link a project they manage. Certified handles the code, account setup and consent. The hosted test offers email entry in Weave for that attempt.
3. Keep sign-in and publishing separate. Return to the same task after sign-in; only Make It Public sends anything, and only the listings the person reviewed.
4. Reuse one person session for several initiatives. There is no account-linking screen, migration flow, alternate Weave code or fallback identity provider.
5. Preserve device work through every exit. Cancel, failure or Not now never discards a draft or claims it is saved.

## Where work lives

Needs and offers live in two places (DL-155):

| Place | Storage and access | Meaning |
|---|---|---|
| On this device | The browser's IndexedDB `weave-drafts` database, subject to device and browser access | The whole draft: working text, files, conversation and unfinished edits, with no account required. A browser can hold several drafts, each an initiative of its own (DL-112). Download is the backup, and import brings a draft to another browser. |
| Public | `com.regencommons.weave.supportListing` records in the project's own AT repository, one per chosen need or offer | Anyone can read them, in Weave and in other apps. The person chooses the entries, sees the exact records and their destination, and confirms once. The project's name, description and place stay Certified's own (DL-148). |

Nothing else holds a need or offer. Weave keeps a working record of what it
publishes: a copy of each public record with its address, version and read-back
state, plus the account, request and state data it needs to publish and withdraw
safely, such as a pending withdrawal. A review holds the exact record for ten
minutes before it is confirmed, and stays until the next review purges it. The
record keeps no unpublished draft beyond such reviews, and nobody saves to it. As built, it hangs off a project link that a
personal save owns; step 3 detaches it.

Being retired, under the [removal plan](#retiring-private-saves-and-weave-only-sharing):

| State | Where it is today | Until it goes |
|---|---|---|
| Saved privately | `weave.initiatives` with `weave.needs` and `weave.offers` in Platform | Existing saves stay readable and downloadable for at least 60 days after new saves stop, then the user is asked before anything is deleted (D49). They are deletable unless the server's delete guard refuses them, as it does for a card with a project link, a published listing or a project setup in progress. New saves stop. |
| Saved to a team workspace | The same tables, with `team_workspace_id` set | As above. A team prepares a draft on one device or passes it on as a downloaded file (D48). |
| Shared for matching | The `matching_*` columns on those rows, read through `private.weave_matching_current` | New shares stop, and existing ones end when published listings take over matching. |
| Saved or dismissed partners | `private.weave_matching_leads` and `private.weave_matching_reviews` | They move to the shortlist on the device (DL-153). |

Database administrators can technically read the retired tables while they last;
owner-only product access is not end-to-end encryption.

A draft gets named suggestions and evidence without publishing its entries,
following [R16](04-prd.md). The device compares it against a bounded public
snapshot of published listings and project evidence and shows that snapshot's
coverage. Nothing about the draft is sent. Inferred experience, potential uses of
an offer, public statements and published listings remain distinct. Unpublished
drafts never enter the public corpus or another person's results. Seeing a public
project does not reveal anything unpublished or give permission to contact its
team.

## Retiring private saves and Weave-only sharing

The order matters: publishing must work without a private save before private
saves stop. Until step 3, Make It Public saved the card as the project's workspace
first (the `"save"` step in `packages/app/src/initiative/publish-plan.ts`, and
`saved_revision` in `weave_workspace.support_reviews`). Each step leaves the app
working and passes `bun run ci`. A migration file in this repository is not an
applied migration: Platform changes go through the website repository
([spec 3.3](05-technical-spec.md#33-supabase-project-and-migration-ownership)), and
applying each one needs its own approval.

Production on 26 November 2026, from a count-only query: 8 initiatives saved in
Platform (2 of them team workspaces), 15 needs, 15 offers, 4 entries shared for
matching and 8 published listings (4 needs, 4 offers).

| Step | Change | Owning paths | Proof |
|---|---|---|---|
| 1 | Record the decision: DL-155, this page, R12 and R16, D47 to D49. | `docs/platform/`, `packages/design-system/decision-log.md` | `bun run guidance:check` |
| 2 | Show published listings on public pages. Apply the missing `private.weave_public_support_listings` read, or read the records from the repository. It can land first, but it joins `support_listings` to `project_links` and reads `project_links.matching_paused`, so steps 3 and 7 must carry it forward. | `packages/api/src/public-initiative-store.ts`, `supabase/candidates/weave-public-support-listings.sql`, a website repository migration | An initiative page in production shows its published listings. Today the function is missing, so the page cannot read them. |
| 3 | Publish from the draft. Done: merged in regen-commons/weave#279 and its migration applied to Platform on 27 November 2026. Make It Public no longer saves the card. It links the person's own project with `link` and no saved card, a link that the verified Certified DID owning the repository holds (approved 27 November 2026). The server reviews each open need and offer from the fields the browser sends, checked as `parseSupportListing` checks a record, with the card's types of work, which the preview now shows; one marked met, withdrawn or expired is left out. A review still expires after ten minutes. Weave's record of a listing is keyed by project link and entry: a saved card deleted with its account leaves its link and listings (`on delete set null`; the delete guard still refuses a linked card), and no new card may take a link's ID. A saved review reads a card only for its owner. Step 2's read already joins listings to links by project, so it needs no change. A listing from the draft never follows later edits. Make It Public reads back a listing already public as shown and sends nothing for it, names one still public for an entry the card no longer lists as open, and asks for one public with other details to be withdrawn first, under Public Listings on Your Initiative, then published again at the same record key. `list_workspaces` still lists a personal link only with its saved card, because the app opens a listed personal workspace as that card; the app reaches a card-less link through `lookup` and `link`. The saved path stays until step 4. Group projects still publish from the team workspace, and the draft review also accepts a group editor. Public Listings finds a project's listings by the project alone, with no saved card; it shows beside a card linked to the project, so on another device the person starts a card from the project in Your Initiatives first. Saving a card privately beside such a project saves it on its own. Critical tier. | `packages/api/src/project-commands.ts`, `packages/api/src/support-publication.ts`, `supabase/candidates/weave-publish-from-draft.sql`, `packages/app/src/initiative/publish-plan.ts`, `publish-run.ts`, `PublishInitiative.tsx`, `ProjectListings.tsx` | API and app tests, the app's flow against the dev fixture, and the candidate as a website migration with `supabase/tests/weave-publish-from-draft.sql` on the CI image: a card-less link, DID authority with a non-owner refused, review, publish and the sending claim from the draft, bad entries refused, edits not followed, withdrawal from a second session, republishing at the same key, a deleted card that keeps its link and listing, and the saved path. After the migration is applied and the app deployed: a card that was never saved publishes one need and one offer, hosted read-back of both, and withdrawal from a second browser. Second review before merge. |
| 4 | Stop new private saves and shares. Built: Save Privately and Share For Matching are gone from the app. `/api/account` refuses `save` with 410 `private_saves_retired` before reading the session, and `/api/matching` refuses `preview`, `share` and `renew` with 410 `matching_shares_retired` after parsing the command, for personal and team cards alike, so a malformed command is still `invalid_data`. Withdrawing a share, partner search and saved partners go on until step 5, and a share still on shows only to be stopped. Saving to a team's open workspace (`team_save`) stays until step 6. Your Initiatives keeps Private Weave Saves read-only: Open On This Device, Download, Make It Public (which opens the card here and starts the step) and Delete, with a notice that Weave keeps them for at least 60 days and says so there before any are removed (D49). A card only in this browser reads "On this device". The client's save helpers stay until step 7 removes them; nothing in the app calls them now, since resuming a group project's setup only reconciles an earlier request. The app and the server refusal ship together, since Weave deploys on merge. Critical tier. | `packages/api/src/account.ts`, `packages/api/src/matching.ts`, `packages/app/src/account/`, `packages/app/src/initiative/status.ts`, `packages/app/src/pages/YourInitiatives.tsx`, `packages/app/src/partners/` | API and app tests: a save refused by name with nothing written whichever account the cookie names, review, share and renewal refused for personal and team cards and for viewers, withdrawal and leads on shares seeded through the fixture provider, and earlier saves still listed, opened, downloaded and deleted. Rendered check at 360 and 1280 px in both themes, by keyboard. Second review before merge. |
| 5 | Match on published listings. Server matching takes a published listing as its query and searches other published listings and public project evidence. A draft's suggestions come from the device against a public snapshot that now includes published listings. Saved and dismissed partners move to the device shortlist. Existing shares end here. Depends on D47. | `packages/api/src/matching*.ts`, `supabase/candidates/weave-matching*.sql`, `packages/app/src/partners/` | Matching tests and the held-out relevance fixture. Two published entries from two accounts find each other; an unpublished draft appears in no one else's results. |
| 6 | Keep only what group publishing needs in team workspaces: the project link and the explicit Weave editor grants that [group writes require](../../packages/api/lexicons/README.md#local-publication-lifecycle). Private team content follows step 4. Depends on D48. | `packages/api/src/project-commands.ts`, `supabase/candidates/weave-team-content.sql` successors | Workspace and invitation tests. Group publishing stays behind `WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED`. |
| 7 | Remove the retired data and code after D49: the rows in `weave.initiatives`, `weave.needs` and `weave.offers`, their `matching_*` columns and the commands that wrote them. Only after step 3 has detached project links and published listings from those rows. Keep or replace `project_links.matching_paused`, which step 2's read uses. | A website repository migration, `packages/api/src/`, `packages/app/src/account/` | Migration tests, `bun run ci`, and production counts of zero after a separate approval to apply. |
| 8 | Bring the rest of the plan in line as each step lands: the [architecture diagrams](03-logical-architecture.md#first-release-architecture), [spec 5.1](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving) and [7.2](05-technical-spec.md#72-cross-initiative-matching-r12-r16), R23's pulse per saved initiative, and the [Lexicon README](../../packages/api/lexicons/README.md). | `docs/platform/`, `packages/api/lexicons/README.md` | `bun run guidance:check` |

Not in this plan: changes to Certified sign-in, the public project index, funding
matching on the device, or the editor handoff to Ma Earth and Certified.

## First visit and first save

This and the next two sections describe private saving and sharing as built. DL-155
retires them under the [removal plan](#retiring-private-saves-and-weave-only-sharing);
they stay accurate for existing saves until then.

1. Describe and check an initiative. Art, software, research and place-based work follow the same path. A device draft can be prepared before signing in.
2. Open the saving task. Explain: “Sign in with Certified to save your work and open it on another device. Your saved work stays private in Weave.”
3. Persist device work, then redirect to Certified. If the person entered an email in Weave, forward it for that attempt. If local persistence fails, offer recovery before departure.
4. Complete the code and any first-use setup on Certified. A first-time user may also choose a handle. Signing up provisions the identity Weave will use for private saving.
5. Return to the original Weave task. Show “Signed in with Certified,” the device draft and saved initiatives. Authentication alone performs no Save or Load.
6. Choose Save. Send only the checked document using the existing revision and request-ID contract. Say “Saved privately in Weave” only after the server confirms success.

First use may include Certified account terms, handle selection or consent. “One
sign-in flow” does not mean one screen or no future prompts. Weave never asks for
a second code to finish saving and sends no automatic welcome or saved-card email.

## Returning, loading and switching

On the same device, resume the local draft without signing in. For saved work,
use the active session or choose Sign in with Certified. The same stable identity
must reach the same account UUID and saved initiatives, including from another
browser. A changed handle does not create a new account.

Choose Load explicitly from Your saved initiatives. Loading replaces only this
browser's own copy of that card, after backing it up, and errors lose neither
version. An account card is changed only by an explicit Save. Switching initiatives uses the same session. Signing out ends the Weave
session; it does not erase device drafts/backups or claim to sign out of every
Certified application. Device-data clearing remains a separate explicit action.

## Matching on a first or returning visit

The target flows below add a verified Certified project link for network
matching. The current preview supports sharing and matching without that link.
A representative signs in once, opens the linked Weave workspace, and shares
one or more open needs or offers. Weave suggests kinds of support and the person
can add or remove them. Each entry
needs at least one kind of support when shared. A share without an end date stays
discoverable while the reviewed entry is open and eligible. Browsing public
initiatives and funding stays open, and local funding matching works before
sign-in.

| Person | Flow |
|---|---|
| First visit, has a Certified project | Start with the existing personal or group project. Sign in with Certified and choose the project. Weave opens an existing workspace according to its grants. If a group project has no workspace yet, a member can request setup and continue with a private draft while a verified group admin or owner approves. A group workspace requires current Certified group membership and a Weave grant. An existing personal project remains solo at the same address. Add needs and offers, then choose which to share for matching. |
| First visit, has no Certified project | Describe the initiative and see funding matches locally. Sign in with Certified to make it public. When ready for network matching, follow the external editor route below: Ma Earth for aligned initiatives that choose it, Certified for others. Reuse or establish an organization/group, publish the project there, then return and explicitly select its verified record. New team-ready projects start in a shared group, which can have one owner. Link the workspace before sharing entries for matching. |
| Returning, has a Certified project | Use the existing session or sign back in with the same identity. Open the workspace where saved entries, sharing state and leads are kept. If the project has never been linked, link it first. Review changed entries before sharing them again. |
| Returning, has no Certified project | Resume the device draft or sign in to load the private save. Keep editing and matching for funding. Resume the external editor handoff or refresh discovery to select a project already published there. Do not restart creation just because a return or discovery request failed. Linking an eligible private save preserves the initiative and entry IDs. |

Workspace admins start teammate access in Weave. Someone without a Certified
account can sign up from a pending invite. The admin confirms the teammate's
identity before granting access. If the teammate also needs to join the
Certified group, Weave shows those broader permissions and asks an authorized
admin to approve the group change.

After linking, edit the public title and description in Ma Earth for a profile
managed there, or in Certified's project editor. Weave shows the latest verified
profile and keeps workspace details, needs and offers separate.

For a need, show current offers and relevant external capabilities. For an offer,
show current needs, public requests and projects whose activities could use it.
Name which entry is being matched and why. An inferred capability has unknown
availability; a possible use is not a need stated by the other project. People
can save the match and open its supporting source, where the project may already
list a public contact route. Saving a match sends no invitation.

A Certified project can appear through public evidence without using Weave
or stating a need or offer. A linked initiative can use permitted public
evidence locally without sharing its entries for network matching. The first
release includes a separate Publish action for AT Protocol. The person reviews the exact public fields and
destination. Any workspace editor with Certified publishing authority can
confirm. Weave reports publication after it reads back the record. Editing
published details requests withdrawal of the old listing. The new details
stay private until republished. Sharing for matching does not publish.
A person can manage several workspaces with the same Certified identity. See the
[project integration contract](05-technical-spec.md#certified-project-integration-target).

## Public project creation and return

Since 25 November 2026 (DL-148), Make It Public can create a personal Certified project from the draft in
the person's own account, after warning of a likely existing project on Certified or Ma Earth. The
external editor route below remains for group projects and for Ma Earth, where Weave offers the
draft's name, place and description to copy before opening Ma Earth. Weave's
own public page for a new project appears after the public list's next daily
refresh (`/api/project-index-refresh`), because public pages read that list.

The user [decided on 12 November](open-decisions.md#public-project-editors-decided-12-november-2026)
that public organizations/projects are created in Ma Earth or Certified for the
first release. Weave retains private drafting, saving, needs, offers, matching
and workspace access. This replaces the default of inline public group and
project creation. The app implements the handoff locally; external publication
and real editor-return discovery still require hosted checks.

1. Check for an existing project first. Reuse its canonical AT URI and existing
   organization/group rather than creating another record with the same name.
2. Offer Ma Earth for initiatives aligned with its focus that want to participate
   there. A place label alone is not eligibility. Other initiatives use Certified.
   Both routes use the person's Certified identity; there is no separate Weave
   registration. Explain that the other app may still request a code or consent.
3. Preserve the draft before departure. External navigation alone sends no
   private needs, offers, files or full draft. Do not invent prefill parameters,
   transfer authentication tokens or promise an automatic callback. Any future
   supported prefill needs explicit review of the fields being sent.
4. In the external editor, reuse or establish the organization/group and publish
   the selected project. One organization can have multiple projects. Guide new
   team-ready projects to a shared group even with one owner; existing personal
   projects remain solo at their current address.
5. On return, refresh authorized discovery and let the person explicitly select
   the published project. Verify its URI and current authority, then use the
   existing workspace setup/grant path. Resume the original Weave task and retain
   eligible initiative/entry IDs. A name match or editor return is not authority.

Ma Earth's private application drafts are not yet public Certified records.
Someone who has not published can return to private Weave saving and funding
matching. A discovery outage is not evidence that no project exists. Keep retry
and local work available without sending the person through creation again.

For an existing Certified project that also wants a Ma Earth presence, preserve
its identity while the supported adoption path is resolved. Do not create a
replacement organization/project there to compensate. Ma Earth listing,
funding-round application and Weave entry sharing are separate actions.

The app's legacy creator can only resume a stored, frozen intent. An unresolved
or unreadable intent blocks departure to another editor. The server's existing
create command remains compatible with older clients; retiring it needs a separate
review. Existing created records
and saved work remain intact. This decision does not change support-listing
publishing, teammate permissions or the rule requiring both current group
membership and an explicit Weave grant for private team access. Ma Earth and
Certified membership synchronization remains a validation item.

## Failures and recovery

| Situation | Required behavior |
|---|---|
| Not now, cancelled setup or declined consent | Keep the device draft and return to the task with Retry and Keep working. |
| Expired or invalid callback | Reject the exchange and offer a fresh Certified sign-in; never accept replay or an unbound callback. |
| Certified succeeded but Weave failed | Explain that Weave sign-in did not finish. Keep local work and retry the same sign-in flow. |
| Provider outage or offline | Continue local work and cached funding. Save only while a valid session/service permits it; otherwise retry later. |
| Wrong Certified identity | Sign out and use the correct Certified identity. Never merge by email, handle, project link or a caller-supplied account ID. |
| Unexpected identity conflict | Fail without account merging or moving saved rows. Keep the draft and offer a non-disclosing support route. |
| Lost save response | Retry the same command with the same request ID; reconcile the saved revision without duplication. |
| Changed draft in another tab | The latest edit wins. The replaced version is kept as a device backup that Settings can restore, at most three for one draft, with no warning and nothing stopped. Open tabs show the newest version when they have no edit of their own waiting (DL-112). |
| Stale revision of a saved card | The account refuses the save, and the person opens the card's latest version from Your Initiatives. The device draft is kept. |
| Session expires | An open app renews the session before its hour runs out. When renewal is refused, the browser sat idle past 14 days, or 30 days have passed since sign-in, keep the draft; reauthenticate through Certified and explicitly retry Save/Load. |
| A Certified group workspace has no active Weave admin | The verified current Certified group owner can explicitly recover admin access. Weave records the grant and preserves the team's work. |
| Certified confirms a teammate's removal from a group | Suspend their team workspace access. Preserve their personal saves. Existing team shares and listings stay active when other authorized teammates remain. If the person rejoins, a workspace admin can review access. |
| A linked Certified project is deleted or made unlisted | Pause matching, request withdrawal of Weave-published listings and keep team work available to authorized teammates. Resume after the original project is restored and reviewed. A replacement project starts its own workspace. |
| A team marks a need met or an offer ended | Remove it from Weave matching and request withdrawal of its public listing. Show when the public withdrawal is confirmed. |
| A public listing is withdrawn in another AT Protocol app | After verification, update the public listing state. Keep the saved entry and its eligible Weave-only share. |
| Shared entry changes, closes, expires or is withdrawn | Remove affected matches on the next read. Keep private edits and saved lead history; a changed entry needs review before it becomes discoverable again. |
| External index or local model is unavailable | Keep baseline matching where available and distinguish partial coverage, stale evidence and service failure from no useful matches. Never send a private query elsewhere as an undisclosed fallback. |
| Certified access is lost | Use Certified's recovery process to regain the same identity. Do not promise that a new identity or matching email can recover the saved rows. |

Recovery of the same Certified identity is an operational validation gate. It is
not an account migration or alternate Weave authentication flow. No data-transfer
or account-merging mechanism is included in this build.

## Contact details and membership

Contact email is optional, separate from identity and irrelevant to private Save.
Future reminders or introductions need their own purpose, contact verification,
consent and working service. Do not copy contact details into authentication claims,
use them to locate or merge accounts, or assume every account can receive email.
Only display contact settings when the corresponding service exists.

An internal Weave account is not Regen Commons membership. Applying for membership,
team invitations and public project authority remain separate actions and policies.
No membership pitch follows private saving.

## Implementation boundary and proof

The [first-build contract](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving)
identifies owning paths, the code baseline, session/security rules and completion
evidence. Private commands use the person's token and database authorization. The
Weave access predicate must require the trusted Certified identity, not merely a
confirmed email; shared website/steward sign-in settings remain untouched.

The [email-free local proof](research/certified-hypercerts-2026-11-06/email-free-saving-proof.md)
passed real Certified signup, private save/load, full-page refresh and independent
cross-account denial. Its database predicate also retained an email-only branch
for earlier experiments. The isolated first build removes that branch in its
candidate Weave access predicate. Local Supabase tests confirm that email-only
sessions cannot use private commands, while an email-free Certified identity can
save and reload its own initiative. The hosted application of this predicate and
the subsequent tests are recorded in the [current build evidence](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving).

The isolated build also passed real Certified sign-in on 7 November in the ChatGPT
in-app browser with local Supabase. Signing in left the device draft unchanged and
saved nothing. Explicit Save, full-page reload and explicit Load used the same
session, with a device backup created before Load. The database held one email-free
Auth user and one private initiative owned by that user; the synthetic device-only
note was absent from saved data. This validates that local flow using an existing
Certified identity. On 8 November the hosted test also preserved a saved initiative
after bridge redeploy and sign-in. Fresh hosted signup and the complete matching
lifecycle still require the final-build acceptance in section 7.6 of the technical spec.

The authentication proofs cover private Save/Load, not every product flow here.
The [UI handoff checklist](05-technical-spec.md#76-build-plan-and-ui-handoff)
requires both matching sources, saved leads, lifecycle invalidation and measured
quality/performance. A documentation change or fixture does not complete those gates.

## Private account connection

The [5 November production proof](prototype/proof/accounts/README.md#production-verification) records the earlier email-code implementation. The [Certified-only decision](open-decisions.md#certified-only-sign-in-and-private-saving) supersedes its sign-in flow for the current Weave Preview.
