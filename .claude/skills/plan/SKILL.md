---
name: plan
description: Plan multi-step Funding Commons or Weave changes, compare architecture options, or assess progress against acceptance criteria. Use for work that spans packages, the catalog, data or deployment boundaries; routine edits do not need a written plan.
---

# Plan Funding Commons and Weave work

Read the [root guide](../../../AGENTS.md) and the scoped guides it routes to. Ground
the plan in the owning code, callers, tests and the user's current decisions. Use
[debug](../debug/SKILL.md) first when the work starts with an unexplained failure.

## Establish the intended outcome

- Identify observable acceptance criteria, affected surfaces and consequential
  unknowns. Separate confirmed requirements from implementation suggestions.
- Inspect local sources before asking for facts. Resolve routine, reversible
  choices with judgment. Ask about missing product authority or decisions that
  materially change scope, and keep working on what does not depend on them.
- For architecture options, describe the current problem, affected callers, a
  small viable change, its tradeoffs and the evidence that would show a benefit.
  Exploration alone does not authorize implementation.

## Keep one useful plan

The platform plan in [docs/platform](../../../docs/platform/README.md) owns product
and architecture decisions, and [open decisions](../../../docs/platform/open-decisions.md)
is the single list of what is unresolved. Requirement identifiers (R1 to R47) come
from the [PRD](../../../docs/platform/04-prd.md). Change a plan document when a
decision changes; do not start a parallel one. A short task keeps its plan in the
chat or the pull request.

Record only what the next contributor needs:

- Outcome, scope, and explicit exclusions or unresolved decisions.
- Ordered steps with owning paths, dependencies and observable proof.
- Consequential decisions and their reasons.
- Current progress, remaining work, and evidence or blockers.

Keep steps independently verifiable. Keep the live site and the catalog working
between steps: `bun run build && bun run test` passes at the root after each one.
For data work, follow the migration ownership in
[spec 3.3](../../../docs/platform/05-technical-spec.md#33-supabase-project-and-migration-ownership):
a migration file in this repository is not an applied migration.

## Execute and coordinate

When implementation is authorized, carry the accepted work through verification.
Do not add approval pauses after an arbitrary number of steps. Update the plan
when evidence changes the approach or reveals a real blocker.

For concurrent work, agree on owning paths and interface dependencies first. When
the user authorizes coordination with another session, send a bounded handoff with
the objective, files, contract and expected proof. Do not switch a shared branch,
stage another session's files, or start extra agents only because the plan has
several steps.

## Assess progress and close

Compare acceptance criteria with implementation and evidence, and mark each as
complete, partial, blocked or out of scope. A file existing is not completion.
Select proof from the [check ladder](../../../AGENTS.md#checks).

Record what changed, the checks actually run, remaining dependencies and the next
action. Keep implementation, commit, pull request, merge, deployment and live
verification separate; finishing one does not establish the others. Route
authorized commits and pull requests through [ship](../ship/SKILL.md). External
messages and issue updates follow the user's authorization, not the plan's existence.
