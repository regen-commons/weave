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
| D32 | Which local models, download sizes and storage behaviour should replace the current tiering plan? | Benchmark the [smaller-download proposals](prototype/review-decisions.md#a-smaller-download) against golden fixtures and the spec's 95 percent schema gate. Verify licences, device sizes, storage limits, persistence, cancellation, resumption and removal. Prefer available local browser capabilities, including a speech pack the browser installs and manages ([15 November 2026](#browser-speech-packs-15-november-2026)); keep keyword mode working. Correct `SpeechRecognition.available()` to pass the required `langs` option in the implementation change. No model dependency, hosting or CSP change is approved here. | Technical specification owner, with the lead builder and device-test participants | Start of Step 3; real-user local-AI evidence by 20 November 2026 | Test |
| D33 | Are typed locations public fields while bioregion, watershed and country remain derived proposals in pencil? | Keep the person's typed locations in the four public fields; show derived places separately for confirmation. Reconcile R4's optional pin or search and automatic attachment language with the pencil rule before implementing place assignment. | Maker and technical specification owner | Before derived place assignment | Open |
| D34 | What does Funding show to a visitor without an initiative? | Use the prototype's labelled default: the whole catalog, unranked, with a prompt to describe an initiative. Do not invent fit or readiness before there is input to score. Test whether search, filters and sort make this useful. | Maker, with the catalog steward | Step 5 | Open |
| D35 | How does per-field cloud consent in R10 fit the prototype's session-level dialog? | Keep R10's explicit consent and ledger requirements. The prototype omits per-field selection; agree the sent-field preview, scope, withdrawal and local/server record boundary before a cloud adapter is connected. Do not silently broaden session consent. | Council's data-policy owner and technical specification owner | Before live cloud fallback | Open |
| D36 | Are conversation questions a fixed short script or chosen by the on-device model from missing details? | Begin with the prototype's fixed short script as a labelled default that also works in keyword mode. Compare model-chosen questions only after testing confirms they improve completion without asking for extra fields or blocking on a download. | Maker and technical specification owner | Step 3 | Open |

Step 5 implements D29 with labelled development requirements and coverage, not sourced live asks or an approved team score. Counts stay unknown for real catalog calls. D34 uses the full unranked catalog until a checked initiative is available. The catalog steward and maker still own confirmation; this implementation does not close either decision. Legacy saved-profile, favourite and note import across the two site origins remains migration work alongside the Step 7 saving adapter; the app does not read another origin's local storage.

### Step 3 runtime proposal for D32

The maker approved these two narrow implementation changes for Step 3:

- Add `zod@4.6.7` (MIT) as a direct dependency of `@weave/app`, with the lockfile. Use one validated draft schema for persisted data and model replies, and derive the browser's JSON response constraint from it. The existing design-linter dependency on Zod 3 stays intact. This needs no CSP change.
- Permit browser-managed Prompt API sessions through the window API while keeping app-managed downloaded inference in a Worker. The specification's blanket Worker rule cannot apply to the native API: [Chrome documents that it is not exposed in Web Workers](https://developer.chrome.com/docs/ai/prompt-api#permission_policy_iframes_and_web_workers). Use an already available browser model only after a tap; do not initiate browser model or speech-pack downloads with unknown sizes. The speech-pack part changed on 15 November 2026: see [Browser speech packs](#browser-speech-packs-15-november-2026).

Downloaded inference remains a separate D32 gate. The runtime candidate is the repository's existing pinned `@huggingface/transformers@4.2.0`, added explicitly to the app only after approval. Benchmark and license-check the smaller-model proposals, measure exact bytes, and choose approved hosting before connecting it. For same-origin WASM assets, the anticipated CSP delta is only `wasm-unsafe-eval` in `script-src`; keep `connect-src` and `worker-src` restricted to self and avoid blob workers. No downloaded runtime, model download, model hosting or CSP change is authorized by this proposal.

The keyword path, locally stored conversation, file/link references, review card and interface fixtures can proceed independently. PDF text uses the separately approved parser below; Office and OCR parsing still need dependency approvals. Retain unread files locally without claiming their content was read. Native speech must pass [the local `available({ langs, processLocally: true })` check](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static); never fall back to a remote recognizer silently. D35 still blocks any live cloud adapter.

### Browser speech packs, 15 November 2026

On 15 November 2026 the user decided that audio stays on the device for now (decision 4, "on device only"): Weave downloads no model of its own (D32) and sends no audio to a cloud service to transcribe (D35). That decision holds.

A speech pack that the browser downloads, keeps and manages for its own recognition on the device counts as a local browser capability, which D32 already prefers. It is not an app-downloaded model. So where the browser says it can install one, Weave offers "Set up speech on this device". This replaces the Step 3 rule above that Weave never starts a speech-pack download. The browser model is unchanged: Weave uses the Prompt API only when it is already available and never starts its download.

The setup follows the [Web Speech API](https://webaudio.github.io/web-speech-api/#dom-speechrecognition-install) and Chromium's implementation:

- Weave asks with `SpeechRecognition.available({ langs, processLocally: true })` and calls `SpeechRecognition.install({ langs, processLocally: true })` only from the person's tap. Without the tap Chrome rejects the call with `NotAllowedError`, and it answers `false` when `processLocally` is missing.
- Speak appears only when `available()` answers `"available"`, and every session sets `processLocally = true`, which requires recognition on the device. There is no remote fallback.
- Chrome reports no download progress or size and sets no time limit. The page says setup is under way, says it again after two minutes, and keeps typing open throughout. A `false` answer or a refusal shows a plain failure with a way to try again.
- Chrome tells a site that has not set up a language `"downloadable"` even when the pack is already on the device, so the offer says the browser "may" download.
- Where the browser answers `"unavailable"` for the chosen language and for `en-US`, Weave shows no voice controls. Brave 156 answers this way. Chromium's source does the same on Android and, by default, on ChromeOS; neither was checked on a device. A browser without the on-device question shows no voice controls either.

No dependency, model hosting or CSP change is needed, because the browser fetches the pack, not the page. A real Chrome install on a computer or an Android phone, and speech quality, are not yet proven ([proof](prototype/proof/speech-setup/README.md)).

The rule that there is no remote fallback changed on 19 November 2026 for browsers without speech on the device: see [Browser speech service, 19 November 2026](#browser-speech-service-19-november-2026).

### Browser speech service, 19 November 2026

On 19 November 2026 the owner decided that voice should work in as many browsers as possible, phones included, and approved a staged approach. It revises the on-device-only decision of 15 November for the fallback only. Speech on the device stays first wherever the browser has it, including the offer to set up the browser's own speech pack.

1. **Speech on the device**, exactly as in [Browser speech packs](#browser-speech-packs-15-november-2026).
2. **The browser's own speech service.** Where the browser has no speech on the device for the chosen language but does have speech recognition, Talk It Out uses the browser's ordinary recognizer. That recognizer may send the audio to the browser vendor's speech service: the [Web Speech API](https://webaudio.github.io/web-speech-api/) lets a browser process remotely unless `processLocally` is true, and asks that sessions start only with explicit, informed consent. Before the first use on a device, a notice says that the browser sends the person's voice to its own speech service, that Weave does not receive or keep the audio, and that typing always works. It names no company, because Weave cannot know which service a browser uses. Talking starts only after the person presses Agree And Talk It Out. The agreement is kept in this browser and withdrawn in Settings under Speech, which stops a session that is listening. The line beside Talk It Out says the browser's speech service is used before the agreement and again while it listens, and the language dialog names it; speech on the device says "Listening on this device" instead.
3. **The keyboard's microphone key.** Where Weave can offer no talking on a touch screen, one line says that a keyboard with a microphone key can be used to talk into the box. The keyboard's dictation belongs to the phone, and its audio never passes through Weave. The line says "if", because the key can be turned off or missing.

What the code holds to (`packages/app/src/describe/speech.ts`, `speech-setup.ts`, `speech-consent.ts`):

- A session is one of two modes, `device` or `browser`, from start to end. A device session that fails is never continued through the browser's service, and a browser session never starts without the agreement.
- Each way a browser session stops says only what the browser reported, in the status line under the box, and typing stays open: microphone refused (`not-allowed`), no microphone (`audio-capture`), no connection (`network`), a service that will not work here (`service-not-allowed`), a language it does not take (`language-not-supported`), no speech heard, and a recognizer that ended by itself after a pause. On a touch screen, a service that cannot be reached or will not work here also points to the keyboard's microphone key. Talk It Out keeps its place after every error, so the page does not move and pressing it again tries again. Chrome on Android ignores `continuous`, so a pause ends its sessions often; Weave keeps the words and does not restart listening by itself.
- Weave records, stores and uploads no audio, downloads no model, and adds no dependency, CSP change or header. The browser, not the page, talks to its speech service.

Still not approved: a speech model that Weave downloads (D32) and recording audio for transcription on a server (D35).

Which browsers this reaches, from [MDN's compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json) and not yet checked on devices: Safari on macOS and iOS (`webkitSpeechRecognition` since 14.1, no on-device question), Chrome on Android and Samsung Internet (a recognizer without on-device recognition), Edge, which [sends the audio to a Microsoft service](https://learn.microsoft.com/en-us/legal/microsoft-edge/privacy), and Chrome on a computer for a language it has no speech pack for. Firefox on Android has no speech recognition and gets the keyboard line. Brave exposes a recognizer but has no speech service ([brave-browser#3725](https://github.com/brave/brave-browser/issues/3725)), so its session fails and says so. Proof and what remains for real devices: [browser speech proof](prototype/proof/browser-speech/README.md).

### Step 3 PDF deck parser proposal

The prototype's attached PDF deck is shown as read on the device. The maker approved this parser in Step 3: add `pdfjs-dist@6.5.438` (Apache-2.0) to the app for text extraction only, using a same-origin Worker and disabling eval, font loading and WASM. Keep the existing CSP unchanged; request a separate, exact approval if verification shows any CSP delta is needed. Enforce the existing 25 MB file cap, cancel parsing with the build task, keep original bytes in the device draft and report scanned pages with no readable text. No remote PDF viewer, upload or OCR/model download is included. Office and OCR parsers remain separate dependency gates.

Step 3 verifies a two-page synthetic PDF under the unchanged production CSP, including one page without text, retained source bytes and offline rebuilding from the service-worker cache. This is fixture evidence in HeadlessChrome 149, not the real-user local-AI evidence due on 20 November. D32 still needs exact model manifests, approved hosting and device participants. D35 still needs provider, region, retention and consent decisions before cloud calls can open.

## Agent access

From the [agent access proposal](10-agent-access.md), 22 November 2026. These are questions for the user, who owns the product decisions in this build. The user approved D37 and D38 on 22 November 2026, and the first slice is built and switched off. The rest are open. D39 and D42 also need the council because they change what Weave's server sees or who can act for a person.

| ID | Question | Recommendation | Owner | Needed by | Status |
|---|---|---|---|---|---|
| D37 | Does Weave offer a public, read-only MCP endpoint at `/api/mcp` with `search_funds`, `get_fund`, `search_projects` and `get_project`? | Yes. Build it in `packages/api`, off until `WEAVE_MCP_ENABLED` is set, with no sign-in and nothing stored. | User | Before the slice is built | Decided (user, 22 November 2026) |
| D38 | Is the MCP handler hand-written, or does it use the official server package? | Hand-written, with no new dependency: a tools-only stateless server is about six methods. Revisit if a protocol revision makes upkeep costly; the alternative is `@modelcontextprotocol/server` 2.x with zod 4. | User | Before the slice is built | Decided (user, 22 November 2026) |
| D39 | May a tool rank funds for a description on Weave's server, when the app does that ranking on the device? | Yes, as a second slice: rank in memory, store and log nothing, and say so in the tool's description. If the answer is no, the description tool exists only in WebMCP, where it runs in the page. | User, then council | Before slice 2 | Open |
| D40 | Who adds the Vercel Firewall rate limit rule for `/api/mcp` and turns the switch on? | The user, after a preview deployment answers the route. Hobby includes one rule, set in the dashboard. | User | Before production use | Open |
| D41 | When does the app register WebMCP tools, and does Weave join Chrome's origin trial? | Register the same tools behind feature detection after the MCP slice lands, through the sessions that own the app shell. Do not join the trial until an assistant people use is known to call the tools. | User | After slice 1 | Open |
| D42 | Do assistants get signed-in tools (a person's initiatives, partner matches, saving a lead)? | Not yet. Wait for real use of the public tools, then write a separate proposal covering OAuth through Certified and how a person grants and withdraws an assistant's access. | User, then council | After slice 1 shows use | Open |
| D43 | When is Weave listed in the MCP registry and in assistants' connector directories? | After the public endpoint has run in production for two weeks without incident. Listing is publishing, so it needs its own yes. | User | After D40 | Open |
| D44 | Does Weave publish `/llms.txt` and an agent manifest at `/.well-known/ard.json`, and what do those paths answer until then? | Yes. Add `llms.txt` with slice 1, describing Weave, its public pages and the catalog. Add `ard.json` only when the MCP endpoint is on in production. Until then leave the manifest path alone and accept a 0 on that one Lighthouse audit; the alternative is a `vercel.json` rule that answers 404 there, which is deployment configuration. The quality session adds the files, since it owns `public/`. | User | With slice 1 | Open |

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
| Shared Auth Site URL | Website database and deployment maintainers, with the user's separate approval | The 9 November hosted test shows the shared project's Site URL is still Supabase's default, `http://localhost:3000`. Supabase sends an OAuth callback whose flow has expired there, and uses it as the default for email links and for any `redirect_to` outside the allow list. A change affects the website's steward sign-in, dashboard invitations and recovery emails, and makes every address on the new host an allowed redirect. Prove website and steward sign-in, Weave sign-in and an expired Weave attempt after any change. | Open; the setting is unchanged. Once deployed, the bridge returns an expired Weave sign-in to Weave before Supabase's 300-second flow ends. That normally keeps Weave off the Site URL, but a slow finish near the deadline, a replayed Supabase callback and a replayed bridge request can still reach it ([CERTIFIED.md](../../packages/api/CERTIFIED.md#app-callback-and-private-access)). |

The [build contract](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving)
records the baseline, owning paths and tests. These roles are proposed responsibilities,
not assignments to people or authorization to provision infrastructure.

### Public project editors, decided 12 November 2026

The user chose external public project editors for the first release. Guide a
new initiative that aligns with Ma Earth and chooses its ecosystem to create
its public organization/project in Ma Earth using Certified. Guide other new
initiatives to Certified's group/project editor. Reuse existing organizations
and projects before offering creation, then return to Weave and explicitly link
the published project. This supersedes the earlier default of creating a new
group and project inside Weave. The app implements the editor handoff locally as
of 13 November. It retains pending-operation recovery and does not remove the
legacy server create command. Hosted editor-return validation remains open.

The [creation and return flow](08-accounts-and-saving.md#public-project-creation-and-return)
owns the user journey. Certified remains the only Weave identity provider.
Private Save/Load needs no public project. Public support listing publication,
workspace grants and the reviewed teammate flow remain separate decisions.
External navigation does not authorize sending the private draft, choosing a
public audience or automatically linking a matching name. Preserve existing
personal project URIs as solo links; guide new team-ready projects to groups.

| Validation | Owner | Evidence still required |
|---|---|---|
| Ma Earth organization and group membership mapping | Integration maintainer with Ma Earth / Certified | Confirm which membership source its organization editor uses and whether invites, role changes and removals update the Certified group membership Weave verifies. Similar role names alone are insufficient. |
| Externally created project adoption | Integration maintainer with Ma Earth | Determine whether completing standard public metadata is sufficient or platform registration is also required. Preserve an existing organization DID and project AT URI; never resolve an adoption failure by silently creating replacements. |
| Editor handoff and return | App/API maintainers and designer | Preserve the draft and entry IDs, handle another code/consent prompt honestly, return to authorized discovery and require explicit project selection. Prefill and automatic return require a verified partner contract; neither is presumed available. |

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
| What can Weave verify and write through Certified? | Use the current sign-in for Weave identity, external editors for new public projects, and separately scoped consent for Weave-owned support publication or approved group actions. | Verify enumeration and authority after creation in each external editor, including a second project under one organization, private upstream drafts that are not discoverable, setup requests and approval, non-member grant denial, revoked authority and expired consent. Preserve recovery of existing Weave create intents without duplicating their groups/projects. |
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
| Can the Certified index support the launch coverage target? | Index every listed public Certified project the chosen index makes available, as [decided on 15 November](#all-listed-public-certified-projects-decided-15-november-2026). | Integration maintainer and source partners | A live traversal into local Supabase covered pagination, unlisted handling and the volume on 15 November ([evidence](../../packages/api/evidence/project-index-all-public-2026-11-15.md)). The first production refresh is now observed ([16 November evidence](prototype/proof/go-live-2026-11-16/README.md)); scheduled firing, updates and deletions over several days, rate limits, measured lag, and relevance and latency against the broader corpus remain open. |
| Which model and search settings meet the quality bar? | Compare the existing pinned embedding model plus full-text search against lexical-only retrieval; keep local refinement optional and no-model results usable. | Matching maintainer and domain reviewers | Held-out need/offer relevance and recall, evidence accuracy and language/domain breakdowns. The 80 percent relevance and 2-second p95 targets in section 7.6 are proposed test budgets, not achieved results. |
| Where should the indexing job run at pilot scale? | A daily Vercel Cron function in the Weave project, which Hobby allows once a day, writing to the existing Platform database. A GitHub Actions job would publish its logs from this public repository. No additional host or paid model service is presumed. | API and infrastructure maintainers | A full refresh of 1,123 projects took 24 to 25 seconds into local Supabase on 15 November, inside the 300-second Hobby limit; the first hosted refresh took 63.2 seconds ([16 November evidence](prototype/proof/go-live-2026-11-16/README.md)). Check memory, concurrency and transfer cost at 10k projects before that volume, and embeddings separately. Any new spend, dependency or hosted rollout follows repository rules. |

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

Each Certified project has one Weave workspace. New team-ready projects use
shared groups, which can begin with one owner and support teammates later.
The [chosen external editor](#public-project-editors-decided-12-november-2026)
handles public creation using the person's Certified identity. Reuse an existing
organization/group for another project where appropriate. Certified documents
one-owner group registration and adding members; the combined editor-return,
discovery and workspace access flow still needs verification.
[Certified Group Service API](https://github.com/hypercerts-org/certified-group-service/blob/main/docs/api-reference.md#group-lifecycle)

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

### Suggestions from a linked project's page

Decided by the user on 15 November 2026, after a linked project's card arrived
with no needs or offers. When a Certified project is linked or imported, Weave
reads the project's public description on the device and suggests up to three
needs and three offers from the sentences that ask for or offer something. They
show dashed, labelled "Suggested from your project page", after the card's own
entries. Nothing is kept, saved or shared until the person keeps it: Continue on
Needs and offers keeps what is left there, and Remove takes one away.

A suggestion never replaces or repeats an entry on the card, never brings back
one the person removed and stays within the five-entry limit. A card reads each
project once, so linking it again adds nothing. A card the person already checked
stays checked: the suggestions wait beside it, Your initiative says so and links
to Needs and offers, and saving and sharing carry on with the kept entries only.
Suggestions come from the keyword reader, not a model. If the description cannot
be read, the link still goes ahead, with no suggestions.

Known limits: removals are remembered on the device only, because a saved copy
keeps only kept entries. Opening a team workspace links nothing, so it suggests
nothing, and the team workspace's own editor does not suggest from the project
page yet. This records the user's direction, not a council vote.

### Certified index coverage at launch

First-release public-evidence suggestions use Certified projects. Coverage
targets all eligible public Certified projects that the chosen index can
enumerate. Since 15 November, a project is eligible when it is listed as public;
see the next section. Adapters for other public project sources follow after
the first release.
Validate the integration on a varied sample, then verify permissions,
freshness and match quality across the launch corpus. Browser previews still
use a bounded public snapshot. Report that coverage separately from the server
index.

### All listed public Certified projects, decided 15 November 2026

Decided by the user on 15 November 2026: Weave indexes and shows every public
Certified project the Hypercerts read API lists, Ma Earth's included. This
replaces the earlier requirement for an approved per-project permission
manifest. Publishing a project as public on Certified is the basis for showing
it. A project whose organization asks to be unlisted (`visibility=unlisted`, or
the older `unlisted=true`), or whose collection is not public, is not shown.
Projects whose account lives on Certified's development or test servers
(`dev.certified.app` and any `*.test.certified.app`) hold test data and are not
shown either; on 15 November that was 110 of 1,068 accounts. Each refresh reads
the account's server from its DID document through plc.directory. An account
that no longer exists or names no server is left out, and a lookup that fails
leaves the refresh unapplied.

Decided by the user on 19 November 2026: self-declared QA and test projects on
production accounts are left out too. The rule was narrowed twice the same day.
A first review found that a place name or an ordinary sentence could trip it. A
second found that "QA" after a name is also Qatar's country code, and that "it
is not a real organisation" describes an informal group.

- **By name.** The name leads with "QA" in capitals; or it holds nothing but
  test words, "project" and numbering, such as "Test project" or "Testing 2";
  or it carries "test" or "tests" set apart as a label, in brackets or split
  off by a dash, colon or bar at either end. A label at the end needs a space
  before the dash, colon or bar.
- **By its own words.** A sentence says only that this is a test or QA project,
  story or entry; or opens with that label in capitals; or opens by naming an
  automated QA or QA test project, or a QA story or entry; or says that this is
  not a real project; or says the entry was made on staging or for testing.
- **Not signals.** "Test" or "QA" as one word of a longer name, such as a place
  called Test Valley; "QA" in brackets, or split off after a name, as in a
  project in Qatar; a pilot described as "a test project"; a group that says it
  is not a real organisation or initiative; and "soil testing", "attested" or
  "demo".

The rule prefers showing a test entry it cannot tell from real work over hiding
real work. Read-only runs over the public list of 1,006 projects on 19 November
found the same 14 under the first rule and after each narrowing: 13 by name and
1 by its own words.

- A daily refresh traverses the whole listing. Only a complete traversal, with
  every account looked up, replaces what Weave shows: a failed page, a repeated
  cursor, a failed account lookup, the page budget or the time budget changes
  nothing.
- A project that disappears from the listing or becomes unlisted is withdrawn
  by the next complete traversal, and its stored passages are deleted. A
  listing that would withdraw more than half of the shown projects at once is
  refused as a likely source fault.
- A project stays shown for 72 hours without a complete traversal confirming
  it, so a failing source cannot keep stale projects up for longer.
- Weave shows the project's name, its own words from the public record and its
  dates, and links to the record. Records that carry contact details or markup
  in their title are skipped. Projects with no usable description text are
  indexed but not listed.
- Amended 19 November 2026, after the maker's QA asked for more on each card
  and for filters ([DL-120](../../packages/design-system/decision-log.md#dl-120-a-public-project-card-says-who-shared-it-and-where-and-the-list-filters-on-kind-of-group)):
  a card also says who shared the project, from the display name on the
  publisher's Certified profile, and the place label the publisher set. The
  place is shown only when the listing carries the exact version the record
  pins, and it is context only, never a country or region. The list can be
  searched by both and filtered on the kind of group the publisher's
  organization names, such as nonprofit. A name, place or kind that is
  missing, too long, or carries a link, an email address, a phone number or
  control characters is left out, and so is a place with any digit in it,
  which on 19 November was always a street address, a plus code or
  coordinates. The project is still shown. These come from records other
  than the project's own, so each refresh rewrites them and a withdrawal
  deletes them with the passages. Pictures still wait on D30, and an
  organization's links are never shown as the project's.
- Amended 21 November 2026 ([DL-121](../../packages/design-system/decision-log.md#dl-121-initiatives-sorts-newest-first-oldest-first-or-by-name)):
  the list can also be sorted oldest first or by name. Newest first stays
  the default.
- The Initiatives page and Home's Recently shared read the index. When the
  index is empty or does not answer, the Initiatives page shows the starter
  list of public sources instead.

The public list is an index of what Certified publishes, not an endorsement,
and listing a project there sends it nothing. Matching on its evidence follows
the sections above.

### Production project access, recorded 16 November 2026

The user authorized production project access for any verified Certified identity
on 15 November 2026. The production audit found `WEAVE_PROJECTS_ENABLED=true`
and `WEAVE_PROJECT_ACCESS_MODE=authenticated` already set before this task;
neither was newly switched on. The existing credentials, production Group Service
and PDS origins, and database CA were preserved. No pilot identity list was added.
Certified group publication remains off, and no custom project PDS origins were
enabled.

The user approved the full `develop` release on 16 November, including fixes
#80/#81 and the already present catalog revisions #9/#71 and keyword change #79.
Release #83 reached production as `ea2b810`. Both initially designated launch
blockers passed on the verified new client: negation classification and real A/B
cross-tab session changes. The user then stopped sharing after browser-control
timeouts and directed that matching remain unproven; no app failure was established
by those timeouts. This is not a blanket launch-QA approval. The
[16 November evidence](prototype/proof/go-live-2026-11-16/README.md)
preserves the initial failures, fixture proof, production retests and remaining
limits. The user subsequently authorized finishing and merging the evidence PR.

### Catalog routine draft pull requests, decided 15 November 2026

The user authorized catalog routines to create their own branches and open draft
pull requests. Routine changes target `develop` and follow the catalog guide,
committed lockfile and required checks. This permission does not authorize merging,
releasing or publishing to Funding Commons. Publication from
`codex/funding-commons-demo` still needs its own authorization.

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

### Matching architecture answers, 19 November 2026

The [matching architecture proposal](research/matching-architecture.md#decisions-for-the-owner-and-council)
puts D27, D29, D32 and six new questions to the owner and council. The user
answered all nine on 19 November 2026, and the answers are recorded here. Each
records the user's answer. It is not a council decision, a catalog change, a
specification change or approval to build, and the owners the tables above name
have not confirmed it.

**D29, team asks for a fund.** The user accepted the proposal's recommendation
on 19 November 2026, in four parts:

- **Source.** A steward enters each of a fund's team asks with the funder's
  words, a source, a date, a role, a count and an optional condition on whoever
  fills it.
- **Where to start.** The 23 programs that appear to require more than one
  organization, then the 32 that allow it.
- **Scoring.** Coverage is shown as counted asks, such as "2 of 3 asks", never
  as a score.
- **Specification.** The union of places leaves spec 7.4, because place of work
  is something a partner cannot change.

What was known when answering: the counts of 23 and 32 come from one unreviewed
reading of one line per program, so a steward checks them before any ask is
entered; steward time per program is unmeasured; and a condition on an ask can
be checked only once owners can share applicant facts and offers can carry a
role, which are the proposal's first and second new questions, answered below.

**D32, models for partner retrieval.** The user accepted the proposal's
recommendation on 19 November 2026, in four parts:

- **Benchmark.** Partner retrieval joins the model benchmark.
- **Models.** Multilingual MiniLM-L12 and at least one alternative are tested on
  a new holdout.
- **Where it runs.** In server jobs first.
- **The live site.** Its fund vectors stay as they are.

What was known when answering: the proposal's figures (91% against 67% relevant
among the top five, and Portuguese recall of 72% against 22% on 9 queries) come
from the synthetic v3 holdout, which is agent-judged and had been examined, and
the two best variants were added after the first scored run; on the real-project
set `partner-real-v1` the current matcher scored 31% relevant among its top five,
and the multilingual model has not been run there; each multilingual model is
about 135 MB against 25 MB for the English one, and size, cold start and speed on
the host or in a browser are unmeasured; and the licences of the two converted
model repositories are unverified. The answer commits to testing. It approves no
model dependency, hosting or CSP change, as the D32 row says.

Licence check, 21 November 2026: the two converted repositories state no licence,
while the upstream models are MIT (multilingual-e5-small) and Apache-2.0
(multilingual MiniLM-L12) and publish their own 8-bit ONNX files. The benchmark
should use those upstream files, pinned and hashed. The
[experiment README](../../packages/api/evaluation/experiments/matching-architecture/README.md#licence-check-21-november-2026)
has the revisions, hashes, shipping obligations and what stays unsettled. It
approves nothing beyond the answer above.

Holdout plan, 21 November 2026: the
[`partner-real-v2` plan](../../packages/api/evaluation/partner-real-v2-plan.md)
sets out the new holdout, the frozen engines, the human review and the decision
rule, with six questions for the user. The user answered five on 21 November 2026. Its human review replaces the one planned for
`partner-real-v1`, which stays as development data with its agent labels. Its
160 queries are 100 in English, 40 in Portuguese and 20 in Spanish, and blind
agent instances write all of them. The decision rule stands as proposed: seed
recall no more than 5 points below the current matcher's, and no-match
suggestions no more than 10 points above its share. The sealed files live on a
private shared drive until the scored run. Reviewers judge the smaller pool: the
engines' suggestions, the seed and two controls per query, about 1,100 pairs, which
the plan puts at 4.5 to 6 hours each.
Who the two reviewers are is still open.

Engines frozen, 21 November 2026: the user chose to set the model cut-offs on
`partner-real-v1` by the decision rule's own gates (recall no lower than the
current matcher's, Portuguese and Spanish recall above it, no-match suggestions at
most 10 points above its share). Multilingual MiniLM-L12 goes forward, loading
upstream's own 8-bit file. Multilingual-e5-small does not: no cut-off passed the
gates. The holdout now compares the current matcher with MiniLM-L12 only, which
lowers the reviewer estimate to about 750 pairs, 3 to 4 hours each, as a lower
bound. The
[engine manifest](../../packages/api/evaluation/partner-real-v2-engines.json)
freezes the settings, model files and scripts.

Corpus and queries frozen, 21 November 2026: the 979-project corpus and the 160
queries, written by blind agent instances, are sealed by hash in
[`partner-real-v2.sha256`](../../packages/api/evaluation/partner-real-v2.sha256).
The files themselves stay private until the scored run, as the plan says. The pool
and worksheet followed the same day, also sealed by hash: 1,050 pairs, which puts
each reviewer at 4.4 to 5.8 hours, within the 4.5 to 6 agreed, so the 750 estimate
above was low. The packets go to the reviewers once they are named.

Hard gate for the model, 21 November 2026: the user decided that rule 1 of the
decision rule checks MiniLM-L12's suggestions for provenance only, since the
frozen engine produces no explanation. An explanation for model suggestions has to
be designed before any model ships.

**D27, counts for private viewers on the team view.** On 19 November 2026 the
user confirmed both parts the proposal asks:

- **Counts only.** On the team view, as elsewhere, a viewer who has shared
  nothing sees how many initiatives could cover a fund's asks, with no names or
  reasons.
- **Small counts.** Below a set count a private viewer sees "some", not an exact
  number. This is also the fourth of the proposal's new questions. No threshold
  was set.

What was known when answering: the prototype keeps to counts only by computing
the full result and then hiding the names; computing a private viewer's counts on
the device, without sending their gaps to a server, is a design that is not
built; and in a small network a count of one can point at a single initiative.
D27 is the council's question, so its row stays open.

**Sharing three applicant facts, the proposal's first new question.** On
19 November 2026 the user answered "not yet". Applicant type, base country and
registration country stay on the person's device, where the funding form already
uses them, and are not shared for matching. A fund's team asks are shown in the
funder's own words, conditions included, for people to judge for themselves.
Weave does not check a condition against another initiative's facts.

The reasons put to the user: the shared facts serve only the team view. About
23 programs appear to require a team and 32 to allow one, by one unreviewed
reading, and few shared entries are expected at launch. Partner matching
improves through D32, from text people have already written. If teams prove
useful, sharing can come back as one optional choice when an owner shares an
initiative, reusing answers already given. The D29 answer stands: a steward
still records each ask with its condition, and people read the condition.

**A role on an offer, and suggesting that another initiative applies, the
proposal's second and third new questions.** On 19 November 2026 the user
answered "not yet" to both. An offer carries no role field such as lead
applicant, co-applicant, fiscal host or local partner, and Weave does not suggest
that another initiative becomes the applicant. Both serve only the team view and
lean on the shared facts set aside above. A person can already say in an offer's
own words that they can lead an application or act as a fiscal host, and people
reading a fund's ask can agree between themselves who applies.

**Asking about money once, the proposal's fifth new question.** On
19 November 2026 the user accepted it. The funding form loses "Funding goal
from", "Funding goal up to" and "Goal currency". The amount and currency come
from a financial need, and what the money is for joins the text the fund search
reads. An initiative with no financial need still sees funds ranked from its
description and themes, with one line inviting it to add one. The
recommendation the user accepted carried two conditions: goal values already
saved in drafts are carried over, and the funding ranking itself stays as it is.
It was not put as urgent.

What was known when answering: this makes the form shorter and is not shown to
improve results. In the one test, using the need changed 3 of the top 10
programs, and there is no labelled funding set to say whether that was better.
The amount can be compared for 54 of 730 programs and a closing date for 29.

**A recall floor for partner matching, the proposal's sixth new question.** On
19 November 2026 the user accepted it. Partner matching is held to a floor on
recall, the share of fitting projects it finds, beside the 80% relevance target
in the [technical spec](05-technical-spec.md#quality-and-performance-proof),
which already asks for a floor to be agreed from the labelled corpus before
tuning. No number is set. It is set once two human reviewers have judged the
`partner-real-v1` worksheet, and nothing is tuned against that set before then.

Changed on 21 November 2026: the user replaced the human review of
`partner-real-v1` with the one in the
[`partner-real-v2` plan](../../packages/api/evaluation/partner-real-v2-plan.md).
The floor is now set in that plan's decision rule, relative to the current
matcher: a candidate's seed recall may be at most 5 points below the current
matcher's. The user confirmed it the same day. `partner-real-v1` becomes
development data, so the D32 model cut-offs may be set on it.

What was known when answering: on `partner-real-v1`, judged by agents, the
current matcher found 31% of fitting projects and showed nothing for 42 of 135
needs and offers that had one, against 41% and 10 for the keyword baseline. The
two agents left about as many pairs unresolved as they agreed were relevant.
