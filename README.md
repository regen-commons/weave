# Weave

**Weave helps regenerative initiatives find partners and funding. Describe your initiative once, add what you need and what you can offer, and see who and what aligns.**

Money is one of eight kinds of support. An initiative also runs on skills, relationships,
land and culture, so every need and offer in Weave names its kind, an idea borrowed from
the eight forms of capital.

Funding suggestions come from a researched catalog of about 700 funders and need no
sign-in. Partner suggestions start from a project on [Certified](https://certified.one).
Your draft stays on your device until you choose to save it.

Weave is the first version of the [Regen Commons](https://regencommons.com) platform,
a shared home for the regenerative movement.

[Open Weave](https://weave.regencommons.com) · [Read the platform plan](docs/platform/README.md)

## What is in this repository

| Path | What it holds |
|---|---|
| [`packages/app`](packages/app/AGENTS.md) | Weave itself: a React and Vite web app you can install on a phone |
| [`packages/api`](packages/api/AGENTS.md) | The server functions behind the app: sign-in, saving, sharing and matching |
| [`packages/design-system`](packages/design-system/README.md) | The Regen Commons brand, voice, CSS and pattern library, with tokens generated from [DESIGN.md](DESIGN.md) |
| [`research/`](research/AGENTS.md), `scripts/`, `tests/` | The funder catalog: evidence from official sources, the importer and its checks |
| `dist/`, `serve.mjs` | Funding Commons, the funding directory Weave grew from, still live at [funding-commons.vercel.app](https://funding-commons.vercel.app) |
| `supabase/` | Database changes for the platform |
| [`docs/platform`](docs/platform/README.md) | The plan: proposal, product requirements, technical spec and open decisions |

## Get started with your agent

Clone this repository, open it in your coding agent, and use this prompt:

```text
Read AGENTS.md and the guide for the package I want to work on. Help me install
Weave, run the app locally and find a good first change. Tell me which checks
apply to that change, and leave other sessions' servers and files alone.
```

[AGENTS.md](AGENTS.md) holds the repository rules. Each package has its own guide for
the area you will edit.

## Manual setup

Use **Bun 1.4.2** and **Node 24**. Running the app locally needs no secrets or
environment variables.

```bash
git clone https://github.com/regen-commons/weave.git
cd weave
bun install --frozen-lockfile
bun run --filter @weave/app dev
```

Open <http://localhost:5173>. Add `?fixture=draft` to the address to see the app filled
with example data. Signing in and saving need server configuration, so they stay
unavailable on a plain local run.

## Everyday development

| Task | Command |
|---|---|
| Run Weave | `bun run --filter @weave/app dev` |
| Browse the pattern library at <http://localhost:4173/patterns/index.html> | `bun run design:serve` |
| Run Funding Commons at <http://127.0.0.1:4176> | `bun run build`, then `bun run dev` |
| Test one package | `bun run --filter @weave/app test` |
| Type check every package | `bun run typecheck` |
| Run everything CI runs | `bun run ci` |

Two things to know before you run checks:

- Use `bun run test`, never `bun test`. The suites use Node's test runner, and Bun's
  own runner reads them differently.
- The first `bun run build` in a fresh checkout downloads the pinned model files for
  local matching, so it needs network access.

## Contribute

Start a branch from `develop` and open your pull request back into `develop`. Releases
go from `develop` into `main`, which is the production branch for Weave. Funding Commons
deploys separately, from `codex/funding-commons-demo`.

This repository is public. Keep secrets, `.env` files and contact details out of
commits, logs and pull requests.

## Resources

- [Platform plan](docs/platform/README.md): what Weave is for and where it is going
- [Product requirements](docs/platform/04-prd.md): users, vocabulary and scope
- [Technical spec](docs/platform/05-technical-spec.md): stack, data, sign-in and matching
- [Design system](DESIGN.md) and [voice](packages/design-system/brand/VOICE.md): how Weave looks and reads
- [Keeping the catalog current](docs/maintenance.md): the Monday discovery and Thursday freshness reviews
- [Matching and screening](docs/matching-screening.md): how funding evidence is weighed
- [Agent guide](AGENTS.md): rules, skills and the full check ladder
