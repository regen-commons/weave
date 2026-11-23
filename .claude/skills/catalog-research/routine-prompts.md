# Routine prompts

The two scheduled routines are saved in the Codex app on the maintainer's computer,
not in this repository. Their saved prompts should be the short texts below, so the
workflow has one home: this skill. When the workflow changes, change the skill. The
saved prompts need a change only when a path or a boundary below changes.

Editing a saved routine is the maintainer's decision. An agent proposes the text here
and does not edit the saved copy on its own.

## Monday discovery

Saved as `funding-commons-monday-discovery`. Schedule: Mondays, 9:00 a.m.
America/Los_Angeles.

```text
Weekly funding discovery for the Funding Commons catalog. Use ~/Code/regen/weave.

Read AGENTS.md, research/AGENTS.md and .claude/skills/catalog-research/SKILL.md from
the latest origin/develop, then follow the skill's "Before either routine", "Monday
discovery" and "Finish" sections exactly, with its search playbook and verification
standard.

Work in a new worktree inside the repository:
git -C ~/Code/regen/weave worktree add .claude/worktrees/<name> -b codex/<name> origin/develop
Never use /tmp or /private/tmp. Preserve unrelated work.

Start from the plan: node scripts/research-plan.mjs discovery. Sweep the sources and
search the cells it lists. Record coverage in the review log, the source registry and
the coverage ledger, whether or not anything is added. There is no quota of additions.

Run the catalog crawler on the Mac as python3 scripts/collect-sources.py, not through
bun. Run the catalog checks. Open or update a draft pull request into develop, labeled
automated/codex. Never merge, deploy, change deployment configuration, submit an
application or contact a funder. If a preview is canceled by the Ignored Build Step,
record it as skipped and do not wait for it.

Stay quiet when nothing meaningful changed. Notify only for a pull request ready for
review, a material change to a near deadline, a failed run or a decision needed. If
the run cannot write to the repository or publish, save the report and the unapplied
records outside the repository, say exactly what blocked it, and do not count the run
as a no-change result.
```

## Thursday freshness

Saved as `funding-commons-thursday-freshness`. Schedule: Thursdays, 9:00 a.m.
America/Los_Angeles.

```text
Weekly freshness review for the Funding Commons catalog. Use ~/Code/regen/weave.

Read AGENTS.md, research/AGENTS.md and .claude/skills/catalog-research/SKILL.md from
the latest origin/develop, then follow the skill's "Before either routine", "Thursday
freshness" and "Finish" sections exactly, with its verification standard.

Work in a new worktree inside the repository:
git -C ~/Code/regen/weave worktree add .claude/worktrees/<name> -b codex/<name> origin/develop
Never use /tmp or /private/tmp. Preserve unrelated work.

Start from the plan: node scripts/research-plan.mjs freshness. Recheck every priority
record, then at least 125 of the oldest due, in the plan's order. Check each program
or round's own terms. A failed retrieval is not a closure. Never infer an annual date.
Change existing terms only through scripts/revise-program.py, with the previous
revision and official evidence kept.

Run the catalog crawler on the Mac as python3 scripts/collect-sources.py, not through
bun. Run the catalog checks. Open or update a draft pull request into develop, labeled
automated/codex. Never merge, deploy, change deployment configuration, submit an
application or contact a funder. If a preview is canceled by the Ignored Build Step,
record it as skipped and do not wait for it.

Stay quiet when nothing meaningful changed. Notify only for a pull request ready for
review, a material change to a near deadline, a failed run or a decision needed. If
the run cannot write to the repository or publish, save the report and the unapplied
records outside the repository, say exactly what blocked it, and do not count the run
as a no-change result.
```

## What the routines need to run

Both routines need the repository as a writable project root and permission to create
a branch and a draft pull request. Without those a run can research but cannot record
or publish, and its work stays in the Codex outputs folder.
