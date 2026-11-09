# Agent scaffolding plan

Status: proposal · Date: 2026-10-31
Companion documents: [PRD](04-prd.md) · [technical spec](05-technical-spec.md) · [DESIGN.md](../../DESIGN.md)

Build the agent scaffolding before any product UI, as the first slice of Phase 0. Most of this code will be written by coding agents, so the instructions, skills and checks they read are part of the product's foundation. The shape below follows the Green Goods workspace layout set out in the [repository layout](09-repository-layout.md), keeps the guides as small as the Regen Commons site's, and adds only the Green Goods guardrails this repository will actually use. Steps 1 to 5 of the build order were built in November 2026, and the [repository layout](09-repository-layout.md) records where each piece lives.

Before that, the repository had no `AGENTS.md`, `CLAUDE.md`, skills or hooks, and its only agent guidance was [docs/maintenance.md](../maintenance.md) for the Monday and Thursday catalog routines.

## What the existing repositories teach

| Pattern | Seen in | Decision | Why |
|---|---|---|---|
| Bun workspace over `packages/*`, with a guide, scripts and checks per package | Green Goods | Adopt | Each runtime gets its own rules and proof. Tooling choices are in the [repository layout](09-repository-layout.md) |
| Root `AGENTS.md` holds repository policy; `CLAUDE.md` only imports it | Green Goods, Regen Commons site, Knowledge Commons | Adopt | One authority for every agent; no drift between harnesses |
| Scoped `AGENTS.md` per surface, routed from a root table | Green Goods, site (`admin/`, `api/`, `supabase/`) | Adopt | Agents read only the rules for what they touch |
| Skills canonical in one folder, `.agents/skills` symlinked for Codex | Green Goods (`.claude/skills`), site (`skills/`) | Adopt, using `.claude/skills` | Both harnesses discover one copy |
| Personal skills referenced, never copied (`pragmatic-programming`, `domain-driven-design`, `modern-web-guidance`, `humanize-writing`) | Green Goods, site, Knowledge Commons | Adopt | Report the gap if absent; do not fork guidance |
| `plan`, `debug`, `review`, `ship` skills | Green Goods; site adapted them without its tooling | Adopt the site's adapted versions | Tested at this project's size |
| Root `DESIGN.md` with DesignMD front matter as the canonical token source, generated CSS and a token check | Green Goods, Coop | Adopt | Already built here: see [DESIGN.md](../../DESIGN.md) |
| Interface principles from the three books with page references and a five-minute review | Green Goods `DESIGN.md` | Adopt, rewritten for this product | Same books, a proven review habit |
| Design decision ledger (`DL-NNN`, locked then codified) | Green Goods | Adopt | Stops settled UI questions being reopened by each session |
| Path-scoped `.claude/rules/` | Green Goods, Coop | Adopt, four files | Rules load only when touching those paths |
| `.claude/context/` reference docs | Green Goods, Coop | Adopt a few | Product, testing and validation facts without bloating `AGENTS.md` |
| Hooks that block known-bad writes and flag critical surfaces | Green Goods (`.claude/settings.json`, `.codex/hooks`) | Adopt a small set | Prose rules drift; a blocked write does not |
| Shared command policy script for Claude and Codex | Green Goods `scripts/harness/command-policy.mjs` | Adopt | One policy for both harnesses |
| Guidance check for broken links, retired names and skill frontmatter | Green Goods `check-guidance-links.mjs` | Adopt a small version | Guidance is code and rots like code |
| Vocabulary and em-dash checks on user-facing strings | Green Goods | Adopt | The product's plain-language promise needs enforcement |
| Change criticality tiers | Green Goods | Adopt, new tiers below | Sets review depth by risk, not by size |
| Browser proof labels | Green Goods, site | Adopt | Fixture proof must never read as live proof |
| Credential-free fixture mode with provider env stripped | Site | Adopt | Agents can run everything without secrets |
| SQL policy suites on disposable Postgres in CI | Site | Adopt | Mocked authorization proves nothing |
| Agent evals with golden, noisy, low-signal and malicious fixtures | Coop | Adopt for the AI pipeline only | Extraction quality needs numbers |
| Plan folders (`.plans/{ideas,backlog,active}`) with hubs | Green Goods | Adopt lightly, only when a plan outgrows `docs/platform` | Code and CI must never depend on them |
| `dev-surfaces` and `.claude/launch.json` | Green Goods, Coop | Adopt `launch.json` only | Preview servers start the same way every time |
| Check selector with intents and receipts (`check --plan --intent`) | Green Goods | Skip for now | Worth it when the suite is slow; a table in `AGENTS.md` is enough today |
| turbo, `ci-gate.yml` with path-filtered workflows, Biome, oxlint, knip | Green Goods | Skip for now | The whole suite runs in about 20 seconds. Each has a trigger for revisiting in the [repository layout](09-repository-layout.md#what-we-skip-and-when-to-revisit) |
| Agent teams, Codex lanes, Linear routing, QA app, Plan Hub closeout | Green Goods | Skip | Sized for a much larger project |
| Agent definitions and skill registries | Coop | Skip | Skill frontmatter is enough |
| Storybook | Green Goods | Defer to the first React components | The static pattern library covers Phase 0 |

## Target layout

```text
AGENTS.md                         shared policy, routing table, checks
CLAUDE.md                         "@AGENTS.md" and nothing else
DESIGN.md                         canonical tokens, rationale, interface principles
research/AGENTS.md                catalog evidence and preservation rules
packages/app/AGENTS.md            PWA: routes, states, offline, browser proof
packages/api/AGENTS.md            Vercel functions: consent, secrets, validation
packages/design-system/AGENTS.md  tokens, patterns, how to add a component
supabase/AGENTS.md                schema, RLS, commands, one migration owner
.claude/
  settings.json                   hooks below
  launch.json                     catalog, pattern library, app preview servers
  rules/frontend-design.md        paths: packages/app/**, packages/design-system/**
  rules/typescript.md             paths: **/*.{ts,tsx}
  rules/sql.md                    paths: supabase/**
  rules/ai.md                     paths: packages/app/src/ai/**, packages/api/src/ai/**
  context/product.md              users, vocabulary, lifecycle, non-goals
  context/testing.md              what proof each kind of change needs
  context/validation.md           the check ladder and evidence labels
  skills/                         canonical skills, list below
.agents/skills -> ../.claude/skills
.codex/
  config.toml                     hooks on, provider keys kept out of the shell, sandbox network left as set
  hooks.json                      the same scripts in scripts/harness/ as the Claude hooks
.github/workflows/
  validate.yml                    existing build and test job, unchanged
  design.yml                      bun run design:check
  guidance.yml                    bun run guidance:check and the hook tests
scripts/harness/                  command, edit, compaction and stop policies, shared by both harnesses
scripts/quality/check-guidance.mjs
```

Each guide is written when its folder first exists. The [repository layout](09-repository-layout.md) places the packages and says why the live site and catalog stay at the root.

`docs/platform/` keeps product and architecture decisions, and [open-decisions.md](open-decisions.md) stays the single list of what is unresolved. A `.plans/active/<name>/` folder appears only when one piece of work needs more execution state than a pull request can hold.

## What goes in the root `AGENTS.md`

Keep it under about 150 lines. It owns:

- **Where to work.** A table routing each surface to its scoped guide.
- **Essential rules.** Bun 1.4.2 and Node 24; `bun run test`, never `bun test`; dependencies change only with explicit approval; public repository, so no secrets, contact details or private call content; the Regen Commons website checkout has been seen on a stale branch, so read `origin/main` when using it as a reference.
- **Scope.** An answer, audit or review request does not authorize edits. Implementation permission does not imply permission to deploy, merge or publish.
- **Shared checkout safety.** Inspect `git status` first, stage only the task's paths, never `git add -A`, never switch branches under another session.
- **Domain language.** Initiative, need, offer, form of capital, lens, opportunity, match, recipe, place, pulse, member, steward. Point to the owning definitions; do not restate them.
- **Skills and read-when-relevant routing.** A short table, as in the site's guide.
- **Checks.** The ladder below.
- **Writing.** `humanize-writing` for prose, [VOICE.md](../../packages/design-system/brand/VOICE.md) for product copy.

It also records the facts that trip agents today. The local vector files are ignored build output, so `bun run build` must run before `bun run test` after catalog changes, or the vector tests fail on stale files. The import test used to compare a clock-dependent import with the committed catalog and failed on the day after a deadline passed; it now reruns the import as of the catalog's `compiledAt`, so a change to the importer has to keep `--as-of` working.

## Skills

| Skill | Use when | Starts from | Phase |
|---|---|---|---|
| `plan` | Multi-step work or architecture options | Site's `plan` | Scaffolding |
| `debug` | A bug report, failing check or unexpected behavior | Site's `debug` | Scaffolding |
| `review` | Reviewing a diff, branch or PR | Site's `review`, with the design checklist added | Scaffolding |
| `ship` | Commit, push or draft PR | Site's `ship` | Scaffolding |
| `design` | Any screen, component, CSS or copy change | New; see below | Scaffolding |
| `catalog-research` | Monday discovery and Thursday freshness | Moves [docs/maintenance.md](../maintenance.md) into a skill; saved routine prompts then point to it | Scaffolding |
| `data-change` | Migrations, RLS, steward commands | Site's `supabase/AGENTS.md` plus migration ownership rules | Phase 0 |
| `intake-ai` | Prompts, extraction contracts, model tiers, consent flows | New, using Coop's method | Phase 1 |
| `matching` | Scoring weights, reasons, `engine_version` | New, built on [docs/matching-screening.md](../matching-screening.md) | Phase 1 |
| `usability-test` | Running the monthly test and turning findings into work | New; plan in [packages/design-system/principles/usability-testing.md](../../packages/design-system/principles/usability-testing.md) | Phase 1 |
| `interop` | Murmurations, KOI and Knowledge Commons sharing, retraction | New | Phase 2 |

The `design` skill carries the rule that UI work follows the three books. It reads [DESIGN.md](../../DESIGN.md) and the [notes on each book](../../packages/design-system/principles/README.md), and it requires:

1. **Start from the feature, not the layout.** Design the smallest useful version first, with real and worst-case content.
2. **Find the existing pattern.** Check the [component inventory](../../packages/design-system/COMPONENTS.md) and reuse it, or record why not.
3. **Place it.** Name its level (atom, molecule, organism, template, page) and add it to the pattern library in the same change.
4. **Use only tokens.** A value outside the scales is drift.
5. **Design every state.** Empty, loading, partial, error, offline, long content and first use.
6. **Run the [five-minute review](../../DESIGN.md#how-we-follow-them).** Report the result in the handoff.
7. **Record decisions.** Settled questions go in the [decision log](../../packages/design-system/decision-log.md).

Skills follow the site's frontmatter (`name`, `description`), stay under about 300 lines and move detail into linked files. They never grant authority: a skill's existence does not permit publishing, deploying or messaging.

## Rules, context and hooks

Path-scoped rules are short pointers plus the few mistakes agents make most: raw hex values, new one-off components, color as the only signal, hover-only actions, unlabeled inputs and invented vocabulary.

Hooks, in both `.claude/settings.json` and `.codex/hooks`:

| Hook | Behavior |
|---|---|
| Edit of `.env*` | Block |
| Edit of generated token files | Block, with a pointer to `DESIGN.md` |
| Edit of `dist/data/funders.json` or other imported catalog output | Block, with a pointer to the importer |
| Edit under auth, consent, cloud AI, RLS or retraction paths | Add a critical-surface notice: read every touched line and name the failure paths |
| Edit of manifests, lockfiles, workflows or agent config | Add a notice: keep scope tight and state validation |
| Shell commands | Shared policy script: `bun test`, `git add -A`, force push and destructive resets stop for confirmation |
| Compaction | Reprint the essential rules |
| Stop with changed files | Ask for the validation that matches the change |

## Change criticality

| Tier | Surfaces | Required depth |
|---|---|---|
| Critical | Auth and sessions, RLS and steward commands, consent and AI ledger, cloud AI proxy, retraction and sharing, email recipients, KOI signing | Read every touched line; SQL or integration proof; explicit failure paths; a second review before merge |
| Sensitive | Intake flow, matching scores and reasons, catalog import, membership handoff, pulse composition | Inspect failure and recovery; fixtures; rendered proof |
| Routine | Copy, styling within tokens, docs, tests, pattern library | Focused proof; the five-minute review for UI |

## Check ladder and evidence

| When | Run |
|---|---|
| Any change | The focused test for the behavior, and `git diff --check` |
| Tokens or design system | `bun run design:check` |
| Guidance, skills or rules | `bun run guidance:check` |
| Catalog or matching | `bun run research:import` when inputs changed, `bun run build`, `bun run test` |
| UI | Rendered check at 360 px and 1280 px, both themes, keyboard, 200 percent text, reduced motion; the five-minute review |
| Schema or policies | SQL suites on a disposable Postgres |
| AI prompts or contracts | Extraction evals per tier |
| Before push | `bun run build`, `bun run test`, `git diff --exit-code`, `git diff --check` (what CI runs) |

Every piece of rendered proof names its class: `fixture`, `local Supabase`, `preview` or `production`, plus the browser. Fixture proof never counts as live proof.

## Build order

Each step is one small pull request with its own check. The [repository layout](09-repository-layout.md#build-order) gives each step's contents in full.

1. **Workspace and foundation.** Bun workspaces, `AGENTS.md`, `CLAUDE.md`, `research/AGENTS.md`, `.claude/skills` with `plan`, `debug`, `review`, `ship`, the `.agents/skills` symlink. Check: a fresh agent session can answer where to work and which check to run without reading anything else, and `bun run build && bun run test` still passes.
2. **Design-system package.** Move `design-system/` to `packages/design-system/`, then add the `design` skill, `.claude/rules/frontend-design.md`, the package's `AGENTS.md`, and `design:check` in CI. Check: the design-system tests pass with only path changes, and a raw hex value in the package's CSS fails them.
3. **Development flow and guardrails.** `.claude/launch.json`, hooks, command policy, `scripts/quality/check-guidance.mjs`. Check: each blocked action fails in a test; links and frontmatter are validated in CI.
4. **Catalog skill.** Move the maintenance guide into `catalog-research` once #9 has merged or closed, and update the two saved Codex routines. Check: the next Monday run follows the skill with no behavior change.
5. **App shell and API.** `packages/app` and `packages/api` with their guides and a health check. The `supabase/` guide and `data-change` arrive with the first migration.
6. **AI and matching.** `intake-ai`, `matching` and the eval fixtures with Phase 1.

Steps 1 to 4 fit before the Phase 0 UI work and should be small, because the site and Green Goods versions already exist to adapt.

## What this plan leaves out on purpose

Agent teams, Codex lanes, Linear routing rules, a QA recording app, selector tooling, receipts, nightly CI and skill registries. Add one only when a repeated, observed problem justifies it, and record the reason in the pull request.
