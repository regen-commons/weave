# Repository layout

Status: proposal, waiting for approval · Date: 2026-11-01
Companion documents: [technical spec](05-technical-spec.md#31-decisions) · [agent scaffolding](07-agent-scaffolding.md) · [PRD scope by phase](04-prd.md#9-scope-by-phase) · [handover prompt](handover/02-repo-scaffolding.md)

New code goes into a Bun workspace under `packages/`, as in Green Goods. The live Funding Commons site and its catalog stay at the repository root until the Weave directory route replaces them. This changes [spec 3.1](05-technical-spec.md#31-decisions), which put `app/`, `api/` and `supabase/` at the root.

No existing file moves until this layout is approved. After that, each step below is one small draft pull request with its own check.

## Target layout

```text
AGENTS.md                         repository policy, routing table, check ladder
CLAUDE.md                         "@AGENTS.md" and nothing else
DESIGN.md                         token source and interface principles (stays)
README.md                         the live site and catalog (stays)
package.json                      workspace root: packages/*, scripts that fan out to packages
bunfig.toml                       minimum release age for new versions, no implicit .env loading
vercel.json                       the live Funding Commons project (unchanged)
dist/  serve.mjs  src/            the live static site (unchanged)
research/                         catalog evidence (unchanged) and research/AGENTS.md
scripts/                          catalog scripts (unchanged), harness/, quality/
tests/                            catalog tests (unchanged)
docs/                             platform plan, matching notes
packages/
  design-system/                  @regen-commons/design-system, moved from design-system/
  app/                            @weave/app: React 19 and Vite PWA, root of the Weave Vercel project
    api/                          one-line Vercel entry files that re-export @weave/api handlers
    src/ui/                       thin components that render design-system classes
  api/                            @weave/api: Node handlers and their tests
supabase/                         platform migrations, created with the first one
.claude/                          skills, rules, context, settings.json, launch.json
.agents/skills -> ../.claude/skills
.codex/                           config.toml, hooks.json
.github/workflows/                validate.yml (unchanged), design.yml, guidance.yml
```

Package directories are named by role, so they survive a rename. The `@weave/` scope follows the working name: if the council chooses another one ([D1](open-decisions.md#for-the-council)), the scope changes by search and replace and the directories keep their names. The design system takes the `@regen-commons/` scope because the website, the steward desk and email are meant to use it too.

A package for shared contracts, such as the Zod schemas in [spec 6.2](05-technical-spec.md#62-contracts-zod-single-source-of-truth), appears when the app and the API first share one. Nothing is extracted ahead of that.

## Where each path goes

| Current path | Target | Step | Why |
|---|---|---|---|
| `dist/`, `serve.mjs`, `src/embedding-runtime.js` | Stay at the root | None | The live Vercel project builds and serves `dist/` from the root. The directory is rebuilt as a route in the app ([spec 15](05-technical-spec.md#15-migration-from-the-current-site)), so moving the old site now is work the cutover throws away. |
| `research/`, catalog `scripts/`, catalog `tests/` | Stay at the root; `research/AGENTS.md` added | 1 | Open pull requests #9 and #10 change these files, both routines call them by path, and spec 15 keeps the research workflow as it is. |
| `vercel.json`, `.openai/hosting.json` | Stay, unchanged | None | They configure hosting for `dist/`. The Weave project gets its own `packages/app/vercel.json`. |
| `.github/workflows/validate.yml` | Stays, unchanged | None | #9 edits it. New checks arrive as new workflow files. |
| `docs/maintenance.md` | `.claude/skills/catalog-research/SKILL.md`, with a pointer left at the old path | 4 | Agents and routines discover skills. #9 changes this file, so its text moves only after #9 merges or closes. |
| `docs/platform/`, `docs/matching-screening.md` | Stay | None | Plan and rubric documents. |
| `design-system/` | `packages/design-system/` | 2 | The app imports it by package name, and it carries its own guide, scripts and tests. Relative paths inside the folder stay the same. |
| `DESIGN.md` | Stays at the root | None | The token source sits at the root, as in Green Goods, and it is the first file people and agents read. |
| `scripts/design/generate-tokens.mjs` | `packages/design-system/scripts/generate-tokens.mjs` | 2 | It writes only into the package. Its `yaml` and `@google/design.md` dependencies move into the package manifest with it. |
| `tests/design-system.test.mjs` | `packages/design-system/test/design-system.test.mjs` | 2 | It runs with the package, and root `bun run test` still runs it. Only its paths change. |
| (new) the Weave app | `packages/app/` | 5 | React 19 and a Vite PWA in TypeScript. It is the root directory of a new Vercel project with its own `vercel.json`, so the live project is untouched. |
| (new) API functions | `packages/api/` | 5 | Node handlers and their tests, with server rules kept apart from browser code. Vercel only finds functions in `api/` under a project's root directory, so `packages/app/api/` holds one-line entry files that re-export each handler. |
| (new) Supabase | `supabase/` at the root | First migration | The Supabase CLI expects `supabase/` in its working directory, and the website repository, which applies Phase 0 migrations ([spec 3.3](05-technical-spec.md#33-supabase-project-and-migration-ownership)), uses the same path. It has no JavaScript, so it is not a workspace package. |
| (new) agent guidance | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/skills`, `.codex/`, `scripts/harness/`, `scripts/quality/` | 1 and 3 | As planned in [07](07-agent-scaffolding.md). |
| `.claude/launch.json` | Stays, and gains the catalog and app servers | 3 and 5 | Preview servers start the same way every time. |

## What we take from Green Goods

| Pattern | How it lands here |
|---|---|
| Bun workspace over `packages/*` with scoped names | Every package uses the same script names: `build`, `typecheck` and `test`, plus `lint` once a linter exists. `bun run --filter '*'` runs packages in dependency order, skips packages without the script and fails when any package fails (checked with Bun 1.4.2). Root `build` and `test` stay the live site's own; `bun run ci` runs them and every package's. |
| Root `DESIGN.md` generating the shared package's CSS | `DESIGN.md` stays at the root and generates `packages/design-system/tokens/`. |
| Root `AGENTS.md` routing to a scoped guide per surface; `CLAUDE.md` only imports it | Guides for `research/` and each package. Rows are added as each surface arrives, so the table never points at something missing. |
| `.claude/skills` canonical, `.agents/skills` symlinked for Codex | Skills adapted from the website's `plan`, `debug`, `review` and `ship`, then `design` and `catalog-research`. |
| Hooks in `.claude/settings.json` and `.codex/hooks.json` sharing `scripts/harness/command-policy.mjs` | The hook set in 07, with a test that runs each configured hook. |
| Guidance checker in `scripts/quality/` | Relative links, documented `bun run` scripts and skill frontmatter. |
| Path-scoped `.claude/rules/` and a few `.claude/context/` files | Added with the paths they cover. |
| One `vercel.json` per deployable package, each Vercel project rooted at its package | As Green Goods does for client, admin and QA. The live project keeps the root. |
| A workflow per check | `design.yml`, `guidance.yml` and `weave.yml` beside the existing `validate.yml`, each running its own checks once. |
| `bunfig.toml` | A three-day minimum release age for newly resolved versions, and no implicit `.env` loading. Green Goods' `[run] bun = true` is not adopted, because it would run the `node --test` scripts under Bun. |

## What we skip, and when to revisit

| Pattern | Why not now | Revisit when |
|---|---|---|
| turbo | Three small packages and a full build and test of about 20 seconds. Bun's filter already gives ordering and failure, and the shared script names make turbo a one-file addition later. | A full `bun run test` takes more than two minutes, or CI needs to run only affected packages. |
| `ci-gate.yml` with path-filtered workflows | The gate exists because path filters make required checks unreliable. Here every workflow runs on every pull request, so each can be a required check on its own. | Turbo arrives. |
| Biome, oxlint, knip | There is no TypeScript yet. Strict `tsc` and the design-system tests are the first guards. | Biome, format only, in one commit, once the app has feature code. oxlint and knip when lint findings or unused code show up in review. |
| Vitest and Storybook | Node 24 runs TypeScript through `node --test` by stripping types, so one runner covers the catalog, the design system and the app's logic. Rendered checks use a browser. Storybook stays deferred, as 07 says. | The first real flow, with Playwright as [spec 14](05-technical-spec.md#14-verification) plans. |
| husky and lint-staged | Agent hooks and CI already cover what pre-commit hooks would. | People commit by hand often enough to want them. |
| pm2, Fly, mise, `env.schema`, `.dev-surfaces`, a docs workspace | There are no long-running services and no public docs site. | One of them exists. |
| Agent teams, Codex lanes, Linear routing, the QA app, the check selector and receipts, skill registries, Plan Hub closeout, nightly CI | The skip list in 07 stands. | A repeated, observed problem justifies one. |

## What could break, and how it keeps working

### The live site and its Vercel build

- Root `vercel.json` stays as it is. Vercel still runs `bun install --frozen-lockfile`, then `bun run build && bun run test` at the root, and serves `dist/`.
- The lockfile grows with each package and is committed in the same pull request. With packages present, Bun 1.4.2 switches to its isolated linker. The catalog build, which bundles Transformers.js with esbuild and copies the ONNX runtime out of `node_modules`, and all 149 tests pass under it (checked in a scratch copy).
- Root `build` and `test` stay the live site's own, so its deploy runs what it ran before and a broken package cannot hold up a catalog update. The packages build and test in their own workflows, and `bun run ci` runs everything CI runs.
- The Weave app deploys from a second Vercel project rooted at `packages/app`. funding-commons.vercel.app keeps serving `dist/` until the subdomain is live and the redirect in spec 15 is added.
- The existing project's Ignored Build Step skips previews, and the new project does not exist yet, so no preview deploys come from this work.

### The Monday and Thursday routines

- Their saved prompts read latest `main`. This work targets `docs/tend-platform-plan`, so nothing reaches them until that branch merges.
- Their commands stay the same and run from the repository root: `python3 scripts/import-data.py`, `bun run build`, `bun run test`, `git diff --check`.
- Their prompts name `docs/maintenance.md`. Step 4 adds the skill. When the guide's text moves after #9, the old path keeps a short pointer, so an unedited prompt still reaches the same instructions. Step 4 gives the exact prompt edits.
- As saved, they start projectless from the home folder rather than in this repository, so this repository's Codex config and hooks should not load for them. If they do, or if the routines move to a project target, the command policy applies, and in Codex every ask is a block: `bun test`, broad staging, force pushes, discarding work (`reset --hard`, `checkout --`, `restore`, `clean`, `stash`, deleting branches or worktrees), merges and deploys. The maintenance guide asks for none of these.
- 07 planned `.codex/config.toml` with no network in the sandbox. The catalog build downloads pinned model files in a fresh worktree, and discovery reads official sources, so the project config leaves network access alone.

### The import and its tests

- No catalog file moves. `bun run test` still runs `node --test tests/*.test.mjs` first.
- The clock trap described in 07 is fixed on this branch: since #10, the region-tags test reruns the import as of the committed catalog's `compiledAt`. The root `AGENTS.md` records the trap that remains: after catalog changes, run `bun run build` before `bun run test`, because the vector files are ignored build output.

### The design-system tests

- The test and the token generator move with the package, and only their paths change. Tokens, CSS, fonts, brand assets, patterns and example pages move as pure renames, which `git diff -M` shows. Markdown files that link to `DESIGN.md` or `docs/` gain one `../` in those links and change nowhere else.
- `bun run design:tokens`, `bun run design:check` and `bun run design:serve` keep their names at the root. The pattern library stays at http://localhost:4173/patterns/index.html.
- Links to `design-system/` in `DESIGN.md`, `docs/platform/`, the README and the handover prompts change in the same pull request, and the link test covers them.
- The prototype session reads `design-system/` by path. Merge step 2 after it has what it needs, or tell it the new path. Paths inside the folder do not change, so anything it has already copied keeps working.

### The open pull requests

- #9 and #10 change `scripts/`, `tests/`, `package.json`, `README.md`, `.github/workflows/validate.yml`, `docs/maintenance.md` and `research/`. None of these move. `package.json` gains a `workspaces` field and scripts on lines #9 does not edit, `validate.yml` is left alone, and `docs/maintenance.md` moves only after #9 merges or closes.
- #10 is already merged into `docs/tend-platform-plan`. #3 adds files under `docs/qa/` and is unaffected.

## Build order

Each pull request is a draft based on the previous step's branch, so its diff shows one step. `validate.yml` runs on every pull request, including stacked ones.

1. **Workspace and foundation.** `workspaces`, `bunfig.toml`, root `AGENTS.md`, `CLAUDE.md`, `research/AGENTS.md`, and the `plan`, `debug`, `review` and `ship` skills with the `.agents/skills` symlink. Check: a fresh agent session can say where to work and which check to run from `AGENTS.md` alone, and `bun run build && bun run test` passes.
2. **Design-system package.** The move above, the `design` skill, `.claude/rules/frontend-design.md`, `packages/design-system/AGENTS.md` and `design.yml` running `bun run design:check`. Check: the design-system tests pass with only path changes, and a raw hex value in the package's CSS fails them.
3. **Development flow and guardrails.** `.claude/launch.json` servers, the hooks, `scripts/harness/command-policy.mjs`, `scripts/quality/check-guidance.mjs` and `guidance.yml`. Check: each blocked action fails in a test, and CI runs what the ladder in `AGENTS.md` says.
4. **Catalog skill.** The `catalog-research` skill now, and the move of the guide's text after #9. Check: the skill holds the guide's instructions unchanged, and the routine prompt edits are written out.
5. **App shell and API.** `packages/app` with stub routes for home, the three intake steps, matches, the directory and saving; `packages/api` with a health check; a guide for each; `packages/app/vercel.json`. Check: `bun run build` and `bun run test` pass, and the shell renders at 360 px and 1280 px in both themes using only tokens.

## What needs a person

- Approve this layout.
- Create the Weave Vercel project in the Regen Commons team with its root directory set to `packages/app`. Step 5 lists the settings.
- Point weave.regencommons.com at it once DNS is decided ([D13](open-decisions.md#for-the-builders)).
- Give the platform access to the shared Supabase project when the first migration is written ([D12](open-decisions.md#for-the-builders)).
- Edit the two routine prompts with the text from step 4.
