# Saving initiatives and accounts

Status: matching flows revised 8 November 2026. Certified sign-in and private Save/Load have local and limited hosted proof, including return after a bridge redeploy. Shared-entry matching and the external-evidence index are implemented, and the matching migrations and preview rollout are complete. The live public corpus, semantic activation and full release acceptance remain pending. See the [rollout evidence](05-technical-spec.md#hosted-preview-rollout-8-november) for verified behavior and remaining checks.
Companions: [PRD](04-prd.md) · [technical spec](05-technical-spec.md#5-identity-and-access) · [decision register](open-decisions.md#certified-only-sign-in-and-private-saving) · [design spec](research/certified-hypercerts-2026-11-06/design-spec.md#one-sign-in-including-first-use).

Certified is the only sign-in flow. Weave automatically creates or retrieves an
internal account record for the proven identity and uses it to own saved
initiatives. People do not register separately with Weave. A public Certified
project, Ma Earth listing and Regen Commons membership are not required.

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
| Shared for matching | Selected current entries and an approved initiative summary | An owner previews and explicitly shares what signed-in Weave users can see. Private Save alone does not share. |

Saving the checked document does not back up conversation transcripts, files,
unfinished alternatives or AI history. Show this limit where the person saves.
Loading a saved initiative first backs up the complete current device draft and
files. If backup fails, leave the active draft unchanged. Database administrators
can technically access stored data; owner-only product access is not end-to-end
encryption.

Private initiatives can see named suggestions and evidence from permitted public
sources without sharing their own work, following [R16](04-prd.md). Compute private
queries locally against a bounded public snapshot and show its coverage. Inferred
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

Certified signs the person in. Weave owns the initiative record and checks who
can manage it. A person joins network matching by sharing one or more open
needs or offers from an initiative they own. Browsing public initiatives and
funding stays open. Partners includes both other owners' shared entries and
permitted public project evidence, with distinct labels. The other project need
not use Weave or have stated needs/offers. A private local preview may still use
public evidence without joining the shared-entry network.

| Person | Flow |
|---|---|
| First visit, has a Certified project | Browse or prepare a draft. Sign in with Certified, create or select the owned Weave initiative, and optionally reference the public project. Add a need or offer, save privately, then review and share selected entries. See compatible shared entries and external project evidence in Partners. A public project link does not itself prove representative authority. |
| First visit, has no Certified project | Browse or prepare a draft. Sign in or create a Certified identity in the same flow. Create the Weave initiative directly; no upstream project creation is required. Add and save a need or offer, review and share selected entries, then get the same two types of suggestions. |
| Returning, has a Certified project | Use the existing session or sign back in with the same identity and explicitly load the saved initiative. Recover entries, sharing state and saved leads. Review changed needs/offers, share their new revision when ready, or close/withdraw them. Refresh matches against current shared entries and public evidence. |
| Returning, has no Certified project | Use the same session or identity to load the saved Weave initiative and its entries, sharing state and leads. Edit, close, withdraw or share through the same flow. The lack of a Certified project does not reduce matching access or rank. |

For a need, show current offers and relevant external capabilities. For an offer,
show current needs, public requests and projects whose activities could use it.
Name which entry is being matched and why. An inferred capability has unknown
availability; a possible use is not a need stated by the other project. Viewing
or saving either result sends no invitation and does not confirm a partnership.

The public project link provides context. Import, verified project representation
and external publishing are separate capabilities. A person can create and
manage more than one Weave initiative with the same Certified identity. See the
[matching contract](05-technical-spec.md#72-cross-initiative-matching-r12-r16) and
[implementation plan](05-technical-spec.md#76-build-plan-and-ui-handoff).

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
