# Email-free Certified saving: local proof passed

On 6 November 2026, a newly created Certified account signed in once, saved a
private initiative and reloaded it after a full page refresh. Supabase held no
email or email-confirmation timestamp for that account. An independent account
could not read the initiative. Proof class: **local Supabase**, using the ChatGPT
in-app browser and real Certified authentication. The user attested that the
signup address was unused; account freshness was not independently checked before
signup.

The candidate uses an email-optional Supabase custom OIDC provider and omits email
claims from the identity bridge. This replaces the earlier experimental provider
linking-domain approach. The [technical spec](technical-spec.md#authentication-boundaries)
and [design spec](design-spec.md#one-sign-in-including-first-use) describe the intended
contract. The proof is isolated; no production API, schema or hosted configuration
has changed.

## Evidence available

The preceding synthetic OIDC experiment passed email-free sign-in, distinct
subject isolation, explicit linking to an existing account with two initiatives,
and returning sign-in with unchanged data. Its negative control confirmed that
`email_optional: true` still auto-links a supplied matching email. Those results
are protocol evidence, not real Certified signup or hosted end-to-end proof.

The new proof is at `/private/tmp/weave-certified-email-free-poc-20261106` and uses
Supabase Auth 2.197.0. It copies the account API at Funding Commons commit
`495e95ae6ea27521f355bc7f10af1488a1e290d9`, changing only the account email type and
parser to accept null. The private-account schema comes from the same pinned
website migration as the [initial proof](sign-in-proof.md#reproduction-and-checks).
An isolated SQL candidate extends `private.weave_actor()` to recognize the exact
trusted provider and issuer/DID subject in `auth.identities`. It preserves existing
confirmed-email access, session ownership/expiry, non-anonymous status, private
row ownership, revisions, quotas and idempotency, and rejects banned users.

Private commands use the person's Supabase token. Setup uses local administrator
access; no service-role key enters the save/load path. Identity metadata supplied
by a user is not an authorization source. Email confirmation remains enabled,
and no experimental provider-linking setting is used.

The bridge requests `atproto` only, verifies issuer and session DID, and constructs
OIDC identity claims with `sub` only. It never synthesizes an email or verification
claim. Provider configuration uses `email_optional: true`, `openid`, PKCE and normal
nonce verification. The app and database stay local; only the authentication bridge
uses the previously approved temporary HTTPS tunnel.

## Validation results

- `node --test identity.test.mjs round-trip.test.mjs local-boundaries.test.mjs`: 24 passed, including absence
  of email claims, rejected identity mismatches, nullable account data and the
  existing save/retry/document-comparison contract, anonymous HTTP/RPC denial, cross-origin rejection and missing callback bindings.
- `access.test.sql`, executed with `ON_ERROR_STOP=1`: 60 single-row results and a
  rollback, with no errors. The owner fixture had no email and a trusted identity.
  Checks covered save/load, private visibility, retry/revision conflicts, quotas,
  cross-account RPC/RLS denial, forged metadata, unknown providers, wrong issuer,
  removed identity, anonymous/banned users and revoked/expired sessions. Some
  returned rows are setup/results rather than distinct assertions.
- Live provider readback confirmed `email_optional: true`, PKCE enabled and nonce
  checking enabled. Published AT client metadata requests only `atproto`. Private
  app/API/proof endpoints returned 404 through the public bridge.
- The user completed Certified signup and consent in the browser. The proof then
  saved and reloaded the complete synthetic initiative, retried the same save
  command without changing revision 1, and compared the canonical document.
- After a full page refresh, the same session loaded the same initiative. The
  preservation check confirmed the account UUID, initiative ID, revision and full
  document hash were unchanged.
- The bridge recorded one Certified callback, one email-free OIDC token and one
  Supabase session, with zero email claims, fixture logins or second-login requests.
  A database check confirmed the owner had neither an email nor an
  email-confirmation timestamp. This run exercised fresh saving, not legacy linking.
- `node check-other-account.mjs <synthetic-initiative-id>` signed in an independent
  local test user. The account API and direct load RPC both returned 404; direct
  row access and the initiative list exposed zero matching entries.
- `node --check server.mjs` and `node --check client.mjs` passed. Node executed the
  copied TypeScript API during the tests; no standalone TypeScript compiler was
  available for a static typecheck. `bun run guidance:check` and `git diff --check`
  passed for the documentation.

## Cleanup

Browser sign-out returned the proof to its signed-out view. The database retained
the private initiative and showed zero active sessions for its owner. The local
custom provider was deleted (204), with a subsequent read returning 404. The
temporary tunnel and both proof listeners stopped; public discovery returned 530.
The disposable bridge signing key was removed. Only this proof's Supabase stack
was stopped, preserving its local data volumes. Credentials and private captures
remain outside the repository.

## Limits and rollout gates

This is a diagnostic proof, not the finished Weave interface. The subsequent
[Certified-only decision](../../open-decisions.md#certified-only-sign-in-and-private-saving)
removes account migration and linking from the build. Its stricter access rule must
remove this proof's confirmed-email alternative and reject email-only sessions.
Hosted staging, returning Certified access and second-browser Load, concurrency,
callback replay, durable keys/state, expiry/refresh/revocation,
provider outages, drafts/files and broader browser/PWA coverage remain open. Auth and
session changes require a second review before merge.

Account recovery must preserve identity and saved-row ownership. The same Certified
identity must regain access; Weave has no email-code fallback or account-transfer
flow. Optional
contact details belong to a separate consented contact service and must not be
copied into authentication claims or used for silent account merging.
