---
name: catalog-research
description: Run the Monday discovery or Thursday freshness review of the Funding Commons funder catalog, or make any other catalog change. Covers finding and verifying official funding programs, deduplication, coverage records, preservation of prior terms and the draft pull request. Use for the scheduled Codex routines and for manual catalog work.
---

# Catalog research

The Monday discovery and Thursday freshness workflow is in
[docs/maintenance.md](../../../docs/maintenance.md). Read it in full and follow it
exactly: it is the authority for both routines. Its text moves into this skill once
open pull request #9, which edits it, has merged or closed; until then this skill
only routes to it and adds nothing to it.

## Before you start

1. Read the [catalog guide](../../../research/AGENTS.md) for which files are
   generated, the preservation rules and the checks.
2. Read the latest default branch, repository-wide open pull requests and prior
   coverage, as the maintenance guide says, before searching.
3. Work in an isolated `codex/` branch or worktree, following the
   [root guide](../../../AGENTS.md#shared-checkout-safety).

## Finish

Run the checks in the catalog guide, then end as the maintenance guide says: a
reviewable draft pull request labeled `automated/codex`, an explicit no-change
result in the coverage log, or a concrete source or tool failure with prior data
preserved. Never merge, deploy, submit applications or contact funders.
