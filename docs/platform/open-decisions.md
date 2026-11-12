# Open decisions

The single list of what is unresolved. Each entry has a recommendation, so a decision can be a quick yes. Nothing in this plan is a council decision until it is recorded here as decided.

The 4 November prototype review adds D26 to D36 and T9, and refines D14, T3, T5 and T8 below. These are questions, not approvals. Owners name accountable roles; where a person has not accepted a role, the lead builder must arrange that handoff. The maker's Step 0 approval permits interface work against the placed rules; it does not substitute for council confirmation or authorize a service, dependency or migration.

| Status | Meaning |
|---|---|
| Open | Needs a decision from the owner named |
| Test | Waiting on usability testing or a technical check |
| Decided | Recorded, with the date and who decided |

## For the council

| ID | Question | Recommendation | Needed by | Status |
|---|---|---|---|---|
| D1 | What is the product called, and at which subdomain? | Weave at weave.regencommons.com, with Connect as the fallback and Tend if the Weave collisions prove a problem. Test with outsiders first, because a verb cannot say what the product is. Keep it beside a plain tagline. | Before the first public demo, 5 November | Open |
| D2 | Which access tier at launch? | Open: anyone can browse and save. Consider members-first in Phase 2. | Phase 0 | Open |
| D3 | Which code licence? | AGPL-3.0, which keeps Coop reuse possible. Apache-2.0 if maximum reuse by partners matters more. | Phase 0 | Open |
| D4 | Which data licence for public records? | CC BY 4.0. | Phase 0 | Open |
| D5 | Should stewards be able to read private saved initiatives? | No. Nothing there has been shared. Stewards see network and public records and aggregate counts. | Phase 0 | Open |
| D6 | Is one database shared with the website acceptable for private initiatives? | Yes, with the limit stated on the privacy page: people who administer the database can technically read stored records, under the data policy. | Phase 0 | Open |
| D7 | Which networks are the first sharing targets? | Murmurations index, yes. Regen KOI, confirm with its operators. Hylo, link only. Bloom's offers and needs sessions, import with consent. | Phase 1 | Open |
| D8 | Which places pilot the Phase 2 place synthesis and Phase 3 pool? | Pick two or three from existing nodes: San Francisco Bay and Central Valley, Lagos lagoon and Niger delta, southern Brazil, a Central American watershed. | Phase 1 | Open |
| D9 | Which entity receives funds for the Mozilla application? | Open Source Collective at 10 percent, unless Regen Commons has its own entity by then. | 20 November | Open |
| D10 | Do the brand changes stand? This covers capital hue changes, square tiles, madder for errors, and plain stage labels. | Yes, for products. The website keeps its current look until it chooses to adopt them. See the [decision log](../../packages/design-system/decision-log.md). | Phase 0 | Open |
| D11 | Who owns the design system and represents its users? | The lead builder as maker, one steward as user representative. | Phase 0 | Open |

Prototype product proposals, from [DL-019 to DL-021](../../packages/design-system/decision-log.md#dl-019-partners-are-for-shared-initiatives):

| ID | Question | Recommendation | Owner | Needed by | Status |
|---|---|---|---|---|---|
| D26 | Are there two ways to be on Weave, replacing private, network and public? | Yes: "Private, for finding funding" by default and "Shared with the community" for a public page and directory entry. Keep onward network sharing separately consented and off by default. Align the spec and schema after confirmation. | Council, with the lead builder presenting | Before live saving and sharing | Open |
| D27 | Are partner cards and introductions available only to shared initiatives? | Yes. Drafts and private initiatives get funding and partner-match counts in the share card and team slots. Names, individual cards and reasons open after sharing, not saving. Public directory browsing stays open. Use T8 to test the effect before launch. | Council, with the maker and user representative | Before live partner matching | Open |
| D28 | Does one email door save the initiative and resume save, share, remind or introduce? Are single-fund reminders in Phase 0? | Yes. Save to the verified email, then resume the action in place; keep explicit sharing and introduction confirmations. Signed-in actions do not ask again. Include chosen single-fund reminders when the email service exists; weekly updates remain Phase 1 and off by default. | Council for scope; lead builder and email owner for delivery | Before connecting Step 7 to services | Open |

## For the builders

| ID | Question | Recommendation | Needed by | Status |
|---|---|---|---|---|
| D12 | Who owns Supabase migrations? | The website repository for Phase 0, and a shared `regen-commons/supabase` repository from Phase 1. | Phase 0 | Open |
| D13 | Who administers DNS for regencommons.com, and who manages the Regen Commons Vercel team? | Confirm with whoever runs the website project. It is not visible from the accounts used so far. | Phase 0 | Open |
| D14 | Does Weave configure sign-in code length? | No. Certified owns the sign-in experience. Weave does not change shared Auth code settings or offer its own code screen. See the Certified-only decision below. | First sign-in build | Decided for Weave (user, 6 November 2026) |
| D15 | Is the website Send Email hook a dependency for Weave sign-in? | No. Certified-only sign-in removes this dependency. Website and steward authentication changes are outside this build. | First sign-in build | Decided for Weave (user, 6 November 2026) |
| D16 | Where does the design system live long term? | Here until the website or desk adopts more than tokens, then a shared `regen-commons` repository. | When a second app needs it | Open |
| D17 | Should we add Latin Extended font subsets? | Yes, before launch in places that need Yoruba or Vietnamese. Measure the added weight. | Phase 1 | Open |
| D18 | Which cloud fallback is the default? | Anthropic Haiku 5.5 if the Zero Data Retention arrangement is confirmed, otherwise Cloudflare Workers AI. | Phase 1 | Open |
| D19 | Which bioregion layer? | One Earth if its non-commercial clause fits, otherwise RESOLVE ecoregions. | Phase 1 | Open |
| D20 | Which basin layer? | BasinATLAS under CC BY 4.0, unless HydroBASINS's licence is confirmed for this use. | Phase 1 | Open |
| D21 | Which KOI node is first contact? | Ask the Regen KOI coordinator and Metagov. Take whichever responds with a test path. | Phase 2 | Open |
| D22 | Will the Knowledge Commons add Opportunity, Need and Offer classes? | Propose them, with this platform as the fixture source. | Phase 2 | Open |
| D23 | How long do inactive saved initiatives stay? | Until deleted; define a notice mechanism for accounts without contact email before any inactivity deletion. Contact email is optional and cannot be assumed from Certified sign-in. | Phase 1 | Open |
| D24 | Where is the app hosted? | Vercel, as a new project in the Regen Commons team beside the website and Funding Commons. The team is on Hobby now and moves to Pro (USD 20 per developer seat) once needed, at the latest when grant money pays a builder, because Hobby is for non-commercial use only. | Phase 0 | Decided (afo, 2 November 2026) |
| D25 | When do we move to paid plans? | Only when the full place layers (2 to 4 GB against Supabase's 500 MB free limit), daily backups or traffic need them: Vercel Pro USD 20 per developer seat once a builder is paid or per-minute cron is needed, Supabase Pro USD 25, Resend Pro USD 20 when daily sends approach 100. Until then a nightly database dump stands in for backups. | Phase 1 | Open |

## Earlier prototype questions

Prototype implementation questions:

| ID | Question | Recommendation | Owner | Needed by | Status |
|---|---|---|---|---|---|
| D29 | Where do a fund's structured partner asks come from, and how is a team scored beyond two partners? | Start with labelled fixture asks. Propose steward-entered or steward-checked requirements, each traced to an official funder source; assistant extraction may propose, never silently publish. Confirm the catalog format and extend spec 7.4 with distinct gap coverage, duplicate-candidate handling and explained team fit before real team slots. Do not infer eligibility from a picked team. | Catalog steward and technical specification owner, coordinated by the lead builder | Step 5 fixtures; before live team slots | Open |
| D30 | Which images appear in the app: uploads, site previews or both, and who checks them? | Plan for both only after consent, rights, moderation and storage ownership are agreed. Until then use labelled synthetic placeholders and no third-party photos; the prototype's Unsplash images are not app assets. | Maker, with a council-named content steward and storage owner | Before real media in Steps 1 and 6 | Open |
| D31 | Can a shared initiative return to private while introductions are open? | Allow the visibility change and stop new discovery and requests immediately. The prototype keeps open introductions, but use that only as a labelled fixture default; the council must confirm recipient access, already disclosed content and retraction wording before a live implementation. | Council for privacy policy; lead builder for enforcement | Before live visibility changes with introductions | Open |
| D32 | Which local models, download sizes and storage behaviour should replace the current tiering plan? | Benchmark the [smaller-download proposals](prototype/review-decisions.md#a-smaller-download) against golden fixtures and the spec's 95 percent schema gate. Verify licences, device sizes, storage limits, persistence, cancellation, resumption and removal. Prefer available local browser capabilities; keep keyword mode working. Correct `SpeechRecognition.available()` to pass the required `langs` option in the implementation change. No model dependency, hosting or CSP change is approved here. | Technical specification owner, with the lead builder and device-test participants | Start of Step 3; real-user local-AI evidence by 20 November 2026 | Test |
| D33 | Are typed locations public fields while bioregion, watershed and country remain derived proposals in pencil? | Keep the person's typed locations in the four public fields; show derived places separately for confirmation. Reconcile R4's optional pin or search and automatic attachment language with the pencil rule before implementing place assignment. | Maker and technical specification owner | Before derived place assignment | Open |
| D34 | What does Funding show to a visitor without an initiative? | Use the prototype's labelled default: the whole catalog, unranked, with a prompt to describe an initiative. Do not invent fit or readiness before there is input to score. Test whether search, filters and sort make this useful. | Maker, with the catalog steward | Step 5 | Open |
| D35 | How does per-field cloud consent in R10 fit the prototype's session-level dialog? | Keep R10's explicit consent and ledger requirements. The prototype omits per-field selection; agree the sent-field preview, scope, withdrawal and local/server record boundary before a cloud adapter is connected. Do not silently broaden session consent. | Council's data-policy owner and technical specification owner | Before live cloud fallback | Open |
| D36 | Are conversation questions a fixed short script or chosen by the on-device model from missing details? | Begin with the prototype's fixed short script as a labelled default that also works in keyword mode. Compare model-chosen questions only after testing confirms they improve completion without asking for extra fields or blocking on a download. | Maker and technical specification owner | Step 3 | Open |

Step 5 implements D29 with labelled development requirements and coverage, not sourced live asks or an approved team score. Counts stay unknown for real catalog calls. D34 uses the full unranked catalog until a checked initiative is available. The catalog steward and maker still own confirmation; this implementation does not close either decision. Legacy saved-profile, favourite and note import across the two site origins remains migration work alongside the Step 7 saving adapter; the app does not read another origin's local storage.

### Step 3 runtime proposal for D32

The maker approved these two narrow implementation changes for Step 3:

- Add `zod@4.6.7` (MIT) as a direct dependency of `@weave/app`, with the lockfile. Use one validated draft schema for persisted data and model replies, and derive the browser's JSON response constraint from it. The existing design-linter dependency on Zod 3 stays intact. This needs no CSP change.
- Permit browser-managed Prompt API sessions through the window API while keeping app-managed downloaded inference in a Worker. The specification's blanket Worker rule cannot apply to the native API: [Chrome documents that it is not exposed in Web Workers](https://developer.chrome.com/docs/ai/prompt-api#permission_policy_iframes_and_web_workers). Use an already available browser model only after a tap; do not initiate browser model or speech-pack downloads with unknown sizes.

Downloaded inference remains a separate D32 gate. The runtime candidate is the repository's existing pinned `@huggingface/transformers@4.2.0`, added explicitly to the app only after approval. Benchmark and license-check the smaller-model proposals, measure exact bytes, and choose approved hosting before connecting it. For same-origin WASM assets, the anticipated CSP delta is only `wasm-unsafe-eval` in `script-src`; keep `connect-src` and `worker-src` restricted to self and avoid blob workers. No downloaded runtime, model download, model hosting or CSP change is authorized by this proposal.

The keyword path, locally stored conversation, file/link references, review card and interface fixtures can proceed independently. PDF text uses the separately approved parser below; Office and OCR parsing still need dependency approvals. Retain unread files locally without claiming their content was read. Native speech must pass [the local `available({ langs, processLocally: true })` check](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static); never fall back to a remote recognizer silently. D35 still blocks any live cloud adapter.

### Step 3 PDF deck parser proposal

The prototype's attached PDF deck is shown as read on the device. The maker approved this parser in Step 3: add `pdfjs-dist@6.5.438` (Apache-2.0) to the app for text extraction only, using a same-origin Worker and disabling eval, font loading and WASM. Keep the existing CSP unchanged; request a separate, exact approval if verification shows any CSP delta is needed. Enforce the existing 25 MB file cap, cancel parsing with the build task, keep original bytes in the device draft and report scanned pages with no readable text. No remote PDF viewer, upload or OCR/model download is included. Office and OCR parsers remain separate dependency gates.

Step 3 verifies a two-page synthetic PDF under the unchanged production CSP, including one page without text, retained source bytes and offline rebuilding from the service-worker cache. This is fixture evidence in HeadlessChrome 149, not the real-user local-AI evidence due on 20 November. D32 still needs exact model manifests, approved hosting and device participants. D35 still needs provider, region, retention and consent decisions before cloud calls can open.

## Waiting on people

| ID | Question | Recommendation and how it gets checked | Owner | Status |
|---|---|---|---|---|
| T1 | Does "initiative" read clearly, or is "project or group" better? | Keep initiative while testing both in the [usability rounds](../../packages/design-system/principles/usability-testing.md). | Maker and user representative | Test |
| T2 | Partnership or recipe? | Keep partnership in the interface and compare the names with people. | Maker and user representative | Test |
| T3 | Do the framework kind names work as titles, and are eight too many for a card? | Test Living, Material, Intellectual, Experiential, Social, Financial, Cultural and Spiritual against the plain-label alternatives. Keep the maker's framework-title choice with plain meanings beneath and tooltips until evidence changes it; watch the offers step. Revisits DL-014 through DL-026. | Maker and user representative | Test |
| T4 | Does the assistant need a persona, such as the Gardener? | Compare Assistant with a named guide; Assistant stays the default. | Maker and user representative | Test |
| T5 | Do people understand pencil against ink, and does Keep all blur that distinction? | Watch Check your card and confirmation actions, including Keep all. Keep derived values in pencil until an explicit confirmation; test whether people understand its scope. | Maker and user representative | Test |
| T6 | Does the save moment work: when do people save, and do they return after Not now? | Use task 4 of the testing plan and step counts; preserve the one-time inline offer while testing. | Maker and user representative | Test |
| T7 | Does a seven-word tagline explain the product to outsiders? | Home tour task. Candidate: Find partners and funding for regenerative work. | Maker and user representative | Test |
| T8 | Does the share card with counts and names opening only after sharing encourage sharing, or put people off? | Use task 9 in the [prototype usability script](prototype/src/notes.html). Observe who shares, saves privately or stops, and their reasons. This question describes the earlier prototype. Use the current public-source and shared-entry matching decisions for new designs. | Maker and user representative, reporting to the council | Test |
| T9 | Should the public initiative directory be labelled Initiatives or Directory in navigation? | Keep Initiatives as the prototype default; test both with people finding everyone listed, alongside Partners and Funding. | Maker and user representative | Test |

### Certified first-build implementation decisions

These are technical prerequisites, not alternative sign-in or migration proposals.

| Decision | Proposed owner | Required evidence | Status |
|---|---|---|---|
| Stable bridge issuer, route boundary and Node hosting | API maintainer | Maintained OIDC provider works in the intended runtime with a fixed issuer, correct cookie/proxy handling and strict route allowlist. | The hosted bridge at `auth.regencommons.com` completed Certified sign-in and kept its issuer and public signing key across a redeploy. |
| Durable OAuth state and signing keys | API and infrastructure maintainers | Encrypted persistent state, atomic single-use callbacks, bounded expiry, restart/concurrency proof and rotation without changing account identity. | Partial: encrypted Postgres state and explicit key provisioning/rotation passed local fixture integration; production ownership, retirement procedure and independent review remain open. |
| Shared hosted validation | Website database and deployment maintainers | A controlled Vercel deployment uses the shared Regen Commons Supabase project for signup, private saving and sign-in after redeploy. Website and steward sign-in still work. | In the hosted test, a user signed in with Certified, saved privately and loaded the same card after signing back in following a bridge redeploy. The email-to-code experiment failed because Certified rejects email in the pushed authorization request. Blank-field sign-in reached Certified. Website and steward sign-in regression checks remain open. |

The [build contract](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving)
records the baseline, owning paths and tests. These roles are proposed responsibilities,
not assignments to people or authorization to provision infrastructure.

### Project integration and support listing validation

On 12 November 2026 the user chose to open project flows to verified Certified
accounts instead of restricting production to two tester DIDs. Rollout access
and workspace authority stay separate: current Certified membership, verified
project authority and explicit Weave grants still control private team access
and actions. The explicit `WEAVE_PROJECT_ACCESS_MODE=authenticated` setting is
required; omitted mode keeps the existing two-account pilot behavior. Its code
release and real-user production acceptance remain pending. Optional email
hints and hybrid retrieval remain off.

These are the remaining decisions and evidence for the
[project integration target](05-technical-spec.md#certified-project-integration-target).

| Question | Working recommendation | What closes it |
|---|---|---|
| What can Weave verify and write through Certified? | Use the current sign-in for Weave identity. Request separate scoped consent when a project write requires it. | Verify project enumeration, current personal and group authority, write scopes and read-back with a real personal and group fixture. Prove one-owner group registration, project creation and adding a teammate using the same Certified identity. Prove the setup request and approval path for an existing group project. Exercise an occupied group handle, lost group or project create response, non-member grant denial, revoked authority and expired consent. |
| What does public listing interoperability require? | Prove a need and an offer in a disposable repository with an independent reader before asking partners to ingest the Lexicon. | Show discovery, project association, update and withdrawal. Verify consent, personal and group authorization, and hosted read-back before enabling first-release publishing. Prove that an editor can publish only when Certified authorizes the write, and document what downstream readers can retain. Certified display and indexing are separate integration work. |
| Are capital suggestions helpful enough for most entries? | Start with the existing local keyword path, compare optional local extraction on real examples, and use editable multi-select. | Measure how often people keep suggestions or correct them, including mixed forms and unfamiliar language across art, software, research and place-based work. Prove a private unclassified save reloads and sharing rejects it until classified. |

### Matching build validation

The product direction below is settled for this scope. These remaining checks
refine the implementation; they do not reopen Certified-only identity or make
external projects join Weave before they can be suggested. The
[six-milestone plan](05-technical-spec.md#76-build-plan-and-ui-handoff) owns sequence
and completion status. Responsibilities below are proposed roles.

| Question | Working recommendation | Owner | Evidence still required |
|---|---|---|---|
| Who sees shared entries? | First audience: signed-in Weave users. Share only the reviewed entries and summary, and apply the network participation rules when matching. | Product owner and API maintainer | Verify audience comprehension and server enforcement. Test shares with and without an end date against the [decided lifecycle](#shared-entries-and-acting-on-matches). |
| Can the Certified index support the launch coverage target? | Start validation with a varied sample, then enumerate all eligible public Certified projects the chosen index makes available. | Integration maintainer and source partners | Verify reuse and redisplay permission, pagination, rate limits, updates, deletions, unlisted handling, coverage and lag at launch volume. Confirm relevance and latency against the broader corpus. |
| Which model and search settings meet the quality bar? | Compare the existing pinned embedding model plus full-text search against lexical-only retrieval; keep local refinement optional and no-model results usable. | Matching maintainer and domain reviewers | Held-out need/offer relevance and recall, evidence accuracy and language/domain breakdowns. The 80 percent relevance and 2-second p95 targets in section 7.6 are proposed test budgets, not achieved results. |
| Where should the indexing job run at pilot scale? | Reuse the existing Platform database and a bounded resumable Node job; select the scheduler/runtime after measuring a batch. No additional host or paid model service is presumed. | API and infrastructure maintainers | Check runtime memory/duration, durable resume, model assets, concurrency and index/transfer cost at 1k/10k/100k passages. Any new spend, dependency or hosted rollout follows repository rules. |

The 8 November local build implements the two restricted jobs, versioned vector
storage and default-off hybrid retrieval. Real PostgreSQL fixtures establish the
authorization and stale-write boundaries. They do not settle the corpus-permission,
scheduler or quality questions above. In the final small synthetic comparison,
hybrid retrieval found more candidates but the final evidence gate returned the
same grounded suggestions; semantic activation therefore remains unapproved.
The authorized Platform migrations and Weave preview deployment are now complete,
with semantic retrieval still disabled. Hosted rollback-only synthetic checks
prove private saving, selected sharing, two-owner isolation and withdrawal;
real-user browser acceptance is still open. See the
[implementation evidence](05-technical-spec.md#local-implementation-and-evidence-8-november)
and [hosted rollout record](05-technical-spec.md#hosted-preview-rollout-8-november).

Broader server-assisted search for unshared entries is deferred. A linked
initiative can use bounded public snapshots locally, with visible coverage.
Adding the broader path requires a clear choice about sending query information
to Weave; embeddings cannot be described as anonymous. This does not block
server-assisted matching from entries already shared for that purpose.

## Waiting on people

| ID | Question | How it gets answered | Status |
|---|---|---|---|
| T1 | Does "initiative" read clearly, or is "project or group" better? | Name test in the [usability rounds](../../packages/design-system/principles/usability-testing.md) | Test |
| T2 | Partnership or recipe? | Name test | Test |
| T3 | Do plain capital labels work, such as "Care and spirit", and are eight too many for a card? | Name test, plus watching the offers step | Test |
| T4 | Does the assistant need a persona, such as the Gardener? | Compare "Assistant" with a named guide. "Assistant" is the default until then. | Test |
| T5 | Do people understand pencil against ink? | Watch the review step | Test |
| T6 | Does the save moment work: when do people save, and do they return after Not now? | Task 4 of the testing plan, plus step counts | Test |
| T7 | Does a seven-word tagline explain the product to outsiders? | Home tour task. Candidate: Find partners and funding for regenerative work | Test |
| T8 | Can owners tell what becomes visible when they share an entry for matching? | Observe owners who share one entry and keep another private, then verify the counterpart's view. | Test |

## Decided

### Certified-only sign-in and private saving

Decided by the user on 6 November 2026: Certified is the only Weave sign-in flow.
The internal Weave account is created or retrieved from the proven Certified
identity; it has no separate credentials or registration screen. Private saving
requires neither email access nor a public Certified project or Ma Earth listing.

Remove account migration, linking and alternative email-code sign-in from the
product and build scope, including contingency paths. This is a specification
change, not authorization to delete existing records or change the website's
shared authentication settings. Historical linking experiments remain evidence
of what was tested, not requirements for this build.

The first build covers sign-in, explicit private Save/Load, returning to the same
account, initiative switching and sign-out. A callback never saves or replaces a
draft. Certified failure keeps device work available and offers retry through
Certified. Returning identity must preserve account UUID and saved rows. An
unexpected identity conflict fails without merging accounts or moving data.

The [first-build contract](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving)
owns implementation order, acceptance tests and remaining hosting decisions.
Hosted staging and a second auth review are release gates. This records the user's
direction for the product, not a council vote or a completed deployment.

### Owner-authored needs and offers are the matching core

The user's 8 November direction is to match real needs and offers across
initiatives. Certified authenticates the person. Weave checks that the person
can act for the initiative and associates each need or offer with it. The
deployed preview allows participation without a verified Certified project link.

The target requires a verified project link and at least one current open entry
shared with signed-in Weave users. The authorized representative chooses the
entries and reviews the exact summary before sharing. Private Save and device
funding matching remain available without a project link. The
[implementation contract](05-technical-spec.md#72-cross-initiative-matching-r12-r16)
keeps the two-account match and the external-evidence path as release checks.

### Certified project links and workspace access

Each Certified project has one Weave workspace. The first release targets
creating new projects in Certified groups, with the creator as the initial
owner and the ability to add teammates later. The person reviews the group
and public project fields and uses the same Certified identity. Certified
documents one-owner group registration and adding members. Weave still
needs to prove the combined flow. [Certified Group Service API](https://github.com/hypercerts-org/certified-group-service/blob/main/docs/api-reference.md#group-lifecycle)

Weave can link existing personal and group projects when it verifies the
actor's authority. Existing personal projects remain solo in Weave and keep
their public address and saved work. Moving an existing personal project
to a group is deferred.

For an existing group project, a verified member can prepare a private draft
and request workspace setup. A verified Certified admin or owner for that
group activates the workspace. The request grants no access. Certified
exposes group roles, while the check for who can edit a specific record
happens inside its write handler. The published read API exposes no
record-specific permission query.
[Certified API methods](https://github.com/hypercerts-org/certified-group-service/blob/7d6787711903f732902e2cbebf8cee7cc48038af/src/api/index.ts) ·
[Record edit handler](https://github.com/hypercerts-org/certified-group-service/blob/7d6787711903f732902e2cbebf8cee7cc48038af/src/api/repo/putRecord.ts)

A Certified group workspace is open only to current group members with an
explicit Weave grant. Admins start teammate access in Weave. If the teammate
needs Certified group membership, show the broader group permissions and
require approval from an actor authorized to add them in Certified. A pending
invite can start before the teammate has a Certified account. After the teammate
signs in, an admin confirms the resulting identity before granting access.

Needs and offers saved in the team workspace are visible to teammates with
workspace read access, including before sharing for matching. Personal saves
outside that workspace stay personal. Any workspace editor can review and
explicitly share selected entries for matching. Public AT Protocol publishing
has its own authorization.

Confirmed removal from the Certified group suspends the person's Weave
workspace access. Their personal saves and access to other projects remain
available. A workspace admin can review reinstatement if they rejoin. Existing
team shares and public listings stay live while the project still has authorized
teammates. The team can review, update or withdraw them.

When a group project workspace has no active Weave admin, the verified current
Certified group owner can explicitly recover it and take on Weave admin
access. Record the grant and preserve the existing workspace and team work.

Confirmed deletion or unlisting pauses network matching and requests
withdrawal of the project's Weave-published listings. Preserve team work
for authorized teammates and report pending or confirmed withdrawal.
Resume with the original project at the same AT URI after verification
and review. A replacement project starts its own workspace in the first release.

The Certified project is the source of its public profile. After creation or
linking, teams edit the public title and description through Certified or
another Certified project editor. Weave displays the latest verified public
record. Platform holds the separate workspace fields, needs, offers and
sharing decisions. See the
[project integration contract](05-technical-spec.md#certified-project-integration-target).

### Public support listings in the first release

The first user-facing release includes an explicit AT Protocol publish action
once the team proves consent, authorization and read-back. A listing refers
to the project by AT URI and has its own record identity under Weave's namespace.
Private Save and Share for matching remain separate actions. Test a need and
an offer in a disposable repository with an independent reader before enabling
public publishing. Any workspace editor can publish with verified Certified
authority for the write. An edit to published details requests withdrawal of
the old listing. Weave shows whether that withdrawal is pending or confirmed.
The replacement stays private until an editor explicitly republishes it.
Closing an entry in Weave ends its matching share and requests public
withdrawal. A confirmed withdrawal initiated through another AT Protocol app
changes the public listing state only. The team's Weave share stays active
while eligible. Certified project-page display and partner indexing can follow
independently.

### Shared entries and acting on matches

A share with no end date stays discoverable until the team closes or withdraws
it, subject to the existing checks for the reviewed revision and project
eligibility. When an end date applies, show it at review and enforce it in
matching. The preview's shares are open-ended, and its sharing review says they
last until closed or withdrawn.

In the first release, people can save a match and open its source. They can use
contact routes the counterpart has already made public. Weave introductions and
new contact channels are outside that release.

### Capital suggestions stay editable

Weave should suggest forms of capital from the support described in each need
or offer, including when someone types directly into the editor. The person can
keep the suggestions, remove any that do not fit, or add one or more forms.
There is no primary form and no need to confirm each suggestion separately.
An entry can be saved privately with zero forms. Sharing an entry or publishing
a separate public AT Protocol listing requires one or more owner-approved forms. The [draft Lexicon](../../packages/api/lexicons/README.md)
uses the same eight values. The current typed editor still requires manual
selection. Automatic suggestions there remain implementation work.

### Certified index coverage at launch

First-release public-evidence suggestions use Certified projects. Coverage
targets all eligible public Certified projects that the chosen index can
enumerate. Eligibility requires permitted reuse and redisplay. Adapters for
other public project sources follow after the first release.
Validate the integration on a varied sample, then verify permissions,
freshness and match quality across the launch corpus. Browser previews still
use a bounded public snapshot. Report that coverage separately from the server
index.

### Matching both shared entries and external evidence

The user's additional direction on 8 November 2026 is that useful matching must
include Certified projects that have not used Weave and have no stated needs or
offers. Match an owner's need to evidence of relevant capabilities, and an
owner's offer to project activities that could use it. Keep inferred capability
and potential use distinct from owner-confirmed entries and publicly stated
requests/offers. A source description cannot establish availability or fabricate
a need on behalf of another project. Missing reciprocal asks must not exclude a
useful one-way suggestion.

The working architecture is a derived public-evidence index and protected shared
entry retrieval in the existing Platform database, with a Weave API shortlist
and local assistance/refinement. Precompute changed public passages in background
jobs rather than analysing the full network in every browser. The auth bridge
remains responsible for identity only. No per-match cloud LLM call or second
database is required. Validate runtime, coverage, model quality and performance
through the table above rather than claiming them from this design.

The user requested that this work be planned in the core documentation before UI
polish. [Section 7.6](05-technical-spec.md#76-build-plan-and-ui-handoff) is the single
execution plan, with both matching sources in the same functional acceptance.
This records product direction and an implementation plan, not a council vote,
completed implementation or deployment approval.

### Public-source partner suggestions while private

Personalized partner suggestions require a verified Certified project link.
Before linking, people can browse public projects and match for funding locally.
A linked initiative can see project names and supporting public evidence while
keeping its own entries private. This retains the 6 November decision that
sharing is optional for public-source suggestions and adds the link requirement.

Compute private queries locally against a bounded snapshot of permitted public
Certified project evidence. Keep private entries, saved leads and query text out
of the public index. Access to other teams' shared entries follows the separate
network participation rule.

Rank direct matches and possible fits separately, with relevance comparisons
within each kind. Show both when they qualify. Keep public statements distinct
from confirmed entries and inferences. A well-evidenced possible fit can still
appear when an important detail is unknown. State what needs verification.
Known conflicts rule out the pair. Viewing or saving a lead sends no
invitation and leaves availability unconfirmed. Introductions still require an opted-in recipient, a working
service and explicit disclosure consent. Network matching follows the owner-authored participation rule above.

This replaces the Certified research drafts' earlier application of a sharing
gate to public-source results. It changes the intended contract, not
implementation status. Source permission, retrieval quality and privacy tests
remain release gates. See [R16](04-prd.md) and the
[external discovery contract](research/certified-hypercerts-2026-11-06/technical-spec.md#participation-privacy-and-contact).
