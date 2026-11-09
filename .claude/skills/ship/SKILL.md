---
name: ship
description: Validate and commit Funding Commons or Weave changes, or push and open a draft pull request when asked. Use for explicit commit, publication or readiness requests; ordinary coding does not authorize Git publication.
---

# Commit and publish changes

Use the [root guide](../../../AGENTS.md) and the user's authorized scope. Finish only
the requested stage: a commit request ends with a verified local commit, and a
push or draft pull request request includes the steps to publish it. A readiness
question or dry run performs checks without changing Git. Do not ask again for
actions the user has already authorized. Merging, deployment, remote schema
changes and messages to other people need their own authorization.

## Establish ownership and Git context

Inspect the current branch, `git status --short`, the staged diff and the task's
paths. Before publishing, verify the remote, any existing pull request and its base
and head. Use the pull request's base when there is one; otherwise check the
remote's default branch. Work for the platform plan targets `docs/tend-platform-plan`
until that branch merges, and stacked pull requests target the previous step's branch.

In a shared checkout, coordinate staging and commit timing with the other session.
Leave its files and index entries alone. A dirty tree outside the task's paths does
not by itself block a bounded commit. Name a new branch for the harness and the
work, such as `claude/<topic>` or `codex/<topic>`; the catalog routines use `codex/`.

## Validate the actual change

Inspect the complete proposed diff, including new files, and run what the
[check ladder](../../../AGENTS.md#checks) names for it. Before a push, run the
ladder's "Before push" row, which is what CI runs.
Documentation and guidance changes need their links, referenced commands and skill
metadata checked, not the application suites.

Validate a self-contained snapshot when unrelated working changes could hide a
missing file. Label working-copy proof honestly and record unresolved checks; a
failed required check blocks a completion claim.

## Make the bounded commit

Stage exact task paths, never `git add -A` or `git add .`, then inspect the whole
cached diff and run `git diff --cached --check`. Exclude credentials, private
records, local build output and unrelated changes. Keep the `.agents/skills`
symlink and its canonical `.claude/skills` files. Commit `bun.lock` with any
manifest change.

Use `type(scope): description` in the imperative mood, under 72 characters, with
no trailing period. Scopes in use: `platform`, `design`, `agent`, `client`.
`docs(agent)` fits guidance and skills. After committing, check that the commit
holds the task's files and that other sessions' changes are untouched. Do not
amend published commits, rewrite history or force-push to get around a conflict.

## Publish only when asked

Push the verified branch normally and open the pull request as a draft with a
conventional title under 70 characters. Catalog routine pull requests carry the
`automated/codex` label; others need none. Keep the body to behavior, reasons,
verification results, limits and anything that needs a person, and use a body file
for multiline text. Name each new dependency and why it is needed.

Verify the published pull request's head SHA, then read CI for that exact revision.
Report pending or failed CI, and skipped or failed preview deployments, separately
from local checks. The live project's Ignored Build Step skips previews by design;
record it as skipped and do not change deployment settings to clear it.

Finish with the commit SHA, branch, scope, proof and the push or pull request
result. Keep local commit success, CI status and deployment status distinct.
