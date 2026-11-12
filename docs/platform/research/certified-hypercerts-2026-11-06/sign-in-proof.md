# Certified sign-in: local proof passed

Scope note, 6 November 2026: this is a historical experiment report. The subsequent
[Certified-only decision](../../open-decisions.md#certified-only-sign-in-and-private-saving)
removes account linking, migration and email fallback from the build. Preserve the
observations below as evidence; they are not the current implementation plan.

On 6 November 2026, a real Certified sign-in established a normal Supabase Auth
session and saved a private initiative through Weave's existing account API.
Reloading the page and loading the same initiative worked without a second Weave
login. This proves the integration path in an isolated environment; it does not
approve a production rollout or close every identity validation gate.

Evidence class: **local Supabase**, with live Certified authentication in the
**in-app browser (IAB)**. The initiative was synthetic. No Ma Earth listing,
Certified project creation, public initiative or membership was required.

## Observed results

| Boundary | Result |
| --- | --- |
| Certified identity | Validated issuer and DID, with confirmed email from the authenticated AT session |
| OIDC exchange | Signed ID token containing the consented, verified email established a regular Supabase session |
| Second Weave login | Zero calls to Weave's email-code methods; those methods were disabled in the harness |
| Private save and load | Full document comparison passed under the same account |
| Retry | Repeating the identical save command kept revision 1 |
| Browser refresh | Same saved initiative loaded with HTTP 200 after a full page reload |
| Database state | Visibility was `private`; revision remained 1 |
| Other account | A separate synthetic Auth user received 404 from both the Weave load API and direct load RPC; RLS returned no rows and its initiative list was empty |
| Sign-out | Browser returned to signed-out state; the saved initiative's owner had one Auth session before sign-out and zero afterward |
| Public exposure | Bridge metadata was reachable; Weave's account API and initiative JSON returned 404 through the tunnel |

The successful attempt recorded one Certified callback, one ID token with verified
email claims, one Supabase session and zero second-login requests. There was an
earlier failed integration attempt, followed by a corrected attempt that reused
the Certified session and required renewed consent. Do not describe the entire
debugging session as a flawless first attempt or as a prompt-free experience.

## Findings that change the implementation plan

1. **A public HTTPS bridge is needed for this Supabase version.** Auth 2.197.0
   rejects HTTP, loopback and private-network OIDC provider URLs. Local HTTPS alone
   was insufficient. The user approved a temporary Cloudflare tunnel for the
   authentication bridge; the app and database stayed local. See the
   [release's URL validator](https://github.com/supabase/auth/blob/v2.197.0/internal/utilities/url_validator.go).
2. **Include verified email in the ID token.** Supabase reads that token when
   present and does not fall back to user-info for a missing email. The first
   attempt failed on this boundary. Setting `conformIdTokenClaims: false` in
   `oidc-provider` included the consented email claims and the corrected flow
   passed. Email verification was not bypassed or synthesized. See the
   [custom OIDC provider implementation](https://github.com/supabase/auth/blob/v2.197.0/internal/api/provider/custom_oauth.go).
3. **Keep client keys stable across restarts.** The disposable bridge initially
   regenerated keys. The corrected attempt used privately persisted test keys and
   versioned AT client metadata. Production needs durable keys, rotation and
   shared OAuth state, not the experiment's process memory.
4. **Identity is enough for a private initiative.** The tested path requested
   `atproto transition:email`; saving used only Weave commands and the person's
   Supabase token. Public-project creation and write permissions were unnecessary.

## Reproduction and checks

The isolated implementation is at `/private/tmp/weave-certified-poc-20261106`.
It pins `@atproto/oauth-client-node` 0.5.16, `oidc-provider` 9.13.3 and Supabase CLI
3.0.0, with a Bun lockfile. These are experiment dependencies, not additions to the
application workspace.

The harness imports Weave's account factories from Funding Commons commit
`495e95ae6ea27521f355bc7f10af1488a1e290d9`. It uses the website's private-account
migration at `f01902329226ca1c396871904ce47af34f96eff9`, with its existing private
schema and usage-grant prerequisites. Production URL guards remain unchanged.

- `node --test identity.test.mjs round-trip.test.mjs local-boundaries.test.mjs`:
  17 passed, covering identity rejection, save/reload contracts, anonymous access,
  cross-origin save rejection and callbacks without browser state.
- `access.test.sql`, run in local PostgreSQL with `ON_ERROR_STOP=1`: 51 check
  results, no errors and a rollback. Synthetic sessions exercised ownership,
  revisions, idempotency, input validation, quotas and revoked/expired sessions.
  Unrelated steward activation and membership-table checks were omitted.
- `node check-other-account.mjs <saved-initiative-id>`: API, RPC, RLS and list
  denial passed against the initiative saved by the real Certified session.

The local administrator key was used for setup and a negative-control identity.
Private saving and loading used user-scoped credentials. No token, email address
or private identity is included in this report.

## What remains open

V1–V3 in the [technical spec](technical-spec.md#10-acceptance-criteria-and-evidence-still-needed) remain partially
open. The [follow-up proof](signup-linking-proof.md) subsequently passed fresh
Certified signup, explicit local legacy linking and Certified-only return with
saved work intact. Hosted auto-linking behavior, the full collision and recovery
matrix, actual legacy email-code migration, durable identity binding,
refresh, upstream revocation, complete callback replay/nonce tests, provider
outages, draft recovery, and Safari/Chrome/PWA coverage remain open. The diagnostic page is not
the finished Weave interface or its responsive/accessibility acceptance proof.

The proof does not validate public project creation, team authority, matching
quality, inferred capabilities or offer confirmation. Those have separate gates.

After testing, the public tunnel and proof server were stopped, the local test
provider was removed, and the test signing keys were discarded. The public URL
returned HTTP 530. Only this proof's Supabase stack was stopped; its data volumes
were preserved. No production configuration, deployment, commit or push occurred.
