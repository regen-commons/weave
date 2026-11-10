# Saving initiatives and accounts

Status: matching flows revised 8 November 2026. Certified sign-in and private Save/Load have local and limited hosted proof, including return after a bridge redeploy. Shared-entry matching and the external-evidence index are implemented, and the matching migrations and preview rollout are complete. The live public corpus, semantic activation and full release acceptance remain pending. See the [rollout evidence](05-technical-spec.md#hosted-preview-rollout-8-november) for verified behavior and remaining checks.
Companions: [PRD](04-prd.md) · [technical spec](05-technical-spec.md#5-identity-and-access) · [decision register](open-decisions.md#certified-only-sign-in-and-private-saving) · [design spec](research/certified-hypercerts-2026-11-06/design-spec.md#one-sign-in-including-first-use).

Certified is the only sign-in flow. Weave automatically creates or retrieves an
internal account record for the proven identity and uses it to own saved
initiatives. People do not register separately with Weave. Private saving requires neither a public Certified project nor Ma Earth
participation or Regen Commons membership. Network matching has its own project
requirements.

## The decision

1. Show value before sign-in. Browse public initiatives and funding, and prepare an initiative draft on this device.
2. Offer “Sign in with Certified” when the person wants an account copy or chooses to add a need or offer to an initiative they manage. Certified handles the code, account setup and consent. The hosted test offers email entry in Weave for that attempt.
3. Keep authentication, saving and sharing separate. Return to the same task after sign-in; only explicit Save uploads the checked document.
4. Reuse one person session for several initiatives. There is no account-linking screen, migration flow, alternate Weave code or fallback identity provider.
5. Preserve device work through every exit. Cancel, failure or Not now never discards a draft or claims it is saved.

## Where work lives

| State | Storage and access | Meaning |
|---|---|---|
| Device draft | This browser's local storage, subject to device/browser access | Includes working text, files and unfinished edits; no account required. |
| Saved privately | Owner-authorized Weave database record | Checked initiative, kept needs/offers and funding answers only; available to the same Certified identity on another device. |
| Saved to a team workspace (target) | Weave database, accessible to teammates with workspace read access | Saved needs and offers are visible to the team before sharing. Personal saves outside the workspace stay personal. |
| Shared for matching | Selected current entries and an approved initiative summary | Any workspace editor can preview and explicitly share what signed-in Weave users can see. Saving alone does not share. |

Saving the checked document does not back up conversation transcripts, files,
unfinished alternatives or AI history. Show this limit where the person saves.
Loading a saved initiative first backs up the complete current device draft and
files. If backup fails, leave the active draft unchanged. Database administrators
can technically access stored data; owner-only product access is not end-to-end
encryption.

A linked Certified project can see named suggestions and evidence without
sharing its own entries, following [R16](04-prd.md). Before linking, people can
browse public projects and match for funding locally. Compute private queries
locally against a bounded public snapshot and show its coverage. Inferred
experience, potential uses of an offer, public statements and confirmed entries
remain distinct. Private records and saved leads never enter
the public corpus. Seeing a public project does not reveal associated private
Weave records or give permission to contact its team.

## First visit and first save

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

Choose Load explicitly from Your saved initiatives. Preserve the current device
work before replacement, and show conflicts or errors without losing either
version. Switching initiatives uses the same session. Signing out ends the Weave
session; it does not erase device drafts/backups or claim to sign out of every
Certified application. Device-data clearing remains a separate explicit action.

## Matching on a first or returning visit

The target flows below add a verified Certified project link for network
matching. The current preview supports sharing and matching without that link.
A representative signs in once, opens the linked Weave workspace, and shares
one or more open needs or offers. Weave suggests kinds of support and the person
can add or remove them. They can save privately before choosing any. Each entry
needs at least one kind of support when shared. A share without an end date stays
discoverable while the reviewed entry is open and eligible. Browsing public
initiatives and funding stays open, and local funding matching works before
sign-in.

| Person | Flow |
|---|---|
| First visit, has a Certified project | Start with the existing personal or group project. Sign in with Certified and choose the project. Weave opens an existing workspace according to its grants. If a group project has no workspace yet, a member can request setup and continue with a private draft while a verified group admin or owner approves. A group workspace requires current Certified group membership and a Weave grant. An existing personal project remains solo at the same address. Add needs and offers, then choose which to share for matching. |
| First visit, has no Certified project | Describe the initiative and see funding matches locally. Sign in with Certified to save privately. When ready for network matching, review and create a Certified project from the draft. The project starts in a group with the creator as its only member and owner, so teammates can join later. Add or share the needs and offers from the linked workspace. |
| Returning, has a Certified project | Use the existing session or sign back in with the same identity. Open the workspace where saved entries, sharing state and leads are kept. If the project has never been linked, link it first. Review changed entries before sharing them again. |
| Returning, has no Certified project | Resume the device draft or sign in to load the private save. Keep editing and matching for funding. Create or link a project when ready for network matching. Linking an eligible private save preserves the initiative and entry IDs. |

Workspace admins start teammate access in Weave. Someone without a Certified
account can sign up from a pending invite. The admin confirms the teammate's
identity before granting access. If the teammate also needs to join the
Certified group, Weave shows those broader permissions and asks an authorized
admin to approve the group change.

After linking, edit the public title and description in Certified or another
Certified project editor. Weave shows the latest verified profile and keeps
workspace details, needs and offers separate.

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
| Stale revision or changed draft in another tab | Preserve both versions and require comparison before replacement. |
| Session expires | Keep the draft; reauthenticate through Certified and explicitly retry Save/Load. |
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
