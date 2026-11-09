# Funding Commons and Weave: agent guide

This repository runs the live Funding Commons site and its funder catalog, and is
growing into Weave, the first version of the Regen Commons platform. This file holds
the rules every coding agent follows. Read the scoped guide for a surface before
editing it; its rules refine these. Code and checked-in configuration own
implementation facts, and the [platform plan](docs/platform/README.md) owns product
decisions.

## Where to work

| Surface | Paths | Guide |
|---|---|---|
| Live site and funder catalog | `research/`, catalog `scripts/`, `tests/`, `dist/`, `serve.mjs`, `src/` | [research/AGENTS.md](research/AGENTS.md) |
| Design system (`@regen-commons/design-system`) | `DESIGN.md`, `packages/design-system/` | [packages/design-system/AGENTS.md](packages/design-system/AGENTS.md) |
| Weave app (`@weave/app`): React PWA, root of the Weave Vercel project | `packages/app/` | [packages/app/AGENTS.md](packages/app/AGENTS.md) |
| Weave API (`@weave/api`): Vercel function handlers | `packages/api/` | [packages/api/AGENTS.md](packages/api/AGENTS.md) |
| Platform plan | `docs/platform/` | [docs/platform/README.md](docs/platform/README.md) |
| Agent guidance and skills | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/` | This file |

New code goes into workspace packages under `packages/`, with `supabase/` at the
root, as the [repository layout](docs/platform/09-repository-layout.md) sets out.
Add a row here when a package or scoped guide arrives, not before.

## Essential rules

- Use Bun 1.4.2 and Node 24. Run tests with `bun run test`, never `bun test`: the
  suites use `node --test`, and Bun's own runner reads them differently.
- Install from the committed lockfile. Add or upgrade a dependency only with explicit
  approval for the task, commit `bun.lock` with it, and name it and its reason in the
  pull request.
- This repository is public. Keep secrets, `.env` files, contact details, private
  captures and private call content out of commits, logs and pull requests.
- Never hand-edit generated files. `packages/design-system/tokens/` comes from
  `DESIGN.md` through `bun run design:tokens`, and most of `dist/data/` comes from the
  importer and the build, as the catalog guide lists. Commit regenerated output with
  the inputs that changed it; CI fails when a build changes tracked files.
- `main` deploys the live site through Vercel from the root `vercel.json`. Do not
  change deployment configuration, the Ignored Build Step or DNS as part of other
  work.
- When you use the Regen Commons website repository as a reference, read its
  `origin/main`; its local checkout has been seen on a stale branch.

## Scope

An answer, audit or review request does not authorize edits. Implementation
permission does not include deploying, merging, publishing, changing branches under
another session, or messaging people.

For coding work, use `pragmatic-programming`, and add `domain-driven-design` when a
change touches domain meaning, identity or lifecycle. Use `modern-web-guidance` for
browser work and `humanize-writing` for prose. If a personal skill is unavailable,
follow this guide and report the gap; do not copy personal skills into the
repository.

## Shared checkout safety

Several sessions and the catalog routines work in this repository. Inspect
`git status` before editing and leave changes you did not make untouched. Stage only
your task's paths; never `git add -A` or `git add .`. Do not stash, revert, switch
branches or force-push in a shared checkout; ask for a separate worktree instead. Do
not start a second server on a port another session owns, or stop one you did not
start.

## Domain language

Use the platform's terms in code, data and documents: initiative, need, offer, form
of capital, lens, opportunity, match, recipe, place, pulse, account, member and
steward. The [PRD](docs/platform/04-prd.md#5-core-concepts-and-vocabulary) defines
them; do not redefine them elsewhere. People read the plain labels in
[VOICE.md](packages/design-system/brand/VOICE.md#plain-names) instead, such as "partnership"
for recipe and "kind of support" for form of capital. An opportunity is never an
eligibility decision.

## Skills

Skills live in `.claude/skills`, and `.agents/skills` is a symlink to it for Codex.
Edit the canonical files and keep the symlink. Read a skill directly if your harness
has not loaded it.

| Task | Skill or source |
|---|---|
| Multi-step work, architecture options, progress against criteria | [plan](.claude/skills/plan/SKILL.md) |
| A bug report, failing check or unexpected behavior | [debug](.claude/skills/debug/SKILL.md) |
| Reviewing a diff, branch or pull request | [review](.claude/skills/review/SKILL.md) |
| Commit, push or draft pull request | [ship](.claude/skills/ship/SKILL.md) |
| Monday discovery, Thursday freshness, any catalog change | [catalog-research](.claude/skills/catalog-research/SKILL.md), with the [catalog guide](research/AGENTS.md) for files and checks |
| A screen, component, CSS, token or copy change | [design](.claude/skills/design/SKILL.md) |
| Product requirements and decisions | [PRD](docs/platform/04-prd.md), [technical spec](docs/platform/05-technical-spec.md), [open decisions](docs/platform/open-decisions.md) |

A skill never grants authority: its existence does not permit publishing, deploying
or messaging.

## Checks

Run the focused check for the behavior you changed, then what the ladder adds. Root
`bun run build` and `bun run test` cover the live site and catalog, and they are
what its Vercel deploy runs. `bun run ci` runs every check the CI workflows run.

| When | Run |
|---|---|
| Any change | The focused test for the behavior, such as `node --test tests/matching.test.mjs`, and `git diff --check` |
| Catalog data or the importer | `bun run research:import` when research inputs changed, then `bun run build`, then `bun run test` |
| The live site's interface | `bun run build`, `bun run test`, and a rendered check at 360 px and 1280 px with the keyboard |
| Tokens or the design system | `bun run design:check` and `bun run --filter @regen-commons/design-system test` |
| A workspace package | `bun run --filter <package> test` and `bun run --filter <package> typecheck`, as its guide says |
| The app's interface | Also the `app` server from `.claude/launch.json`, checked at 360 px and 1280 px in both themes with the keyboard, and the five-minute review |
| Docs, guidance, skills or rules | `bun run guidance:check` |
| Hooks or checkers in `scripts/harness/` and `scripts/quality/` | `bun run test:harness` |
| Before push (what CI runs) | `bun install --frozen-lockfile`, then `bun run ci`, `git diff --exit-code` and `git diff --check` |

Two traps. After catalog changes, run `bun run build` before `bun run test`, because
the vector files are ignored build output and the tests fail on stale ones. The
first build in a fresh checkout or worktree downloads the pinned model files, so it
needs network access.

Label every rendered proof with its class (`fixture`, `local Supabase`, `preview` or
`production`) and the browser. Fixture proof never counts as live proof. Report the
commands you ran and what they showed, including checks you could not run.

### Change criticality

| Tier | Surfaces | Depth |
|---|---|---|
| Critical | Auth and sessions, row-level security and steward commands, consent and the AI ledger, the cloud AI proxy, retraction and sharing, email recipients, KOI signing | Read every touched line, prove the failure paths, and get a second review before merge |
| Sensitive | The intake flow, matching scores and reasons, the catalog importer, the membership handoff, pulse composition | Inspect failure and recovery, use fixtures, and show rendered proof where there is an interface |
| Routine | Copy, styling within tokens, docs, tests, the pattern library | Focused proof, plus the five-minute review in `DESIGN.md` for UI |

## Writing

Use `humanize-writing` for prose people read, such as docs, pull requests and
handoffs. Product copy follows [VOICE.md](packages/design-system/brand/VOICE.md):
sentence case, plain words, no em dashes and no arrows. Lead with the outcome, keep
code, commands and paths exact, and say what is uncertain or unverified.

## Harness files

`CLAUDE.md` only imports this file. Keep repository policy here, not in
harness-specific files. Hooks in `.claude/settings.json` and `.codex/hooks.json` run
the same scripts in `scripts/harness/`: they block `bun test`, reading `.env` files
and editing secrets or generated files; ask before broad staging, force pushes,
discarding work, merges and deploys; and, when you stop, ask for the checks that
match the files your session edited. They guard ordinary commands, not every way a
shell can run one. Do not weaken or work around them; change them in a reviewed pull
request with their tests.
Preview servers start from `.claude/launch.json`.
