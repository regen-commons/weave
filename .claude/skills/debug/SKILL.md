---
name: debug
description: Diagnose and fix Funding Commons or Weave failures, from the live site and catalog import to design-system checks and workspace tooling, with a reproducible symptom and evidence of the cause. Use for bug reports, failing tests or unexpected behavior.
---

# Debug Funding Commons and Weave

Read the [root guide](../../../AGENTS.md) and the owning scoped guide. Keep the
requested posture: an investigation reports findings, and an authorized fix
includes implementation and verification. Urgency does not authorize deployment,
merging or live data changes.

## Reproduce at the failing boundary

Capture expected and observed behavior, the route or command, inputs and
environment. Use synthetic equivalents for private records, and keep tokens,
codes and contact details out of logs and shared evidence. Inspect focused diffs
and history rather than assuming a concurrent edit caused the failure.

- **Visible UI or interaction:** start with the rendered page and the actual
  control. Inspect geometry, computed styles, focus, event handling and whether
  state changes. Trace into the script and data only as evidence requires.
- **Catalog import or matching:** start with the failing record, its research
  input and the importer output. A failed retrieval is not a closure, and an
  opportunity is never an eligibility decision. The importer judges deadlines as
  of `--as-of`; check which instant a failing comparison used.
- **Checks and tooling:** check Bun 1.4.2, Node 24, the package scripts, the
  lockfile, port ownership and whether ignored build output (vector files, model
  assets) is stale before changing dependencies or configuration.

## Test a concrete hypothesis

Establish a repeatable signal that fails for the reported symptom, not for an
unrelated setup problem. State a specific cause and run a small check that could
disprove it. Change one causal variable at a time. If successive fixes do not
move the signal, revisit the hypothesis instead of stacking workarounds. Record
what is unknown when reproduction is unavailable.

Read the full failure before treating a generic error as a diagnosis. Distinguish
a rejected request, a provider failure, empty data and a rendering failure. For
writes, distinguish confirmed persistence from an uncertain response; a retry can
duplicate a remote write.

## Fix and prove the result

Apply the smallest coherent fix within the authorized scope. Add a regression check
at the layer that owns the defect when it protects meaningful behavior, and show
that the original trigger fails before the fix and passes afterwards when feasible.
Check direct consumers for the same cause without widening into unrelated cleanup.
Use [plan](../plan/SKILL.md) when the repair needs a consequential design decision.

Run the checks the [ladder](../../../AGENTS.md#checks) names for the change, then
repeat the original failing flow. For UI fixes, inspect the rendered interaction
and its empty, loading and error states at the affected widths. Report the cause,
the fix, the exact evidence and any remaining uncertainty. Do not claim the
original symptom is fixed on the strength of a different passing test.
