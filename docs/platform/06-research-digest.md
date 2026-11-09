# Research digest

Status: working notes · Date: 2026-10-31
What this is: the evidence behind the [proposal brief](01-proposal-brief.md), [canvas](02-business-model-canvas.md), [architecture](03-logical-architecture.md), [PRD](04-prd.md) and [technical spec](05-technical-spec.md), condensed by topic with sources. Three longer research reports with full source lists sit in [`research/`](research/): [ecosystem, capitals and commitment pooling](research/ecosystem-capitals-pooling.md), [KOI, bioregion data and funding](research/koi-bioregions-funding.md), and [local AI and platform stack](research/local-ai-and-stack.md). Facts were checked on 31 October 2026 unless stated. Inferences are marked.

## 1. What the network asked for

Sources: Regen Coordination council sync and follow-on conversation, 30 October 2026 (notes and transcript); bioregional knowledge commons planning call, 30 October 2026; Regen Partnerships and Funding Hub doc, 24 September 2026 with October additions.

Agreed or stated by the people involved:

- Build an initiatives database into the funding site where people add their own projects (name, what they work on, what funding they look for); do not scrape, because stale data misrepresents people.
- Show, next to a fund, the projects you could partner with; go further and surface who should apply together (for example a tooling group, a research group and a place-based community toward a regional grant).
- Each initiative states offers and needs; funding opportunities are the base around which diverse ingredients assemble ("recipes", from the commitment-pooling game).
- Curate by bioregion and watershed as containers for place-based problems, with routing of commitments and knowledge across them; mix art, culture, community, environment, finance, technology and research; keep a multivalue lens rather than nature plus finance only; do not sort initiatives into single-issue silos or capitulate to measurement-first framing.
- Make the matchmaking interoperable with Cosmo-Local Credit later; do not integrate deeply at first. A "Regen reservoir" pool on Cosmo-Local Credit was floated as a separate experiment.
- Do not build a separate silo of offers and requests; cross-post and link to existing activity (Bloom's 17 November offers-and-needs session uses the Post Growth Institute protocol).
- Present the database at the Community Spotlight on 5 November 2026 and post on the Hub once the subdomain is agreed; house it under Regen Commons on a subdomain with Regen Commons branding.
- Pair static tooling with live moments: regional calls, challenge cohorts that apply together, Hub summaries after calls.
- From the planning call: aim for a simple project intake and multi-capital matching interface within two weeks; a Mozilla local-AI grant proposal with Metagov and KOI; the knowledge commons work needs technical builders.

The hub doc's structure (Initiatives with offers and needs tagged by capital, Opportunities, Partnerships Forming with statuses Forming, Drafting, Submitted, Funded, Not this time, Resources and Events) maps directly onto Initiatives, Opportunities, Recipes and Places in the PRD.

## 2. Funding Commons today

Source: repository `regen-commons/funding-commons` and the live site.

- Catalog: 699 funders, 768 program and overview documents, 1,588 distinct official source URLs; 593 original Fito Network records plus researched additions; every record has a research disposition; eligibility rules (135 assertions across 109 programs) and program conditions are source-backed.
- Matching: local embeddings with `mixedbread-ai/mxbai-embed-xsmall-v1` (256 dimensions, q8, about 24 MB) through Transformers.js 4.2.0 and ONNX Runtime Web on single-threaded WebAssembly; a thematic-fit rubric (shared specific terms or cosine anchors), a readiness label and a research-priority score with documented caps; all in `dist/matching.mjs`.
- Workspace: browser-local projects, favourites and notes; no accounts or backend; CSV and JSON export; `?fund=<id>` deep links.
- Maintenance: Monday discovery and Thursday freshness routines produce reviewed draft pull requests; nothing recurring merges or deploys.
- Stack: static site on Vercel, Bun 1.4.2, Node 24, esbuild; 95 to 129 tests across releases; public since 16 October 2026.

## 3. The Regen Commons substrate

Source: repository `regen-commons/website` at `origin/main` (34aca0c, 30 October 2026). A detailed survey was produced for this plan and is held privately as working notes; ask the maintainer for it.

- Supabase project "Regen Commons / Website" (Postgres 17, us-east-1) holds `members` (individual or organisation; publication draft, published, hidden; standing unconfirmed, active, paused, ended; revisions), `applications` (private answers as JSON), `affiliations`, `contributions` (with free-text `capital_forms`), `seeds`, `feedback`, audit tables, and `private.steward_roles`. All steward writes are revision-checked, idempotent RPC commands behind `private.is_active_steward()`, which also checks for a live Auth session.
- Auth: Supabase email one-time code, verified server-side for the steward desk; eight-digit codes, one-hour expiry; SMTP through Resend from `signin@auth.regencommons.com`; the template is shared project-wide and worded for stewards. There is no member login and `members` has no link to `auth.users`.
- Email: application receipts, decision emails and steward alerts through the Resend REST API from `membership@regencommons.com`, with an outbox, idempotency keys, fixed failure codes and a three-attempt retry rule.
- Steward desk at `/admin`: applications, members, seeds, contributions, email delivery; vanilla JavaScript, strict CSP, hash routes, a plug-in seam used by the membership module.
- Design system: 72 lines of tokens (dark default, light via `data-theme`), three self-hosted fonts (Fraunces, Source Serif 4, Space Grotesk), a mycelium logo canvas, paper grain, organic blob buttons, stages of growth (Seed, Sprout, Flowering, Tree), the eight forms of capital with two-letter glyphs, seven values. Component CSS is not packaged and is desktop-first; the desk re-implemented components on the tokens.
- Guidance in the repository: one Supabase project can hold all areas in related tables; member self-service was out of scope for the website; a subdomain for the admin was analysed and not chosen.

## 4. Coop and the Regen Knowledge Commons

Sources: `greenpill-dev-guild/coop` (AGPL-3.0-only, last commit 13 June 2026) and `regen-coordination/knowledge-commons` (no licence file yet).

- Coop's local AI stack: Transformers.js 4.2.0 (Qwen2.5-0.5B-Instruct q4, Whisper tiny English, Gemma 4 E2B in a sandboxed iframe), WebLLM 0.2.82 (Qwen2 0.5B MLC), Chrome Prompt API behind a flag; provider tiers heuristic, transformers, webllm, gemma4, chrome-prompt-api with fallback order; cold start answers with heuristics while a model warms; JSON extraction, repair and retry with Zod issues; 19 registered skills including opportunity extraction, grant fit scoring and ecosystem entity extraction with `bioregion` and `watershed` entity kinds; review-before-share with provenance; Yjs sync; passkeys. No OCR, no PDF parsing, no cloud fallback.
- Reuse verdict: patterns yes (tiering, repair loop, review gate, Whisper module of about 110 lines); packages no (private, extension-shaped, heavy dependency graph); importing code makes the platform AGPL, which is the proposed licence anyway.
- Knowledge Commons: eleven proposed classes (Article, Playbook, Pattern, CaseStudy, Organization, Person, Tool, FundingMechanism, Place, Source, Claim) on one Knowledge Object base; only Article, Source and Claim are executable; relations are proposed, not implemented; `capitalLenses` is reserved and unpinned; Geo is the proposed accepted-knowledge layer (testnet space, submission disabled); review runs through GitHub pull requests with two human approvals. There is no Opportunity, Need or Offer class; FundingMechanism models allocation design, not open calls.
- Integration today: `POST /v1/validate` with a self-built envelope (Discourse-shaped captures) or a pull request under `reports/ingestion`; the service is not deployed. Read access: committed object Markdown and the Geo GraphQL testnet. Hence the plan's "export review bundles, never write directly".

## 5. Forms of capital and offers-and-needs practice

- The Eight Forms of Capital (Ethan Roland, now Soloviev, and Gregory Landua; Permaculture Magazine 68, 2011; book Regenerative Enterprise, 2013): social, material, financial, living, intellectual, experiential, spiritual, cultural; currencies per form; pools and flows (intra-capital and inter-capital); "nurture capitals" (social, living, spiritual, cultural) from the book and later commentary. Canonical text republished at ethansoloviev.com/8-forms-of-capital.
- No tool found tags offers or needs by the eight capitals (checked Hylo, the Offers and Needs Market, Kinship Earth, Regen Network, Murmurations). Regen Commons already uses the eight on contributions.
- Offers and Needs Market (Post Growth Institute, 2011): a two-hour facilitated process; six categories (passions, knowledge, skills, resources, opportunities, needs); offers round, break, needs round, combined round in groups of six to eight; exchanges arranged as money, barter, bargaining or gift; facilitator training at USD 400; no software. The platform's exchange terms vocabulary (gift, exchange, paid, commitment, open) follows this.
- Hylo (Terran Collective, Apache 2.0, free core, Pro about USD 60 per group per month planned, "take your data"): post types Discussion, Request, Offer, Resource, Project, Event, Proposal; bioregional vision with user-defined regions; partner API by request with OAuth 2.0 and GraphQL. Treat as an interop partner and link target, not a duplicate.

## 6. Commitment pooling and Cosmo-Local Credit

- Papers: Ruddick, "Commitment Pooling: An Economic Protocol Inspired by Ancestral Wisdom", IJCCR 27 (2023); Ruddick, "Proto-Social Infrastructure and Stewardship of Commitment Pooling", IJCCR 30 (March 2026).
- Protocol: curation (admit vouchers), valuation (relative price index, four decimals, default parity), limitation (balance caps), exchange (swap, fee, event). Commitment: a party's promise of future delivery; voucher: a token or record representing that commitment under published terms; offering: a catalog record for goods or services; pool steward publishes rules.
- CLC means Cosmo-Local Credit: Grassroots Economics' 2026 successor to Sarafu Network (Celo; contracts SwapPool, TokenRegistry, Limiter, quoters; AGPL-3.0; docs CC BY-SA; terms v1.1 effective 1 October 2026). Wallets: the app uses external wallets today; a non-custodial Sarafu Wallet (EIP-7702, passkeys, USSD, QR, NFC) was announced September 2025; custodial key management (clc-core, eth-custodial) and paper wallets exist. Grassroots Economics describes a federation of Circles, commitment pools, CLC routing and Gnosis settlement (August 2026).
- Design consequence used in the spec: record offerings and off-chain commitments first (states proposed, accepted, fulfilled, discharged), anchor later through a steward-run custodial signer or members' wallets; publish needs and offers with the Murmurations offers-and-wants schema from day one; on-chain records never prove fulfilment.

## 7. Interoperability

- Murmurations: profiles are JSON files hosted by their owners and submitted to an index; aggregators poll indexes; schemas include organisations and an offers-and-wants schema (`exchange_type`, `item_type`, `transaction_type`, `geographic_scope`, `tags`, `geolocation`, `expires_at`); software GPLv3; volunteer-led and donation-funded; Hylo publishes groups to it.
- KOI: Knowledge Organization Infrastructure (Metagov, Dynamical Systems Group formerly BlockScience, RMIT). RID means Reference Identifier; ORN means Object Reference Name (`orn:<namespace>:<reference>`). Packages `koi-net` 2.1.2 (August 2026) and `rid-lib` 3.3.0 (June 2026), MIT, Python only; protocol draft v1.0: full nodes serve five POST endpoints, partial nodes are client-only and suited to browser apps; events NEW, UPDATE, FORGET; manifests (`rid`, `timestamp`, `sha256_hash` over RFC 8785 canonical JSON) and bundles; ECDSA P-256 signed envelopes; subscriber-initiated edge negotiation. Telescope is the consent workflow (react, author approves, approved items flow to researchers; "labels travel, material stays"). Regen deployments: the Regen KOI MCP by Gaia AI (15,000 documents, Postgres with pgvector, Apache AGE, Jena Fuseki) and a Regen Knowledge Commons roadmap naming a Regen Commons DUNA as future steward. Practical minimum for this platform: mint ORNs and hashes now; run a partial node later; a full node only when the spec stabilises.
- Bioregional financing facilities (BioFi Project, fiscally sponsored by the Buckminster Fuller Institute): a design and practice community with facilities in development (Hudson Valley and Berkshires, Salmon Nation, Amazon Sacred Headwaters, Southern Blue Ridge); a community of practice of about 1,000; co-sponsored the GG22 BioFi Pathfinders round with Regen Coordination. Natural counterparties for regional needs and offers.

## 8. Bioregion and watershed data

| Dataset | Units | Licence | Use in the plan |
|---|---|---|---|
| One Earth Bioregions 2023 | 185 bioregions, 52 subrealms, 14 realms; shapefile by request; attribute CSV on Datahub | CC BY-NC 4.0 with citation | Primary bioregion layer; keeps the platform non-commercial or needs a licence |
| RESOLVE Ecoregions 2017 | 846 ecoregions, 14 biomes, 8 realms; about 150 MB shapefile | CC BY 4.0 | Finer unit and licence-safe fallback |
| HydroSHEDS HydroBASINS v1.c | Pfafstetter levels 1 to 12; nine regional files; no names | WWF HydroSHEDS v1 licence: use inside derivative works, no standalone redistribution, notice and citations required | Basins at levels 3, 5, 6, 7 |
| BasinATLAS (HydroATLAS) | same basins with 281 attributes; 2.5 to 4 GB | CC BY 4.0 | Alternative basin source when a clean CC BY basis is wanted |
| Natural Earth | countries, admin-1 | Public domain | Admin fallback |
| GADM | admin 0 to 5 | Non-commercial, no redistribution | Not used |
| USGS WBD, Canada SDAC, Copernicus EU-Hydro | national watersheds | Public domain, OGL, Copernicus open | Optional national precision |
| Native Land Digital | territories, languages, treaties | Keyed API under a 2025 treaty: non-commercial only, no storage or redistribution, credit and disclaimer | Live acknowledgement layer only |
| Nominatim | geocoding on OpenStreetMap | ODbL; one request per second, no autocomplete, caching required | Server-side geocoding with caching |

No public API turns a coordinate into a HydroBASINS identifier globally; One Earth's Navigator is a browser tool without an API. Hence PostGIS in Supabase with subdivided polygons, plus a simplified in-browser layer for drafts. Basin names come from OpenStreetMap river names, Wikidata (property P4614) and community labelling.

## 9. Local AI, browsers and devices

- Transformers.js 4.3.2 (28 October 2026): WebGPU runtime rewritten; WebGPU enabled on Safari 26 and later; `ModelRegistry` reports download sizes and cache state; `@huggingface/transformers-structured-output` 4.3.2 constrains decoding to a JSON Schema or regex; models cached in the Cache API per origin.
- Measured model sizes (q4f16 unless stated): Qwen3-0.6B 570 MB; Qwen3-1.7B 1.43 GB; Gemma 3 1B 764 MB; SmolLM3-3B 2.1 GB; Gemma 4 E2B about 3.1 GB text-only; SmolVLM-256M about 190 MB; Florence-2-base about 224 MB; Whisper base about 77 MB int8 or 150 MB fp16; Whisper large-v3-turbo about 0.56 GB all q4f16.
- WebLLM 0.2.87 (30 October 2026): WebGPU only, XGrammar JSON schema constraints, Gemma 4 E2B support; desktop only in practice (iPhone tests fail or reload the tab).
- Chrome Prompt API with Gemini Nano: Chrome 148 and later on desktop (May 2026); requires 22 GB free disk and more than 4 GB VRAM or 16 GB RAM; `responseConstraint` takes a JSON Schema; Mozilla and WebKit positions are negative; Edge previews the same API with Phi-4-mini. LiteRT-LM Web API 0.19.0 is an early preview, text only. Apple exposes no web API for its on-device model.
- WebGPU: Safari 26 on iOS, iPadOS and macOS (15 September 2025) on by default; Firefox on Windows since 141 and macOS since 147; Chrome Android since 121. Mobile Safari offers roughly 300 MB reliably to WebAssembly and kills tabs around 1 GB of page memory; 2019-class iPhones advertise about 716 MB maximum buffer size. `navigator.deviceMemory` is Chromium only. Safari deletes script-writable storage after seven days without interaction unless the app is installed to the home screen.
- Speech: Whisper through Transformers.js is multilingual and on-device; Chrome's `SpeechRecognition.available({ processLocally: true })` exists from Chrome 139 behind experimental status; Safari's speech recognition does not document on-device processing. MediaRecorder on Safari records AAC until 18.3 and Opus from 18.4; capture with AudioWorklet at 16 kHz for Whisper.
- Documents: pdfjs-dist 6.4 (Apache-2.0), mammoth 1.13 (BSD), SheetJS CE 0.20.3 from the vendor tarball (the npm package is frozen at 0.18.5), tesseract.js 7 (CPU only), pptx parsers or OOXML unzip; jsonrepair 3.15 for truncated JSON.
- Cloud fallback facts: Anthropic does not retain prompts and outputs by default except for Covered Models; zero data retention is per organisation and disables CORS, so calls go through a server; `claude-haiku-5-5` costs USD 0.10 per million input tokens and 0.50 per million output tokens up to 100k context, with structured outputs; `inference_geo` can pin the region. Cloudflare Workers AI prices Gemma 4 26B-A4B at USD 0.10 and 0.30 per million tokens and Whisper at USD 0.0005 per audio minute, with no training on customer content. Hetzner GPU servers start at about EUR 214 per month for a 24 GB card. vLLM and Ollama support JSON Schema constrained output for self-hosting.

## 10. Platform services

- Supabase Auth: magic link and OTP share one flow; the template decides which is sent (`{{ .Token }}` for a code); `verifyOtp` with `type: 'email'`; default one-hour expiry; one send per user per 60 seconds; the Send Email hook replaces built-in sending and is the documented route for branded or localised templates (Standard Webhooks signature); PKCE magic links break in mail clients that prefetch links or open a different browser, which is why codes are recommended. Rate limits per IP: 30 per five minutes on OTP and verify endpoints.
- Supabase platform: pgvector with HNSW; hybrid search with reciprocal rank fusion; PostGIS in the `extensions` schema; pg_cron with pg_net or scheduled Edge Functions; Storage with RLS (50 MB per file on Free); Free tier pauses after a week idle and allows two projects; Pro is USD 25 per month plus usage with branching per pull request; migrations through the CLI with one owner per project.
- Resend: batch of 100 per call with idempotency keys; Broadcasts and Audiences for opt-in lists; inbound email by MX; Free 3,000 per month and 100 per day; Pro USD 20 for 50,000; subdomain senders recommended; one-click unsubscribe headers; region picker affects sending location, account data stays in the US.
- Vercel: cron on all plans (Hobby once per day with hour precision, Pro per minute); functions 300 s on Hobby, up to 800 s on Pro; 4.5 MB request bodies, so uploads go directly to storage; Edge runtime deprecated in favour of Node; the free Hobby plan is for personal, non-commercial use only; subdomain by CNAME with a `_vercel` TXT record at the apex when the apex sits in another team; certificates automatic.
- Matching references: reciprocal recommender surveys (Palomares et al. 2021) on fusing two one-way scores; team formation (Lappas et al. 2009) for covering a skill set; fairness and exposure control in matching markets (RecSys 2024); hybrid rule-plus-embedding grant matching in practice.

## 11. Funding and sustainability options (as of 31 October 2026)

| Programme | Amount | Timing | Fit for this platform |
|---|---|---|---|
| Mozilla Human-Scale AI incubator | USD 300k for 12 months, extendable to 500k over three years | Due 20 November 2026, 11:59 pm Pacific; cohort April 2027 | High: small, intentional, tailored AI already in use; requires working technology and a nonprofit or fiscal sponsor able to receive USD |
| NLnet general call (Restack, open call) | EUR 5k to 50k | 3 November 2026 then paused; next window expected 2027; the NGI Zero Commons Fund closed June 2026 | Medium: frame as an open protocol component (TypeScript KOI and Murmurations client) with a European dimension |
| Climate Collective AI x Nature accelerator | catalytic funding, mentoring | No 2026 call found | Medium |
| Gitcoin, Octant, Giveth rounds | tens of thousands per round at most for regen | GG25 pilot after Gitcoin's reset; Octant epochs roughly quarterly; Giveth ad hoc | Medium: visibility and donations; consider running a bioregional round |
| Humanity AI "Communities Leading on AI" | USD 75k to 1M | Closed 21 October 2026; next call 2027 | Medium with a US fiscal sponsor |
| Ma Earth Round 4 | USD 2k to 15k per project; 500k pool | Opens 22 April 2027 | Low as funder, high as a channel: list the round, onboard initiatives |
| Sovereign Tech Fund | over EUR 50k | Rolling | Low unless maintaining a widely used dependency |
| Ethereum Foundation ESP | sized to proposal, paid in ETH | Rolling | Low without an Ethereum thesis |
| Regen Foundation, Celo Public Goods, Optimism Retro Funding | small or paused | Various | Low in 2027 |
| Open Source Collective (fiscal host) | 10 percent of incoming funds | Anytime | High as the legal and financial rail if Regen Commons has no entity |

Requirements that shape the architecture: an OSI licence; working technology with AI at the core and user control of data for Mozilla; pluggable model choice; a legal entity or fiscal sponsor; the non-commercial terms of One Earth and Native Land Digital, which favour paid stewardship services over paid platform tiers unless layers are swapped for CC BY sources.

## 12. Name collision check

Checked against regenerative, web3 and commons usage. No notable collision: Tend, Connect, Hearth (Kinship runs "Hearth Gatherings" in an adjacent circle), Compass, Commons Connect, Reciprocity, Mycorrhiza. Collisions: Network (Regen Network, Bloom Network, Greenpill Network), Weave (WeaveDB, Bioregional Weaving Labs, The Weaving Lab), Guild (Guild.xyz, Greenpill Dev Guild), Confluence (Atlassian, Confluence Philanthropy), Mycelium (MycoFi and others), Hub (Regen Hub, Regen Impact Hub, Regen Coordination hub), Atlas (Optimism Atlas, Regen Atlas, Octant Atlas), Watershed (Watershed Technology), Loom (Loom, Loom Network), Kin (Kin token, The Kin DAO, Kinship Earth), Bloom, Pollinate (Pollination, Regeneration Pollination), Mesh, Nexus, Grove (Grove, formerly Pocket Network), Offers (Offers and Needs Market, Murmurations offers and wants), Alliance.

## 13. Interface books and design tooling

UI work follows three books, held by the team as licensed PDFs and not committed. Notes in our own words, with page references, are in [packages/design-system/principles](../../packages/design-system/principles/README.md).

- Steve Krug, *Don't Make Me Think, Revisited*, third edition, 2014. Source of the plain-label rule, the trunk test, the saving approach and the usability testing plan. It has no data on sign-up timing, so that recommendation is a hypothesis.
- Adam Wathan and Steve Schoger, *Refactoring UI*. Source of the scales, the action hierarchy and the depth rules. It shaped the colour ramps pinned to the website's values.
- Brad Frost, *Atomic Design*, 2016. Source of the pattern levels, lifecycle, naming test and governance. It predates design tokens, so those are our own extension.

Format: Google's DesignMD (`@google/design.md` 0.4.0), also used by Green Goods and Coop. Contrast checks found that the website's `--ink-dim` token and its light-theme gold, amber, circuit, teal and sage fail as small text, and that copper hairlines measure about 1.3:1. The system corrects these for products without changing any website value.

## 14. Gaps and things to verify before building

- One Earth shapefile request and licence confirmation for a non-commercial commons; BasinATLAS as the CC BY alternative.
- Native Land Digital written permission if territory names are ever cached on records.
- The Zero Data Retention arrangement for the Anthropic organisation, or a decision to use Cloudflare Workers AI as the default fallback.
- Chrome Prompt API behaviour on real desktop fleets and Whisper base quality for Portuguese, Spanish and Yoruba speakers on mid-range Android devices.
- Which KOI node offers first contact; registration of `orn:regencommons.*` types.
- Resend subdomain verification for `mail.regencommons.com` and DMARC on the root.
- Who administers DNS for regencommons.com.
- The Knowledge Commons licence and whether Opportunity, Need and Offer classes will be accepted.
