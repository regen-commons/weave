---
name: review
description: Review a Funding Commons or Weave diff, branch, pull request or named files for regressions, requirement gaps, design-system drift and verification quality. Use for change reviews and readiness questions; stay read-only unless fixes are authorized.
---

# Review Funding Commons and Weave changes

Read the [root guide](../../../AGENTS.md) and the applicable scoped guides. Resolve
the reviewed paths or commit range and the requirement baseline before drawing a
conclusion. Use the user's request, explicit acceptance criteria, the pull request
description and the relevant [platform plan](../../../docs/platform/README.md)
requirement. Never infer requirements or issue identity from a branch name alone.

For working-copy review, inspect staged, unstaged and relevant untracked files.
For a pull request, verify its actual base and head and inspect the complete
changed range; stacked pull requests are based on another feature branch. Report
the scope and any unreviewed part. Read direct callers and affected contracts, and
keep a focused review bounded to that change.

## Check regressions and boundaries

Trace observable behavior through the owning layers. Prioritize these when the
diff touches them:

- **The live site and catalog.** Every existing record, all original identities and
  every program and source revision are retained. Generated catalog output changes
  only through the importer. Opportunity is never presented as eligibility.
- **Privacy and the public repository.** No secrets, contact details, private
  captures or private call content. Drafts stay on the device until saved; saved
  initiatives are private until shared.
- **Authorization and data.** Read every changed line in auth, consent, row-level
  security, cloud AI and sharing paths. Mocked authorization proves nothing about
  SQL policies.
- **Async and failure states.** Save feedback, duplicate or retried writes, stale
  async results, and separate loading, empty, error, offline and retry states.
- **Tooling and guidance.** Changes to dependencies, the lockfile, CI, hooks, agent
  instructions or checks that weaken a check, widen permissions or rely on an
  uncommitted companion file.

For a new abstraction, compare the closest existing implementation and the actual
behavior gap. Report concrete coupling or maintenance harm, not a preference. For
tests, ask which distinct failure each assertion catches.

## Check the design

For any screen, component, CSS or copy change, apply the
[five-minute review](../../../DESIGN.md#how-we-follow-them) on a rendered page at
360 px and at a wide width, in both themes. Larger changes use the
[review checklist](../../../packages/design-system/principles/ui-review-checklist.md). Flag
raw values instead of tokens, one-off components where a pattern exists, colour as
the only signal, hover-only actions, unlabeled inputs, controls that do not work
yet, and copy that breaks [VOICE.md](../../../packages/design-system/brand/VOICE.md).

## Obtain proportionate evidence

Run the targeted, non-destructive checks needed to establish or reject findings,
using the [check ladder](../../../AGENTS.md#checks). Report commands, results, the
tested revision or working-copy state, and material limits. Label rendered proof
with its class (`fixture`, `local Supabase`, `preview` or `production`) and the
browser; fixture proof never counts as live proof.

For an explicit readiness question, require the applicable local proof and passing
CI on the pull request's current head. Pending, failed or stale-head checks do not
support approval. Do not post a GitHub review unless the user asks for one.

## Report and close findings

Lead with actionable findings in severity order. Each needs a path and line, the
concrete failure or missing requirement, its impact and a credible next step.
State evidence gaps separately. If there are no findings, say so with the reviewed
scope and its limits instead of inventing issues.

When fixes are authorized, address the root cause, check direct consumers for the
same cause and rerun the relevant proof. Review permission alone does not
authorize edits, issue creation, merging, deployment or publishing comments.
