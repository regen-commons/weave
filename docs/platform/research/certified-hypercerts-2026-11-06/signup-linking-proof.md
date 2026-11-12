# Certified signup and existing-account linking: local proof passed

Scope note, 6 November 2026: this is a historical experiment report. The subsequent
[Certified-only decision](../../open-decisions.md#certified-only-sign-in-and-private-saving)
removes account linking, migration and email fallback from the build. Preserve the
observations below as evidence; they are not the current implementation plan.

On 6 November 2026, fresh Certified signup established a Weave session that saved
and reloaded a private initiative without a second Weave login. Explicit linking
also preserved an existing local Weave account and both of its saved initiatives.
After signing out, Certified-only sign-in returned to that same account and saved
work. This extends the [initial sign-in proof](sign-in-proof.md).

Evidence class: **local Supabase**, with live Certified authentication in the
**in-app browser (IAB)**. All initiatives were synthetic. The legacy Weave account
was a local fixture, authenticated through normal Supabase Auth. No production
account, deployment or configuration was changed.

## Observed results

| Journey or boundary | Result |
| --- | --- |
| Fresh Certified account | The user confirmed using an unused address or alias and completing signup. A distinct Certified identity returned to Weave. Account freshness is user-attested; no independent pre-signup lookup was performed. |
| Fresh private save | Save, identical retry and reload passed with revision 1; a full page refresh preserved the account and initiative. No public project or Ma Earth listing was needed. |
| Existing Weave account | A synthetic account held two pre-existing initiatives, one for community art and one for open research software. Native Supabase identity linking retained its account UUID. |
| Saved-work preservation | Both initiative IDs, revisions and canonical document hashes matched the baseline before linking, after linking, and after a later Certified-only sign-in and page refresh. |
| Routine return | After local sign-out, selecting the linked Certified identity and authorizing the same email scope established a normal Weave session. No Weave code or fixture login was used on that return. |
| Identity already bound elsewhere | Attempting to link the fresh identity to the legacy account returned `identity_already_exists`. The legacy account and its two saved initiatives remained unchanged; the identities were not merged. |
| Expired Certified consent | An expired authorization request failed. The existing account and both saved initiatives remained intact; restarting authorization allowed another attempt. |
| Other-account denial | A separate synthetic user could not read the fresh account's initiative: Weave API and load RPC returned 404, direct RLS returned no rows, and its initiative list was empty. |
| Unauthenticated and cross-origin linking | Requests failed; a callback without its browser binding could not establish a session or substitute an account. |
| Public bridge boundary | Authentication endpoints were exposed temporarily. Fixture controls, account API and preservation endpoints returned 404 through the public bridge. |
| Sign-out | The final browser session returned to the signed-out view. |

The fresh-account phase recorded one Certified callback, one Supabase session and
zero calls to Weave's email-code methods. After a bridge restart, the final phase
recorded two callbacks and two Supabase sessions: successful explicit linking and
the subsequent ordinary sign-in. It recorded one linked account, zero fixture
logins and zero second-login requests. Counters are per process; they are not a
total of all attempts. Earlier phases included an expired request, a rejected
identity collision and a bridge routing failure.

## What this establishes about one sign-in

New users can authenticate with Certified once and save privately in Weave.
Previously linked users can return through Certified alone. The chooser and
email-access consent still appeared during the return test; one authentication
flow does not mean one click or no permission prompts.

Linking a legacy account is a separate, one-time ownership task. This proof began
with an authenticated legacy fixture. Setup created that fixture locally and
opened a normal password-based user session; it did not exercise the production
Weave email-code journey. A signed-out legacy user may need a one-time legacy
ownership check before linking. The proof does not justify removing that check
or automatically joining accounts because their emails match.

The linking callback compared the resulting account UUID and complete saved-work
snapshot with the authenticated pre-link baseline before installing the resulting
browser cookie. Private saves and reads used user-scoped credentials throughout.
The local administrator key was used only for setup and negative-control users.

## Findings that affect implementation

**Supabase's default automatic email linking needs a deliberate decision.** Its
[identity-linking documentation](https://supabase.com/docs/guides/auth/auth-identity-linking)
describes automatic linking by verified email. That conflicts with this proposal's
explicit legacy-linking contract. The isolated Auth 2.197.0 test enabled manual
linking and used
`GOTRUE_EXPERIMENTAL_PROVIDER_LINKING_DOMAINS=custom:certified-poc=certified` to
separate this provider from the default email-linking pool. The pinned
[configuration source](https://github.com/supabase/auth/blob/v2.197.0/internal/conf/configuration.go)
defines this behavior. It is experimental self-hosted configuration, not proof
that the connected hosted Supabase project supports the same control. Hosted
support and the full same-email collision matrix remain rollout blockers.

**Switching Certified identities exercises OIDC session cleanup.** The first
switch reached `/session/end/confirm`, which the bridge's narrow route allowlist
rejected. The corrected harness delegates `/session/end`, `/session/end/confirm`
and `/session/end/success` to `oidc-provider` with its normal session and CSRF
validation. The corrected link and returning sign-in passed. Reverse switching,
multiple tabs and a broader session-switch regression suite remain open.

**Recovery needs durable state and clear restart behavior.** Test signing keys
were kept stable across server restarts. Preservation baselines were made durable
in private local files after the restart exposed that need. OAuth sessions and
interaction state are still disposable process memory. Production needs durable,
shared state, bounded expiry and a tested recovery path that retains drafts and
files. The unstyled diagnostic harness does not establish that product behavior.

## Reproduction and checks

The isolated harness is at `/private/tmp/weave-certified-linking-poc-20261106`.
It reuses the approved pinned dependencies from the first proof:
`@atproto/oauth-client-node` 0.5.16, `oidc-provider` 9.13.3 and Supabase CLI 3.0.0.
It uses the same pinned Weave API factories and private-account schema documented
in the [initial proof](sign-in-proof.md#reproduction-and-checks). No dependency was
added to the application workspace.

- `node --test identity.test.mjs round-trip.test.mjs linking.test.mjs local-boundaries.test.mjs linking-boundaries.test.mjs`: **27 passed** after the final bridge changes. Tests cover identity validation, preservation comparisons, save/retry contracts, anonymous denial, cross-origin rejection and missing callback bindings. Unit fixtures are not counted as live authentication evidence.
- `node check-other-account.mjs <saved-initiative-id>`: API, RPC, RLS and list denial passed for the fresh user's real browser save.
- Browser evidence: fresh save/reload and refresh; expired-request preservation; already-bound identity rejection; successful explicit link; sign-out, Certified-only return, refresh and preservation; final sign-out.
- Private screenshots and sanitized phase counters are retained under the harness's `runtime/` directory. Credentials, identity details and captures are excluded from this public repository.

## Remaining validation before rollout

V1–V3 remain partially open in the
[technical spec](technical-spec.md#10-acceptance-criteria-and-evidence-still-needed).
Validate hosted provider isolation, same-email and changed-email cases, concurrent
links, signed-out legacy migration through the actual email-code service, account
recovery and unlink/relink behavior. Complete callback replay/nonce, revocation,
refresh/expiry, outage and draft/file recovery tests, plus Safari, Chrome and PWA
coverage. Auth and session changes need a second review before merge.

This proof does not validate upstream project creation, team authority, external
initiative matching, inferred capabilities or confirmed offers.

After testing, the local provider was removed (DELETE 204, subsequent GET 404),
the proof server and temporary Cloudflare tunnel were stopped, and the disposable
signing keys were discarded. The public bridge returned HTTP 530. Only this
proof's Supabase stack was stopped, with data volumes preserved. No commit or
push was made.
