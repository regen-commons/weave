# Logical architecture: Regen Commons Weave (working name)

Status: draft for review · Date: 2026-10-31
Companion documents: [PRD](04-prd.md) · [technical spec](05-technical-spec.md) · [proposal brief](01-proposal-brief.md)

This document describes the shape of the system: the parts, what each owns, how data flows, and how the platform stays one node in a wider commons rather than a new centre. Technology choices and schemas are in the technical spec.

## First-release architecture

These diagrams describe the target for Certified projects, drafts, publishing
and matching. The sections below describe the wider platform, including
later phases. Use the [technical spec](05-technical-spec.md#certified-project-integration-target)
for API and data contracts and the
[build plan](05-technical-spec.md#76-build-plan-and-ui-handoff) for preview
evidence and release checks.

**Redrawn 28 November 2026 (DL-155, D48):** a need or offer lives in one of three
places. A personal project's draft is on the person's device. A group project's
shared team draft is in its team workspace on Platform. A published need or offer
is a `com.regencommons.weave.supportListing` record in the project's AT
repository. New personal private saves stopped in step 4 and sharing for matching
ended in step 5 of the
[removal plan](08-accounts-and-saving.md#retiring-private-saves-and-weave-only-sharing).

### System and data ownership

```mermaid
flowchart TB
  subgraph Device["Browser"]
    draft["Device drafts, source files and suggestions"]
    app["Weave app"]
    funding["Local funding and partner matching"]
    shortlist["Shortlist of partners and initiatives"]
    app <--> draft
    draft --> funding
    funding --> shortlist
  end
  certified["Certified person identity"]
  bridge["Weave identity bridge"]
  auth["Platform Auth"]
  api["Weave API: account, project, publishing and matching commands"]
  platform["Platform: workspaces, grants, group team drafts and Weave's record of published listings"]
  snapshot["Public snapshot: project evidence and published listings"]
  groupService["Certified Group Service: group roles and scoped writes"]
  editors["Ma Earth or Certified: public organization and project editors"]
  repo["AT repositories: public project records and support listings"]
  app -->|"Chosen editor handoff, draft retained"| editors
  editors -->|"Publish shared public profile/project"| repo
  app -->|"Sign in"| bridge
  bridge <-->|"Verify person's DID"| certified
  bridge -->|"Verified identity"| auth
  auth -->|"Weave session"| app
  app <-->|"Reviewed publishing, withdrawal, links and team-draft edits"| api
  api <--> platform
  api <-->|"Check roles and perform approved group actions"| groupService
  groupService -->|"Write reviewed records"| repo
  api <-->|"Verify public records and read back writes"| repo
  platform -->|"Published, read-back listings"| snapshot
  snapshot -->|"Bounded public read"| funding
```

A person DID identifies the actor. A group DID identifies a publishing account.
The project AT URI identifies one public project, and its CID identifies the
observed version. The Weave UUID identifies the workspace and stays stable
across team-draft edits. Working files and private queries remain on the device.
A personal project's needs and offers leave the device only when the person
publishes the ones they reviewed. A group project's editors save the team draft's
initiative fields and entries to its team workspace on Platform, where teammates
with a Weave grant read them.

### Project and entry lifecycle

```mermaid
flowchart TB
  draft["Start a local draft and match for funding"] --> save["Sign in with Certified"]
  save --> select{"Which project?"}
  select -->|"No project yet"| editor{"Choose public editor"}
  editor -->|"Aligned with Ma Earth and chooses it"| ma["Reuse or create organization/project in Ma Earth"]
  editor -->|"Other initiatives"| certifiedEditor["Reuse or create group/project in Certified"]
  select -->|"Existing personal project"| solo["Verify and link the solo project"]
  select -->|"Existing group project"| access{"Workspace already linked?"}
  access -->|"Yes"| grant["Check existing workspace grant"]
  access -->|"No"| request["Verified member requests setup"]
  request --> approve["Certified group admin or owner verifies and approves"]
  ma --> readback["Return and discover the published project"]
  certifiedEditor --> readback
  readback -->|"Explicit selection and verification"| select
  readback -.->|"Private upstream draft or unavailable discovery"| keepWorking["Keep private work and funding matching available"]
  solo --> deviceDraft["Keep the needs and offers in the device draft"]
  grant --> workspace["Open the group project's team workspace"]
  approve -->|"Activate workspace and apply explicit grants"| workspace
  workspace --> teamDraft["Editors and admins change the shared team draft"]
  deviceDraft --> publish["Review and publish chosen needs and offers to AT Protocol"]
  teamDraft -->|"Current group member with a Weave editor or admin grant"| publish
  publish --> confirmed["Confirm the public record by read-back"]
  confirmed -->|"Withdraw, close or lose project visibility"| withdraw["Request withdrawal and report its state"]
  workspace -.->|"Project deleted or made unlisted"| paused["Pause matching and preserve team work"]
  paused -->|"Same project restored and reviewed"| workspace
```

A setup request grants no access and keeps the draft on the device. A group
project's team draft is visible to teammates with current access, and its editors
and admins publish from it; group publishing stays off in production until
`WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED` is set. A personal project publishes from
the device draft, and later edits there leave the public record as it is until the
person publishes again or withdraws it. Nothing is shared for matching short of
publishing. A person removed from the Certified group loses workspace access.
Published team listings can stay live under the remaining authorized teammates.
Confirmed project deletion or unlisting also requests withdrawal of public
listings.

The [12 November editor decision](open-decisions.md#public-project-editors-decided-12-november-2026)
replaces inline public project creation in this target. The handoff may require
another code or consent; prefill and automatic return are not established.
Existing projects are reused, and pending operations from the current Weave
creator must be reconciled before offering creation elsewhere. The diagram
does not assert that Ma Earth and Certified group membership already synchronize.

### Matching and evidence

```mermaid
flowchart TB
  upstream["Eligible public Certified projects"] --> feed["Hypercerts public index"]
  feed --> jobs["Resumable ingestion and refresh"]
  jobs --> evidence["Platform evidence index: passages, AT URI, CID and freshness"]
  listings["Published support listings, confirmed by read-back"]
  draft["The draft on the device"] --> local["On-device ranking against a bounded public snapshot"]
  evidence -->|"Public snapshot"| local
  listings -->|"Other projects' listings, at most ten per project"| local
  own["The project's own published listings"] --> matcher["Weave API: listing_search, for members of the project's workspace"]
  listings --> matcher
  evidence --> matcher
  local --> direct["Direct fits: another project's published need or offer"]
  local --> possible["Possible fits from public evidence"]
  matcher --> direct
  matcher --> possible
  direct --> result["Partners For You: supporting evidence, unknowns and source"]
  possible --> result
  result -->|"Bookmark"| shortlist["Shortlist on the device"]
```

Results distinguish a published need or offer, a public statement and an
inference. A relevant capability or potential use can appear when an important
detail is unknown. The result names what to verify. A known conflict rules out
the pair. The launch target covers all eligible Certified projects the index can
enumerate. Local snapshots cover a smaller set and show their coverage.

Before release, prove Certified group setup and grants, scoped publishing and
withdrawal, and permissions, refresh and matching quality at launch volume.
See the [validation register](open-decisions.md#project-integration-and-support-listing-validation).

## 1. Five layers

| Layer | Purpose | Owns | Runs |
|---|---|---|---|
| Experience | The three-step conversation, matches, places, recipes, pulse | Drafts, UI state, local AI models | Browser (PWA) |
| Intelligence | Turn source text into checked cards or attributed evidence; retrieve candidates; explain matches | Extraction contracts, derived search index, matching rules, model versions | Local workers, matching API and background indexing; cloud AI only with consent |
| Records | The commons' operational truth: initiatives, needs, offers, places, programs, recipes, consents | Schema, row-level security, audit, revisions | Supabase (shared Regen Commons project) |
| Exchange | Everything that leaves or enters the platform: email, Murmurations, KOI events, knowledge commons exports, later commitment pools | Identifiers, hashes, consent scopes, retraction | Vercel functions, Edge Functions |
| Stewardship | Curation, verification, challenges, metrics, catalog research | Steward commands, pulse controls, research workflow | Steward desk on regencommons.com; repository automation |

The ordering is deliberate: a person can get value from the Experience and Intelligence layers with nothing stored anywhere but their device. Records begin only when a person publishes a need or offer, which makes it public, or when a group project keeps its shared team draft, which only teammates with a Weave grant can read. Exchange begins only with consent. Stewardship tidies; it never gates publishing in the open tier.

## 2. Context

```mermaid
flowchart TB
  P[People running initiatives<br/>place-based, tech, research, culture]
  F[Funders, allocators,<br/>bioregional financing facilities]
  S[Stewards and council]
  W((Weave<br/>weave.regencommons.com))
  RC[Regen Commons site<br/>members, join, steward desk]
  FC[Funder catalog research<br/>funding-commons repository]
  MU[Murmurations index]
  KOI[KOI network<br/>Regen KOI node, Metagov]
  KC[Regen Knowledge Commons]
  CLC[Cosmo-Local Credit pools<br/>Phase 3]
  NET[Partner networks<br/>Bloom, Greenpill, ReFi DAO,<br/>Regen Coordination, BioFi]
  P -->|describe, save, share, respond| W
  W -->|matches, pulse, intros, recipes| P
  F -->|browse regions, publish calls| W
  S -->|verify, curate, challenges| W
  W <-->|shared Auth, members link,<br/>steward predicate| RC
  FC -->|released catalog| W
  W -->|consented profiles| MU
  W <-->|signed events| KOI
  W -->|review bundles| KC
  W -.->|offerings, commitments| CLC
  NET <-->|cross-posted offers and needs,<br/>regional calls, cohorts| W
```

## 3. Containers

```mermaid
flowchart LR
  subgraph Device["Person's device"]
    App[App shell<br/>React PWA]
    Guide[Conversation guide<br/>three steps]
    Workers[AI workers<br/>Whisper, extraction model,<br/>embeddings]
    Parsers[Parsers<br/>PDF, DOCX, XLSX, PPTX, OCR]
    Local[(Local store<br/>drafts, ledger, models)]
    App --> Guide --> Workers
    Guide --> Parsers --> Workers
    App <--> Local
  end
  subgraph Edge["Vercel"]
    Shell[Static assets, models, catalog snapshot]
    AIProxy[/api/ai<br/>consented cloud proxy/]
    Share[/api/share<br/>Murmurations, KOI publisher/]
    Intro[/api/intro, /api/handoff<br/>relay and membership handoff/]
    Identity[Certified identity bridge<br/>auth.regencommons.com]
    MatchAPI[Account and matching API]
    CronV[Cron: catalog import]
  end
  subgraph Data["Supabase: Regen Commons / Platform"]
    Auth[Supabase Auth<br/>internal Weave sessions]
    DB[(Postgres<br/>schema weave + existing public/private)]
    Fn[Edge Functions<br/>send-email hook, pulse-compose, outbox-send, match-batch]
    Sched[pg_cron]
  end
  Mail[Resend]
  Desk[Steward desk<br/>/admin on regencommons.com]
  Cat[(Catalog release<br/>JSON + vectors)]
  PublicProjects[Hypercerts public API<br/>Certified project evidence]
  Indexer[Resumable indexing job<br/>runtime validated before rollout]

  App <--> Shell
  Certified[Certified: person sign-in]
  App <--> Identity
  Identity <--> Auth
  Identity <--> Certified
  Identity --> DB
  App <--> MatchAPI
  MatchAPI --> DB
  PublicProjects --> Indexer --> DB
  App --> AIProxy
  App --> Intro
  AIProxy --> DB
  Share --> DB
  Sched --> Fn
  Fn --> Mail
  Fn --> DB
  Desk --> Auth
  Auth -. website auth mail only .-> Fn
  CronV --> Cat
  CronV --> DB
  Desk --> DB
```

What each container owns:

- App shell: routing, theme and components from the [design system](../../DESIGN.md), offline cache, capability detection, consent dialogs.
- Conversation guide: the state machine for the three steps, prompts, confirmation cards, nudges; works with any tier including "no model".
- AI workers: Whisper transcription, extraction with a small instruct model or the browser's built-in model, the embedding model already shipped by Funding Commons. Nothing in a worker touches the network except pinned model files from the app origin.
- Local store: drafts (IndexedDB), the local AI ledger, cached models (Cache API), bounded public snapshots for private matching, and the shortlist. A group project's team draft never becomes a public offline asset.
- Account and matching API: enforces the caller's session and owned initiative, reads current approved projections, retrieves a bounded shortlist and returns source-backed reasons. Local workers can refine relevance but cannot upgrade evidence or permissions.
- Public project indexer: validates permitted records, preserves source identity/version and supporting passages, and computes search representations once per changed input. The index is derived data, not a second project editing authority. External indexing creates no Weave account, need or offer.
- Certified bridge: proves person identity and establishes the internal session. It is separate from the matching API and indexing job; no additional login is introduced.
- Vercel functions and restricted jobs: hold server credentials only in their intended runtime. The matching read path uses the caller's authorization; the indexer has narrow access to its derived public-data tables.
- Supabase: records, policies, internal Weave sessions, scheduled jobs and outbox. Certified is the only Weave sign-in provider; no Weave credentials, account migration or alternate login. The bridge and [first-build contract](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving) own this boundary. One project is shared with the Regen Commons site; platform objects stay in their own schema.
- Steward desk: unchanged location and login; gains sections for the platform's records.
- Catalog release: produced by the existing research workflow; the platform is a consumer.

## 4. Domain model

```mermaid
erDiagram
  PROFILE ||--o{ INITIATIVE_PERSON : "edits"
  PROFILE }o--o| MEMBER : "links to Regen Commons member"
  INITIATIVE ||--o{ INITIATIVE_PERSON : "has"
  INITIATIVE ||--o{ NEED : "states"
  INITIATIVE ||--o{ OFFER : "states"
  INITIATIVE }o--o{ PLACE : "based in / works in"
  PLACE ||--o{ PLACE : "contains"
  FUNDER ||--o{ PROGRAM : "runs"
  PROGRAM ||--o{ PROGRAM_CONDITION : "requires"
  PROGRAM ||--o{ ELIGIBILITY_RULE : "screens by"
  INITIATIVE ||--o{ MATCH : "subject of"
  MATCH }o--o| INITIATIVE : "partner"
  MATCH }o--o| PROGRAM : "opportunity"
  RECIPE }o--|| INITIATIVE : "led by"
  RECIPE }o--o| PROGRAM : "base"
  RECIPE }o--o| PLACE : "for"
  RECIPE ||--o{ RECIPE_MEMBER : "joined by"
  INITIATIVE ||--o{ INTRO : "sends / receives"
  PROFILE ||--o{ CONSENT : "grants"
  CONSENT ||--o{ AI_RUN : "covers"
  OFFER ||--o| OFFERING : "is a voucher-ready"
  OFFERING ||--o{ COMMITMENT : "fulfilled through"
  INITIATIVE ||--o{ SHARED_RECORD : "published to networks as"
```

Concepts and their owners:

- Initiative, Need, Offer: needs and offers belong to an initiative. A personal project's initiative is a draft on the person's device; a group project's is its shared team draft in the team workspace. A person with authority for the project chooses which needs and offers to publish, and only published listings take part in other initiatives' matching (DL-155, D48). The public directory has its own visibility choice. See [saving and accounts](08-accounts-and-saving.md#where-work-lives).
- Place: a reference, never typed free-hand into records; bioregion, subrealm, realm, basin, country, custom.
- Funder, Program, conditions, rules: owned by the research workflow; the platform reads, never edits.
- Match: computed, explained, versioned; a person's reactions (the shortlist bookmark, contact) are owned by them, and the shortlist stays on their device (DL-153).
- External project evidence: a source passage about work, resources or a stated request, with provenance. It can support an inferred capability or potential use of an offer; it cannot assert current availability or create an owner-confirmed entry. Both external evidence and published listings appear in Partners, with distinct labels and actions.
- Recipe: a partnership forming around a base; owned by its lead; joiners bring ingredients.
- Consent and AI run: the audit spine for anything that leaves the device or the platform.
- Offering and Commitment: the bridge to commitment pooling; off-chain records with hashes until Phase 3.
- Shared record: the ledger of what was sent where, with the identifier and hash, so retraction is precise.

## 5. Flows

### 5.1 Three-step intake on a device

```mermaid
sequenceDiagram
  participant U as Person
  participant G as Guide (browser)
  participant W as AI worker (browser)
  participant C as Cloud proxy (only with consent)
  participant D as Weave API and Platform
  participant I as Certified sign-in via bridge
  participant R as Project's AT repository
  U->>G: talk / type / drop a deck / paste a link
  G->>W: transcribe audio (Whisper) · parse files · build text
  W-->>G: transcript + text
  G->>W: extract InitiativeDraft (schema-constrained)
  alt tier cannot run a model
    G->>G: heuristic draft from keywords
    opt person opts in
      G->>C: text only, hashed in ledger
      C-->>G: validated draft
    end
  end
  W-->>G: draft + confidence
  G-->>U: show the four-field card and derived details for correction
  U->>G: reviews and checks the initiative
  G-->>U: funding and partner suggestions from a bounded public snapshot, nothing sent
  opt person publishes chosen needs or offers
    G->>G: persist device draft
    U->>I: sign in with Certified
    I-->>G: restore task with Weave session
    U->>G: choose Make It Public and the entries
    G->>D: reviewed public fields for the linked project
    D-->>U: exact records and destination, held for ten minutes
    U->>D: confirm once
    D->>R: write support listings
    D->>R: read them back
    D-->>U: published, with each record's address
  end
  opt project has published listings
    U->>D: listing_search on the project's own listings
    D-->>U: other projects' listings as direct fits, and attributed public project suggestions
  end
```

### 5.2 Matching

```mermaid
flowchart LR
  A[Project A's own<br/>published needs and offers] --> Retrieve[Matching API: listing_search<br/>keyword and semantic retrieval]
  B[(Other projects' current<br/>published listings)] --> Retrieve
  X[Permitted Certified project records] --> Job[Background indexing<br/>passages, provenance, embeddings]
  Job --> E[(Derived public evidence index)] --> Retrieve
  Retrieve --> Rules[Compatibility and evidence rules<br/>bounded, explained shortlist]
  Rules --> Local[Optional local refinement<br/>baseline results remain usable]
  Local --> Partners[Partners For You<br/>published needs and offers, public statements,<br/>inferred capability or potential use]
  Private[The draft on the device] --> PrivateSearch[Local matching<br/>bounded public snapshot only]
  E -->|permitted public snapshot| PrivateSearch
  B -->|at most ten per project| PrivateSearch
  PrivateSearch --> Partners
  D[Checked device draft] --> SS[Solo opportunity score<br/>existing rubric: thematic fit,<br/>readiness, research priority]
  Pr[(Programs, conditions, rules)] --> SS
  SS --> Funding[Funding results]
  Partners -->|bookmark| SL[Shortlist on the device]
  SL -.->|later, only with consent| FB[Feedback]
  FB -.->|offline evaluation, versioned changes| Rules
```

One-way matches are useful. A need can match an external project's experience;
an offer can fit a project's activities even when that project has stated no need.
The latter is an inferred possibility, not a request from that project. Sources,
unknowns and confirmation stay visible. The API performs ordinary search over
prepared indexes; a cloud LLM call is not required on every search. Later
partnership scoring, introductions and pulses consume only their separately
eligible evidence and are outside the [next handoff](05-technical-spec.md#76-build-plan-and-ui-handoff).

### 5.3 Consent and exchange

```mermaid
flowchart TB
  R[Record: initiative, need, offer, recipe] --> V{visibility}
  V -->|draft| L[(Device only)]
  V -->|private| O[(Supabase, owner only)]
  V -->|network| M[(Supabase, readable when signed in)]
  V -->|public| P[(Supabase, public API, JSON export)]
  P --> SC{share scopes}
  SC -->|murmurations| MU[Murmurations profile + index post]
  SC -->|koi| K[Signed NEW / UPDATE events to a full node]
  SC -->|knowledge_commons| KC[Review bundle for human review]
  W[withdraw or change scope] --> X[Retraction: index delete, KOI FORGET, bundle withdrawn]
  SR[(shared_records ledger: rid, hash, last event)] --- MU
  SR --- K
  SR --- KC
```

Since DL-155, a need or offer uses only two of these levels: draft, on the
device or in a group project's team draft, and public, as a support listing in
the project's AT repository. The private and network levels no longer hold needs
or offers.

### 5.4 Weekly pulse

**Open question ([D50](open-decisions.md#for-the-builders)):** the composer below
picks saved initiatives, and personal saves are gone, so a person has no saved
initiative to compose a pulse for. A group project's team draft still could be
one. The user has not chosen a replacement; the passage stays as designed until
then.

Composer selects eligible initiatives (saved, pulse consent, confirmed within 180 days or due for a confirmation prompt), gathers new partner matches, closing opportunities in the initiative's themes and places, nearby needs its offers could meet, recipes needing its ingredient, applies exposure caps, writes one outbox row per recipient with an idempotency key, and the sender delivers through Resend in batches with retries. Every pulse carries the one-tap "still accurate" link that refreshes the record's confirmed date.

## 6. Decentralisation posture

The council's open question was how to avoid building a new centre. The answer is structural, not aspirational:

1. Local first. Drafts, transcription, extraction, and private funding and public-source matching can run on the device. Matching a project's published listings uses the API and a derived public project index to avoid downloading and reprocessing an entire network per visitor. Only bounded public snapshots are used for private local queries; sending a private query or its embedding to a server is a separate disclosed choice.
2. Owned records. People publish their own records to their project's repository, see where they went, and can withdraw them; retraction propagates to every network they were shared with.
3. Open identifiers and schemas. Every public record has a stable reference identifier and a content hash; profiles are published in Murmurations schemas; exports are JSON and CSV; vocabularies are published.
4. One node among nodes. Later interoperability uses KOI and Murmurations publishing. Weave's search index is a rebuildable projection of permitted evidence, not a replacement for upstream records or a claim of complete network coverage. Knowledge enters the Regen Knowledge Commons only through that project's review, never by direct write.
5. Forkable. Open-source code, an open data licence and a documented deploy let another network run its own instance with its own Supabase project; instances exchange through the same open channels. The Regen Commons instance is the first, not the only.
6. Commons-held operations. The shared Supabase project, the steward predicate and the catalog research live under Regen Commons governance (council, members, stewards) with a published policy for data, consent and retraction.

Where KOI and Coop come in:

- KOI gives the reference-identifier discipline and the event protocol for exchanging records across organisations under consent (the Telescope model: labels travel, material stays home). The platform adopts the identifiers from Phase 0 and the protocol in Phase 2.
- Coop is a pattern library and, later, a capture tool: its provider-tier cascade, JSON repair loop, review-before-share gate and Whisper transcription module are the proven shapes reused here; a Coop receiver on a phone could feed voice and photo captures into the intake as candidate needs and offers. Importing Coop code means AGPL for the platform, which is the proposed licence anyway.

## 7. Deployment view

```mermaid
flowchart LR
  DNS[regencommons.com DNS<br/>CNAME weave to Vercel] --> V[Vercel project: weave<br/>static + Node functions + cron]
  V --> SB[Supabase project<br/>Regen Commons / Platform<br/>schema weave + existing]
  AuthDNS[auth.regencommons.com] --> Bridge[Vercel Certified bridge]
  Bridge --> SB
  Index[Bounded project indexing job<br/>runtime validated before rollout] --> SB
  SB --> RS[Future consented notices<br/>mail.regencommons.com]
  RC[Vercel project: regencommons.com<br/>site + /admin] --> SB
  GH[GitHub: regen-commons/funding-commons<br/>app, api, research, tests] --> V
  GH2[GitHub: regen-commons/website<br/>site, admin, supabase migrations owner] --> RC
  GH -. migration PRs .-> GH2
  CX[Codex routines<br/>Monday discovery, Thursday freshness] --> GH
```

One migration owner and one shared Platform database. The Weave app, identity
bridge and website have separate deployment boundaries. `auth.regencommons.com`
is the bridge issuer, not a mail domain or the general matching API. Existing
Funding Commons hosting stays unchanged. The research routines keep producing
reviewed pull requests; nothing recurring merges or deploys on its own.

## 8. Architecture decisions (summary)

| ID | Decision | Alternatives considered | Consequence |
|---|---|---|---|
| A1 | Local-first AI with consented cloud fallback | Cloud-only; local-only | Works on weak devices without betraying the sovereignty story; needs a consent ledger and tiering |
| A2 | Shared Supabase project, dedicated `weave` schema, single migration owner | Separate project with member sync | Reuses Auth, members and stewards directly; requires migration discipline and namespacing |
| A3 | Steward desk extended, not duplicated | Admin on the subdomain | One login and release for stewards; the website repo must accept a UI module and SQL by pull request |
| A4 | Reuse the Funding Commons rubric for solo scores; add partner and partnership layers | New model-based ranker | Keeps the audited, explainable rubric; partnership logic is additive |
| A5 | Murmurations and KOI as exchange channels; knowledge commons by review bundle | Custom federation API | Standards-first interoperability; no direct writes to shared knowledge |
| A6 | Offerings and off-chain commitments now, pools later | Wallets at launch | Phase 3 anchoring without data migration; no web3 friction in intake |
| A7 | Places as references (One Earth bioregions, HydroBASINS, countries) | Free-text regions only | Enables watershed curation and regional pulses; requires licence confirmation and a geocoder |
| A8 | React PWA on the shared design system | Vanilla HTML like the main site | Worker-heavy conversational UI needs a component model; tokens and patterns keep the brand consistent |
| A9 | Saving is separate from sharing; private by default; stewards cannot read private initiatives. Superseded on 26 November 2026 by DL-155, which chose device-only until public, and revised by D48 on 28 November 2026 for a group project's team draft | Publish as one step; device-only until public | People can keep work across devices without going public; the privacy promise changes and needs row-level security tests |
| A10 | `DESIGN.md` as the single token source, with layered CSS and a pattern library in this repository | Copy tokens per app; a shared repository from day one | One source for all surfaces; moves to a shared repository when a second app needs more than tokens |
| A11 | Agent scaffolding before UI code | Add guidance as problems appear | Agents write most of the code, so instructions and checks are part of the foundation |
| A12 | Shared keyword/vector index with local assistance and optional refinement | Reanalyse every external project in every browser; call a cloud LLM for every match | Both owner-shared entries and public evidence participate; bounded downloads, explicit privacy paths and measured quality/latency precede UI polish |
