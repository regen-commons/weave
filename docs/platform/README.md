# Platform plan: Regen Commons Weave (working name)

Planning documents for growing Funding Commons into a platform where regenerative initiatives share who they are, their needs and their offers across eight forms of capital, and are matched to partners and funding opportunities, with bioregion and watershed curation. Drafted 2026-10-31 from the council sync of 30 October 2026, the bioregional knowledge commons planning call, the Regen Partnerships and Funding Hub doc, the Regen Commons website and steward desk, Coop, the Regen Knowledge Commons repository, and the research in the digest.

| Document | Read it for | Audience |
|---|---|---|
| [01 Proposal brief](01-proposal-brief.md) | The whole picture in ten minutes: why, what, name, phases, decisions requested | Council, partner networks, funders |
| [02 Business model canvas](02-business-model-canvas.md) | Segments, value, channels, resourcing, partners, costs, governance | Council, funders |
| [03 Logical architecture](03-logical-architecture.md) | Layers, containers, domain model, flows, decentralisation posture, decisions | Builders, technical partners (Metagov, Grassroots Economics) |
| [04 Product requirements](04-prd.md) | Users, experience, numbered requirements, phases, success measures, risks | Builders, stewards, designers |
| [05 Technical specification](05-technical-spec.md) | Stack, schema, auth, AI tiers and contracts, matching, places, email, interoperability, security, verification | Builders |
| [06 Research digest](06-research-digest.md) | The evidence and sources behind the decisions | Anyone checking a claim |
| [07 Agent scaffolding](07-agent-scaffolding.md) | The instructions, skills, rules and checks coding agents will use, and what we took from Green Goods and the Regen Commons site | Builders |
| [08 Saving and accounts](08-accounts-and-saving.md) | Certified-only sign-in, private saving, returning and recovery | Council, builders, designers |
| [09 Repository layout](09-repository-layout.md) | Where the live site, catalog, design system, app, API and migrations live, and what each move must keep working | Builders |
| [Interface prototype](prototype/README.md) | The click-through design of the first version, the decisions from its two reviews, and how to run it | Builders, designers, council |
| [Open decisions](open-decisions.md) | Everything unresolved, with a recommendation and an owner | Council, builders |

The design system has two homes: [DESIGN.md](../../DESIGN.md) at the repository root holds the tokens and interface principles, and the [design-system package](../../packages/design-system/README.md) holds the brand, voice, CSS and pattern library.

The current build follows the [matching implementation plan and UI handoff](05-technical-spec.md#76-build-plan-and-ui-handoff), revised 8 November 2026. It builds on [Certified sign-in and private saving](05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving), preserves owned needs/offers, adds explicit sharing and a public project evidence index, and records the matching checks to revisit before release. Use the [four first-visit and returning flows](08-accounts-and-saving.md#matching-on-a-first-or-returning-visit) and [remaining validation questions](open-decisions.md#matching-build-validation).

For the next design pass, start with the [Weave Preview simplification handoff](handover/03-weave-preview-simplification.md).

## Development and release branches

Start design and implementation branches from `develop`. Open pull requests
back into `develop` so the changes can be reviewed together. When the release
checks are ready, open a release pull request from `develop` into `main`.
`main` remains the production branch for Weave. The live Funding Commons site
still deploys from `codex/funding-commons-demo`, as the
[agent guide](../../AGENTS.md#essential-rules) explains.

The plan has six milestones: preserve entry identity; share and withdraw reviewed
entries; index external evidence; retrieve and explain both directions; connect
the app flow; prove quality, performance and hosted behavior. Both owner-confirmed
entries and inferred possibilities belong in Partners, with distinct evidence
labels. The detailed status, owning paths and acceptance criteria live only in
technical spec section 7.6. The authorized Platform migrations and Weave preview
deployment are complete with semantic retrieval disabled. The
[rollout record](05-technical-spec.md#hosted-preview-rollout-8-november) separates
hosted database and smoke checks from remaining real-user, corpus and quality gates.

Status: drafts for review. Nothing here is a council decision until recorded in [open decisions](open-decisions.md). The working name "Weave" is a recommendation; see the brief for alternatives and the collision check.

Related repository docs: [maintenance workflow](../maintenance.md) for the funder catalog, [matching and screening](../matching-screening.md) for the current rubric.

## Handover prompts

The [interface prototype prompt](handover/01-ui-design-first.md) and
[repository foundation prompt](handover/02-repo-scaffolding.md) are historical
2 November planning material. They no longer define the next work order. The
current design handoff starts from the preview code and
[the simplification brief](handover/03-weave-preview-simplification.md).
[Technical spec section 7.6](05-technical-spec.md#76-build-plan-and-ui-handoff)
records service contracts and remaining release checks. The earlier
external Artifact is a historical snapshot; these checked-in core documents own
the current architecture and product decisions.
