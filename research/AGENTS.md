# Funding Commons site and catalog

Use the [root guide](../AGENTS.md) for shared workflow. This guide covers the funder
catalog (`research/`, the catalog scripts in `scripts/`, `tests/`) and the live
static site (`dist/`, `serve.mjs`, `src/embedding-runtime.js`). The Monday discovery
and Thursday freshness workflow is in [docs/maintenance.md](../docs/maintenance.md),
reached through the [catalog-research skill](../.claude/skills/catalog-research/SKILL.md);
read it before any catalog change. The current matching rubric is in
[docs/matching-screening.md](../docs/matching-screening.md).

## What is generated

Despite its name, `dist/` holds the live site's hand-written source: `index.html`,
`app.js`, `styles.css`, the `*.mjs` modules and `data/enrichment.schema.json`.
The rest of `dist/data/` is generated. Change the inputs, then rerun the script.

| Output | Written by | Rerun with |
|---|---|---|
| `dist/data/funders.json`, `research-coverage.json`, `research-followup*.json` | `scripts/import-data.py` | `bun run research:import` |
| `dist/data/program-conditions.json`, `eligibility-rules.json`, `model-assets.json` | `scripts/build-ai.mjs` | `bun run build` |
| `dist/data/fund-vectors.*`, `dist/assets/`, `dist/models/` (ignored by Git) | `scripts/build-ai.mjs` | `bun run build` |

## Rules

- Official calls are evidence. Databases, newsletters and older notes are leads to
  follow to the funder. Never invent eligibility, currency, dates or rolling intake.
- Preserve every existing record, all 593 original identities, and every program and
  source revision. A change to existing terms keeps the previous revision and its
  evidence; the importer appends and does not yet store revisions on its own.
- An opportunity is never an eligibility decision, and a failed retrieval is not a
  closure.
- The importer judges deadlines as of `--as-of` (default: now). The region-tags test
  reruns it as of the committed catalog's `compiledAt`, so keep that flag working.
- Private Drive and Linear captures, application drafts, contacts and relationship
  notes stay outside this public repository.
- Routine catalog pull requests are drafts labeled `automated/codex`. Routines never
  merge, deploy, submit applications or contact funders.

## Checks

After any catalog change: `bun run research:import` when research inputs changed,
then `bun run build`, then `bun run test`, then `git diff --check`. Build before
test, because the vector tests read ignored build output and fail on stale files.
`bun run build` downloads the pinned model files into `dist/models/` the first time
it runs in a fresh checkout or worktree.

For a change to the live site's interface, also run `bun run dev` and inspect the
rendered result at 360 px and 1280 px, with the keyboard, including exact program
navigation from `fund` and `program` links. Label the proof as local.
