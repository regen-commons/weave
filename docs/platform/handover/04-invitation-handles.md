# Codex task: show who asked to join a team workspace

Repository: `regen-commons/weave`. Read [AGENTS.md](../../../AGENTS.md), then
[packages/api/AGENTS.md](../../../packages/api/AGENTS.md) and
[packages/app/AGENTS.md](../../../packages/app/AGENTS.md).

## Outcome

When someone claims a workspace invitation link, the admin's Manage teammates dialog
names them by their verified Certified handle, such as "orchard.certified.one asked to
join.", instead of "Certified account ending abc123". The handle shows only when it
verifies both ways: the DID document lists the handle, and the handle resolves back
to the same DID. Otherwise the dialog keeps today's wording. Approving still acts on
the claimed DID, never on the handle.

## Present state (checked on `develop` plus regen-commons/weave#39)

- `list_invites` in `packages/api/src/workspace-invites.ts` returns each invitation's
  `claimedDid`, read through `weave_workspace.invitation_summary` in
  `supabase/candidates/weave-workspace-invites.sql` and validated by `inviteSummary`.
- `packages/api/src/certified-project-provider.ts` already has `resolveHandle(handle)`,
  which resolves a handle to a DID and then requires the DID document's `alsoKnownAs`
  to contain `at://handle`, and an internal `actorProfile(did)` that reads the DID
  document's `at://` alias. It contacts only approved PDS origins.
- `packages/app/src/initiative/WorkspaceAccess.tsx` renders the pending list; its
  `account` helper writes "Certified account ending …".
- Adding a teammate by handle (`project-commands.ts`) already uses `resolveHandle`.

## Scope

1. **Provider.** Add a method such as `verifiedHandle(did)`: read the DID document's
   `at://` handle alias, call `resolveHandle` on it, and return the handle only when it
   resolves to the same DID. Keep the approved-origin rule and the existing deadlines.
2. **List handler.** For each invitation with status `claimed`, add an optional
   `claimedHandle` from `verifiedHandle(claimedDid)`. Run lookups at most five at a
   time, as `listMemberships` does, inside the handler's 15 second deadline. A failed,
   slow or mismatched lookup leaves that invitation without a handle and never fails
   the list.
3. **Contract and parsing.** Accept the optional `claimedHandle` wherever invitation
   summaries are validated, in the API and in the app
   (`packages/app/src/initiative/workspace-access-state.ts` and the live adapter), and
   reject a malformed value as the existing validation does.
4. **Interface.** In `WorkspaceAccess.tsx`, show "{claimedHandle} asked to join." when
   it is present and keep the current wording otherwise. "Approve …" keeps sending
   `recipientDid: claimedDid`.
5. **Fixture.** In the app-fixture server, give the admin's claimed invitation a
   verifiable handle and keep one claim without one, so both states show locally.

Out of scope: storing handles in the database (resolve them when listing), changing
the SQL candidate, approval and revocation rules, other screens, and deployment.

## Boundaries

- Keep the production pilot off. Do not deploy, apply migrations, or change
  authentication settings or tester gates. Add no dependencies.
- A handle is public profile metadata, never authority. Every access decision keeps
  using DIDs.
- Start a branch from `develop` after regen-commons/weave#39 merges, because that pull
  request changes `WorkspaceAccess.tsx`. Open a pull request into `develop` and do not
  merge it.

## Evidence

- API tests in `packages/api/src/workspace-invites.test.ts` and the provider tests: a
  verified handle is returned; a missing alias leaves it out; a handle that resolves to
  a different DID leaves it out; an unavailable or slow provider still returns the list
  without handles; no more than five lookups run at once.
- An app test for parsing: `claimedHandle` is optional and a malformed one is rejected.
- `bun run --filter @weave/api test`, `bun run --filter @weave/api typecheck`,
  `bun run --filter @weave/app test`, `bun run --filter @weave/app typecheck`, then
  `bun run ci` and `git diff --check`.
- A rendered check with the app-fixture server
  (`WEAVE_ACCOUNT_FIXTURE=1 bun run --filter @weave/app dev`, then `/__fixture` and the
  admin account): the dialog shows the handle for the verified claim and the fallback
  for the other, at 360 px and 1280 px. Label this proof "fixture".

## Stop condition

Done when these checks pass and the pull request is open with the fixture proof and a
note of what still needs hosted checks. Stop and report instead of guessing if the
Certified identity service cannot provide a member's DID document alias, or if
verifying handles would need a new origin or a schema change.
