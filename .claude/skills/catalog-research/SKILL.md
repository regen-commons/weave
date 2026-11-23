---
name: catalog-research
description: Run the Monday discovery or Thursday freshness review of the Funding Commons funder catalog, or make any other catalog change. Covers the source registry, the search playbook, the verification standard, deduplication, coverage records, preservation of prior terms and the draft pull request. Use for the scheduled Codex routines and for manual catalog work.
---

# Catalog research

Two routines keep the funder catalog current. Monday discovery finds programs the
catalog lacks. Thursday freshness rechecks what it holds. Both end in a draft pull
request a person reviews. A routine never merges, deploys, submits an application or
contacts a funder.

| Read | For |
|---|---|
| [Catalog guide](../../../research/AGENTS.md) | Which files are generated, the preservation rules and the checks |
| [Search playbook](search-playbook.md) | Which sources and searches to run, and how coverage is recorded |
| [Verification standard](verification-standard.md) | What counts as verified, how long it stays fresh, and how records are rechecked and retired |
| [Revision workflow](../../../docs/program-revisions.md) | Changing the terms of a program already in the catalog |
| [Routine prompts](routine-prompts.md) | The text the scheduled routines are saved with |

## Records each run reads and writes

| File | Holds | A run |
|---|---|---|
| `research/discovery-sources.json` | The source registry: databases, portals and lists, with access, query notes and last use | Updates `lastUsed` for every source it attempts |
| `research/search-coverage.json` | When each theme-by-place cell was last searched | Writes the cells it searched |
| `research/review-intervals.json` | How long each kind of record stays fresh | Reads only; changing a number is a reviewed decision |
| `research/maintenance-review-log.json` | Every run, its sources, searches, attempts and verifications | Appends one run and its entries; never rewrites old ones |
| `research/history-intake.json` | Leads and their dispositions | Adds new leads as `pending`, records dispositions |

## Before either routine

1. Fetch, then read the default branch's latest commit, the repository-wide open pull
   requests and the last runs in the review log. An empty pull request search does
   not prove there are none: cross-check with
   `gh api "repos/regen-commons/weave/pulls?state=open&per_page=100"`. Record the pull
   requests you inspected, and reuse an open one for the same work.
2. Work in an isolated `codex/` branch in a worktree, following the
   [root guide](../../../AGENTS.md#shared-checkout-safety).
3. Print the plan with `node scripts/research-plan.mjs discovery` or
   `node scripts/research-plan.mjs freshness`. It reads the committed records, so it
   lists the same work for every run on the same commit. Follow its order, and say in
   the run entry what you did not reach.

## Monday discovery

1. Sweep the registry sources the plan lists as due, in order, as their `query` notes
   say. A candidate source is one no run has used: confirm its address, access terms
   and query on first use, then correct its entry.
2. Search the coverage cells the plan lists, as the
   [search playbook](search-playbook.md) says: each cell in its languages, for money
   and for the one other form of capital the plan names.
3. Process `pending` leads in `research/history-intake.json`, and revisit an
   `unresolved` lead only when new official evidence has appeared. The reviewed
   dispositions are there so imports are not rediscovered. A `program-directory` or
   `non-cash-program` disposition is a useful resource, not an unprocessed grant.
4. Follow every lead to the funder or program owner. Deduplicate at three levels:
   funder identity (aliases, domains, existing source URLs), named program, and round.
   A parent organization or a similarly named fund is not automatically a duplicate.
   A new stream belongs under its existing funder. A new round keeps the previous
   round's terms and evidence.
5. Propose a program only when it meets the
   [verification standard](verification-standard.md#a-new-program). Everything else
   stays a lead with its disposition and what is missing. New funders and
   additional programs go in through `research/supplemental-funders.json`.
6. Record coverage as the playbook says, whether or not anything was added. A run with
   no additions is a useful run.

## Thursday freshness

1. Recheck the plan's priority records first: programs closing within 21 days, cutoffs
   that have passed while the route still says open, expected openings, and sources
   that keep failing.
2. Then review the plan's oldest-due records, at least 125 where source access allows.
3. Check the program or round's own terms, not just the funder's home page. For each
   record, log the attempt, the fields you actually read, the evidence URL, the
   outcome and the next review date, as the
   [verification standard](verification-standard.md#recording-a-check) says.
4. For a material change, show the previous and proposed values with official
   evidence, and apply it through the
   [revision workflow](../../../docs/program-revisions.md). A closed round or a
   discontinued program is retired as the
   [standard](verification-standard.md#retiring-a-record) says; nothing is deleted.
5. Report records you could not reach. Targets are not a claim of completed coverage.

## Finish

Run the checks in the [catalog guide](../../../research/AGENTS.md#checks). Confirm
that every identity and every program and source revision that existed before the run
is still there, and after a revision run
`python3 scripts/revise-program.py --check-base <base commit>`.

End with one of three results: a reviewable draft pull request labeled
`automated/codex`, an explicit no-change result in the review log, or a concrete
source or tool failure with prior data preserved. A missed or failed run does not
advance any verification date. Tell the user about a pull request ready for review, a
material change to a deadline that is close, a failed run or a decision they need to
make. A routine no-change run stays quiet.
