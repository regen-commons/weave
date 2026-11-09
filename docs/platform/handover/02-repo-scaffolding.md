# Handover prompt: repository foundation, agent skills and the Regen Commons design system

Paste everything below the line into a new session. It runs in parallel with the interface prototype in [01-ui-design-first.md](01-ui-design-first.md). That session only reads the repository, so this one owns every repository change.

---

You are laying the foundation of the `regen-commons/funding-commons` repository so that coding agents can build Weave, the first version of the Regen Commons platform (weave.regencommons.com), during November 2026. Give the repository a structure modelled on Green Goods, adopt the Regen Commons design system as a shared package, and set up the agent skills and the development flow. Build no product features.

## Current state (checked 1 November 2026)

- `main` is the live Funding Commons site. It is static: Bun 1.4.2 and Node 24, with `src/` built by esbuild into a committed `dist/`. The funder catalog lives in `research/` and `scripts/import-data.py`, and the tests in `tests/` run with `node --test`. Vercel installs with `bun install --frozen-lockfile`, builds with `bun run build && bun run test`, and serves `dist/`. Two Codex routines (Monday discovery, Thursday freshness) work from `/Users/afo/Code/regen/funding-commons` and follow `docs/maintenance.md`, which is the repository's only agent guidance.
- `docs/tend-platform-plan` holds the platform plan in `docs/platform/` and the design system: `DESIGN.md` (DesignMD tokens), `design-system/` (brand, voice, layered CSS, fonts, patterns, example pages, principles), `scripts/design/` and `tests/design-system.test.mjs`. Branch from an up-to-date `origin/docs/tend-platform-plan` whose history includes "docs(platform): sync plan with the living doc and add handover prompts". If it doesn't, stop and tell me. Do not recreate what is there.
- Open pull requests change catalog files: #9 (revision-aware imports, draft) and #10 (import clock pin). Do not move a file that either one changes until that pull request has merged or closed.
- For product requirements and decisions, the living plan doc https://claude.ai/artifact/YEjb6QGeaF5iGLaQRczUhH wins over the repository. Note any difference you find.
- Hosting is a new Vercel project in the Regen Commons team (Hobby now, Pro once needed). Data is the shared Supabase project "Regen Commons / Website", schema `weave`, with the website repository as the only migration owner in Phase 0.

## Read first

1. `docs/platform/07-agent-scaffolding.md`, the plan you are carrying out, including which Green Goods patterns to adopt and which to skip.
2. `docs/platform/05-technical-spec.md` sections 2 and 3, and `docs/platform/04-prd.md` section 9.
3. `DESIGN.md`, `packages/design-system/README.md`, `packages/design-system/brand/VOICE.md` and `docs/maintenance.md`.
4. Green Goods, the structure to follow. Local clone: `/Users/afo/Code/greenpill/green-goods`. Read `origin/develop`, its default branch, not the working copy. It is a Bun workspace (`packages/*` and `docs`) run through turbo (`build`, `lint`, `typecheck`, `test`). Its root `AGENTS.md` routes to a scoped `AGENTS.md` in each package, and its root `DESIGN.md` generates the CSS in `packages/shared/src/styles/`. It also has `.claude/` (skills, rules, context, `settings.json`, `launch.json`), `.agents/skills`, `.codex/`, `scripts/harness/` and `scripts/quality/`, and a CI workflow per package behind `ci-gate.yml`.
5. The Regen Commons website (`regen-commons/website`). Local clone: `/Users/afo/Code/regen/regen-commons-site`. Read `origin/main`, because the checkout has been seen on a stale branch. Its `skills/` (plan, debug, review, ship) are the adapted versions to start from. Its `admin/`, `api/` and `supabase/` guides show what a scoped `AGENTS.md` looks like at this project's size.

## Step 0: agree the layout before moving anything

The spec (section 3.1) puts new code at the root (`app/`, `api/`, `supabase/`). A Green Goods layout changes that decision, so propose it first, as a draft pull request that changes only docs. It should contain:

- A table mapping each current path to its target, with a reason for each move. Cover the live site and catalog, the design system, the Weave app, the API functions and Supabase.
- What you adopt from Green Goods, what you skip, and why. The skip list in 07 stands (agent teams, Codex lanes, Linear routing, the QA app, the check selector, receipts, skill registries) unless you argue for one.
- What each move would break and how you will keep it working: the Vercel build and the live site, the two Codex routines and their saved prompts, the import and its tests, the design-system tests, and the open pull requests.
- Updates to section 3.1 of 05 and to the target layout in 07, so the plan matches the proposal.

Wait for my approval of that pull request before moving any existing code. New folders and files can follow the approved layout straight away.

## Then build, in this order, one small draft pull request each

1. **Workspace and foundation.** Bun workspaces, plus turbo if the proposal adopts it. A root `AGENTS.md` under about 150 lines covering where to work, essential rules, scope, shared-checkout safety, domain language, the skills table, the check ladder and writing rules. A scoped `AGENTS.md` for each package. `CLAUDE.md` containing only `@AGENTS.md`. `.claude/skills/` with `plan`, `debug`, `review` and `ship` adapted from the website, and the `.agents/skills` symlink for Codex. Check: a fresh agent session can say where to work and which check to run without reading anything else, and `bun run build && bun run test` still passes at the root.
2. **Design system package.** Move the design system into its package in the approved layout, keeping `DESIGN.md` at the root as the token source, as Green Goods does. Add the `design` skill with the three-book workflow in 07, `.claude/rules/frontend-design.md`, the package's `AGENTS.md`, and `design:check` in CI. Check: tokens, brand and voice are unchanged (the design-system tests pass with only path changes), and a raw hex value in the design system's CSS fails CI.
3. **Development flow and guardrails.** `.claude/launch.json` for the catalog, the pattern library and the app preview servers. Hooks in `.claude/settings.json` and `.codex/hooks`, sharing `scripts/harness/command-policy.mjs`, plus `scripts/quality/check-guidance.mjs` for links and skill frontmatter. The CI jobs the check ladder needs. Check: each blocked action fails in a test, and CI runs what the ladder in `AGENTS.md` says.
4. **Catalog skill.** Move `docs/maintenance.md` into a `catalog-research` skill with no change in behaviour. The routines' saved prompts live outside the repository, so give me the exact text to change in each.
5. **App shell.** The Weave app package: React 19 and a Vite PWA in TypeScript, with no CSS framework. It renders the design system's CSS and tokens through thin components that use those classes, the Regen Commons mark and fonts, and light and dark themes that follow the system. Stub routes for home, the three intake steps, matches, the directory and saving. Add an API package with one health-check Vercel function, give each package its own `AGENTS.md`, and use a Vercel config that keeps funding-commons.vercel.app serving the current site until DNS for the subdomain is ready. Check: `bun run build` and `bun run test` pass, and the shell renders at 360 px and 1280 px in both themes with no raw values.

## Rules

- Work on branches, keep each pull request small with its own check, and open drafts. Do not merge, deploy, change DNS, create Vercel or Supabase projects, or add secrets. List anything that needs a person in the pull request.
- Keep the live site and the catalog working at every step: `bun run build && bun run test` passes at the root, and funding-commons.vercel.app keeps serving the current site.
- Add a dependency only where a step needs it, and name each one in the pull request with its reason. Turbo, Biome, oxlint and knip would all be new here.
- Change where the design system lives and how it is wired, never what it contains. Tokens, brand, voice, patterns and example pages stay as they are, because the prototype session is building on them.
- The repository is public: no secrets, contact details or private call content.

## Done means

The approved layout pull request, then one draft pull request per step, each passing CI. Finish with a short summary: what each pull request adds, what a person must do next (Vercel project, subdomain, Supabase access, routine prompt edits), and anything in the plan that turned out wrong.
