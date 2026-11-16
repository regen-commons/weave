# Revising existing program terms

Use `scripts/revise-program.py` for an existing program's freshness update. It stages changes in a local `codex/` branch and retains each previous full funder record, program and source revision. A human reviews the resulting draft PR before merging. New funders and additional programs still use the existing supplemental import path.

## Prepare and review

Start from current main in an isolated `codex/` branch/worktree. Inspect open PRs for overlapping revisions. Run the normal import and validation if generated data is stale. Keep public official evidence in the proposal and private captures outside the repository.

Generate a proposal from the current full record. The same command is available as `bun run research:revise`. For example:

```sh
python3 scripts/revise-program.py --template recgDAwfqtJyo2MEx rapid-response-organizing-grants > /tmp/emergent-revision.json
```

Edit the template with a unique lowercase revision `id`, actual `reviewedOn` date, reason, complete `afterProgram`, and newly reviewed `sources` objects (`url`, `title`, `checkedOn`). Preserve the generated `expectedFundSha256`. Recheck official sources before using an old proposal; an archived finding is not current verification.

Each changed program field needs evidence dated on `reviewedOn`. An evidence field can name a parent such as `application`, or the specific changed path such as `application.closesOn`. Include evidence for revised uncertainty notes under `unknowns`. A review cannot move a changed field's verification date backward. Every newly retained source version must be referenced by dated program evidence. Failed retrievals belong in the coverage log and do not justify revised terms or verification dates.

Run a dry run, inspect its changed-field/file list, then stage locally:

```sh
python3 scripts/revise-program.py /tmp/emergent-revision.json
python3 scripts/revise-program.py /tmp/emergent-revision.json --apply
bun run build
bun run test
git diff --check
```

The command supports `--root PATH` for another checkout. Node.js and Python 3.9 or newer are required. Local serialization uses a POSIX file lock, supported on the project's macOS development and Linux CI environments. `--apply` requires a `codex/` branch. It never commits, pushes, merges, deploys or contacts funders.

The command validates the existing catalog, rejects a stale full-record hash, prepares source and generated changes in a temporary copy, validates schema and screening, and rejects unrelated full-record changes. Only after these checks does it write local files. Ordinary write errors restore prior bytes. If a process is interrupted during replacement, inspect/discard the isolated worktree before retrying; this is a Git preparation workflow, not a multi-file database transaction.

Review all source, generated, index and archive diffs together. Open or update a **draft PR** labeled `automated/codex`. A duplicate revision ID is rejected, including an exact replay. For a second revision of the same funder, generate a new template from the newly staged catalog. Do not refresh the hash on an old proposal without rechecking its terms. Reversals are new revisions with new evidence and IDs; never remove a journal entry to roll back.

## Eligibility and screening

Application timing/route, uncertainty and evidence-only revisions can retain existing screening. Any other changed program section requires an explicit `screening` object with both `conditions` and `rules` arrays. These replace all executable checks for that exact funder/program across the canonical screening inputs. Unrelated checks are retained. Empty arrays explicitly retire obsolete checks; document the remaining manual review in the program's uncertainty notes.

Replacement rows must use the target fund/program IDs, a retained source URL and the current review date, and must pass the existing screening validators. A changed condition cannot reuse its ID on the same source date, because that could reuse a saved project answer. Allocate a new condition ID for a same-day change. A new source date also causes the existing browser logic to request confirmation again.

Old screening rows are preserved in the archive's `edits`. A partial field review does not advance the funder's `verifiedOn` or enrichment `researchedOn`; only the scoped evidence/source dates change. Program geography remains distinct from broad region navigation tags. This command does not rename or delete funder/program identities or change overview-only funders.

## History and CI

`research/revisions/index.json` is an ordered, append-only index of SHA-256-addressed archive files. Each archive contains the exact before and result funder snapshots, before/after program values, source versions, field-level change paths, original input-file hashes and scoped input edits. The original monolithic inputs remain authoritative for the current catalog; the journal records their revisions rather than replaying a second competing source of current terms.

Normal imports and snapshot validation check that the latest recorded program matches canonical input and that prior source versions remain retained. Builds and revision preflight share the same screening validator. Unchanged research retains its selected display program across rebuilds, avoiding unrelated record changes as the clock advances; runtime availability labels still expire with dates.

CI fetches the base commit and runs:

```sh
python3 scripts/revise-program.py --check-base BASE_COMMIT_SHA
```

It rejects changes/removal of committed journal entries or archives and verifies each new full-record transition against the actual base or preceding revision and the final catalog. Keep a freshness PR focused: do not combine an unjournaled change to a revised funder with that funder's revision chain.

Historical audit tests use the archived before snapshots and inputs through `tests/helpers/audit-revisions.mjs`; their existing hashes and audit assertions remain intact. Current behavior tests continue to use the current catalog. New regression coverage must check the proposed current route, dates, conditions and failure boundaries.

## Initial verification

The integration suite replays the two archived October 29 Thursday proposals (Emergent Fund and Keeling Curve) in disposable fixtures, including their future/closed routes and unresolved dates. These are synthetic test replays, not fresh official-source verification or staged catalog updates. The initial journal is empty and the published catalog remains unchanged. The original review archive is immutable; future real updates must be new dated proposals and PRs.

The initial implementation passes the build and 130 Node tests, including the 11-case Python integration suite. Coverage includes dry run/local apply, original/supplemental/appended program locations, sequential/stale/duplicate updates, dated field evidence (including legacy paths), schema failures, screening replacement across multi-digit source files, saved-answer invalidation, archive tampering, base-commit history protection, unchanged display selection under a future clock, and rollback on write errors. The normal importer leaves all 699 current full records unchanged with an empty journal. Current catalog, screening outputs and prior review logs are byte-identical to main.
