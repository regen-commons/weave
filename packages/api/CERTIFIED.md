# Certified authentication bridge

This implements Certified sign-in and private saving on the baseline
`495e95ae6ea27521f355bc7f10af1488a1e290d9`. Certified is the only intended Weave
sign-in. This bridge has no email-code, account-linking, migration, private-initiative
or fixture endpoint. The app uses `/api/sign-in` for the redirect and callback, and
`/api/account` for explicit private Save, Load and sign-out. Email-code actions are
removed.

## Runtime boundary

### Shared hosted test

Use the existing shared Supabase project `ztygpuzldujfsqrubxic` for the hosted
Certified test and launch. Its exact relying-party callback is
`https://ztygpuzldujfsqrubxic.supabase.co/auth/v1/callback`. Keep the provider,
issuer and durable signing-key set across redeploys. Leave the website's
existing Site URL and provider settings in place. The isolated credentials and
signing keys below are specific to the earlier proof.

The `Platform` project already had `20261105082413_weave_private_accounts`.
Migration `20261108031732_weave_certified_private_access` installed the
Certified-only access rule and state tables. The prior email-owned initiative was
confirmed to be test data and its row was retained. Migration
`20261108032041_weave_platform_runtime_logins` provisioned the two restricted
logins. Both credentials were rotated and verified over TLS. The shared test
uses `https://auth.regencommons.com` as issuer and
`https://weave-private-preview.vercel.app/api/sign-in` as the Weave return URL.
Allow `https://weave-private-preview.vercel.app/api/sign-in\?state=*` in
Platform's redirect settings so Supabase preserves the one-time state query.
The callback checks the state against the browser cookie and consumes the
attempt once. A hosted check confirmed that Platform still rejects other paths.
Supabase's provider registration uses client ID `weave-platform`. Attach the
issuer hostname to the bridge project and add Vercel's recommended `auth`
CNAME in Namecheap. Preserve the existing Resend records beneath that name.
Verify issuer discovery and the public key IDs before enabling the provider.

The optional email field requires the same `WEAVE_CERTIFIED_EMAIL_HINT_KEY`
on the bridge and app. Use a dedicated random 32-byte base64url key. Deploy the
bridge with the key before enabling the field on the app. The encrypted hint
expires after two minutes and can be used once. The OAuth client registers the
request without the email. The bridge adds the address only to the redirect to
`https://auth.certified.one/oauth/authorize`. The app discloses that the URL
may appear in browser history and request logs. Enable this key only for the
approved hosted test. Verify the code screen and the blank-field path there.

### Earlier isolated Vercel proof

Weave Preview is healthy in `us-east-1` on Postgres 17. Migration
`20261108001446_weave_preview_certified_private_saving` installed private saving,
the Certified access rules and the two restricted runtime role groups together.
Its baseline came from the pinned [website migration][preview-baseline], which
is on the website feature branch. The hosted SQL check saved two synthetic
initiatives, revoked the first session, loaded both with a new session for the
same account and denied access to another account and an email-only session.
The transaction rolled back and left zero Auth users and initiatives. RLS and
grants were checked on all ten tables. The two informational findings concern
private save bookkeeping tables that intentionally deny client access.

[preview-baseline]: https://github.com/regen-commons/regen-commons-site/blob/3a37d9230886a7c6b54711a7fb01afece7d884be/supabase/migrations/20261105082413_weave_private_accounts.sql

[Weave Preview dashboard](https://supabase.com/dashboard/project/jivfrekegfqgepvmmbdg)
was the isolated proof target. API origin: `https://jivfrekegfqgepvmmbdg.supabase.co`.
Register exactly `https://jivfrekegfqgepvmmbdg.supabase.co/auth/v1/callback` as
the bridge relying-party redirect when provisioning its client. Project identifiers
and callback addresses are public configuration; credentials belong in secret stores.

| Component | Recommended preview configuration |
|---|---|
| App | Dedicated Vercel project `weave-private-preview` (`prj_K5dueoJhw4aMHxJQIpdf0oKAkKcz`) at `https://weave-private-preview.vercel.app`. Use `https://weave-private-preview.vercel.app/api/sign-in` as the exact return address. |
| Bridge issuer | `https://weave-certified-preview.vercel.app`. Use this stable project alias for the proof. Each build has its own deployment URL. |
| Bridge host | Dedicated non-production `weave-certified-preview` Vercel project `prj_WsAs3fh2suORqdp7sVZG4CONPzMu`, Node 24 in `iad1`. The project's primary alias tracks the latest deployment. |
| Auth and database | Created: separate `Weave Preview` project `jivfrekegfqgepvmmbdg` in the Regen Commons Free organization, `us-east-1`. No Website data or Auth configuration is copied. |
| Provider | `custom:certified`, client ID `weave-preview`, `openid`, `email_optional: true`, PKCE on, nonce checks on. Certified scope remains `atproto`. |
| Callback registrations | Bridge relying-party redirect is exactly the new project's `/auth/v1/callback`. App return is the fixed preview origin's `/api/sign-in`; verify the generated state query is preserved without enabling wildcard origins. |
| Persistence | Preview-only Postgres state, signing material and independent app/bridge restricted logins. Store wrapping keys, lookup keys and client secret in host secret stores with an operator recovery copy. Never regenerate on deployment. |

This isolated proof used its own keys, relying-party credentials and database.
The shared test now uses the stable issuer described above.

Vercel detects `packages/api/server.ts` as a Node server. Deploy with
`packages/api` as the project root, workspace source enabled, and
`bunx bun@1.4.2 install --frozen-lockfile --filter @weave/api` from the workspace
root. The proof used an allowlisted
source upload with the workspace manifests, lockfile and bridge code. The function
requires the stable issuer Host and an HTTPS forwarding header. It discards
incoming forwarding metadata and caps requests per instance. Each warm instance
keeps up to two database connections. Expired state is rejected by the database
and pruned on traffic instead of by a persistent timer.

Vercel marked deployments `dpl_By8d1jL2HFJcy6PBmaphvz3My3UV` and
`dpl_uTBtV36fGHku35stgZu37wy5h9yC` ready. The in-app browser reached the stable
alias before and after the redeploy. Both builds returned `sign_in_unavailable`
as expected before provisioning credentials. The second versioned deployment
URL required Vercel login. The hosted keys, sign-in callback and app save/reload
still need verification.

The preview source bundle pins Bun 1.4.2 because Vercel's default Bun 1.3.14
cannot read this lockfile. The app deployment includes its `api/*.ts` entries
directly so Vercel detects the functions before extracting the archive.
Both runtime logins passed TLS and privilege checks, and the bridge decrypted
the stored signing keys. Bridge deployment `dpl_7aJhSqxRR75XSePwT2yRP6pmuY6w`
serves discovery, public keys and Certified client metadata. App deployment
`dpl_DDdEDMJL1rT3Ypmb1ghdaeZZhYYq` passed hosted sign-in state, cancellation and
replay checks. Supabase provider registration, return URL and Data API exposure
still need configuration before the fresh account test.

Provisioning order:

1. The preview project and schema are ready. The source migration and both
   candidates ran as one transaction. The authorization proof used synthetic
   sessions and the resulting accounts and initiatives were rolled back.
2. Add only `weave` to the Data API's exposed schemas and keep the migration's
   existing narrow grants. Verify a signed-out request is denied before testing
   an authenticated request. Keep `private` and `weave_auth` out of the API.
3. Provision preview-only secrets and signing keys once through an operator
   database connection. Keep the owner password out of migration history and
   deployment settings. For IPv4 use the
   project's session pooler with the custom login name in `role.project_ref` form.
   Verify the certificate and hostname from each host. If Node needs the Supabase
   root certificate, add the certificate from the project dashboard to the
   host's trust store. Verify each login can access only its own state.
4. Deploy the app preview and redeploy the Vercel bridge with preview-scoped
   secrets. Confirm discovery and both public key sets are readable at the stable
   alias without a hosting login. Check the intended host's logs for accidental
   exposure of authentication queries or bodies.
5. Register the exact Supabase and app callbacks and create the email-optional
   provider after the bridge is reachable. Disable other preview providers and
   manual linking while keeping Certified signup enabled. Set the authorization
   parameter `prompt=login` so a new Weave sign-in reaches Certified even when the
   bridge still has a session. Verify this on the hosted provider. Enable app sign-in
   after readiness and external discovery and key checks pass.
6. Create a fresh Certified identity in the browser, save two synthetic initiatives,
   record account/initiative identifiers and revisions privately, then sign out.
   Revoke the old session, sign in again and explicitly load both saved documents.
   Compare identifiers, revisions and content; check a second browser and another
   identity's denied access. Repeat after a bridge redeployment without new keys.
   Check that email remains absent and no extra Weave credentials are requested.

No production credentials or real initiative content belong in this preview. Its
Free Supabase project may pause after inactivity; retain it through the testing
period and export synthetic evidence before any explicitly authorized teardown.
Hosted signup, re-entry, isolation and restart results remain unverified.

Sources: [Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers),
[Vercel Node servers](https://vercel.com/changelog/deploy-node-servers-with-zero-configuration)
and [Vercel forwarding headers](https://vercel.com/docs/headers/request-headers).

The maintained OIDC provider uses native Node request/response objects. The bridge
has a Vercel Node entry and a standalone process entry, `src/certified-server.ts`.
The standalone listener defaults to loopback behind trusted HTTPS ingress.

Ingress must preserve the configured Host and overwrite `X-Forwarded-Proto` with
`https`; it must discard caller-supplied forwarding headers, enforce request/rate
limits and disable URL/query/body logging on authentication routes. No initiative
content passes through this process. OAuth callbacks and token exchange are protocol
endpoints; the existing same-origin JSON rule still applies to private app writes.

Only the registered Supabase relying party and `openid` scope are allowed. Certified
uses the AT `atproto` scope. After the AT client validates the session, the bridge
checks issuer and DID again, issues subject-only identity claims and deletes its
stored AT session. No persistent PDS write permission or email access is requested.
The OIDC session/grant expires after one hour. Provider consent for this fixed
identity-only relying party is completed by the bridge after Certified authorization.

## Durable state

`supabase/candidates/certified-bridge.sql` is a candidate for the website migration
owner, not an applied production migration. It creates a private `weave_auth` schema,
enables RLS and grants only the bridge runtime role access. It grants that role no
access to initiative or Auth user tables. Use a dedicated LOGIN that inherits
`weave_auth_runtime`; do not use a database owner, BYPASSRLS role or service-role key.
The production entry refuses a role that can provision signing settings.

Records are encrypted with AES-256-GCM. Issuer, record namespace and key hash are
authenticated as associated data. Identifiers and secondary indexes use HMAC, with
a separate stable lookup key. Expiry uses the database clock. Take and consume are
atomic; consumed records cannot be revived by upsert. Grant revocation takes the
same transaction lock as grant writes and leaves a bounded tombstone rejecting late
writers. Advisory transaction locks also coordinate AT refresh between instances.
Nested store calls share their transaction through async context. SQL and network
operations have deadlines. Expired records are pruned every minute while running.

## Configuration and provisioning

Set these through the deployment's secret/configuration service, never a checked-in
file or chat. The scripts do not load `.env` files.

| Variable | Contract |
|---|---|
| `WEAVE_AUTH_ISSUER` | Fixed HTTPS origin. Changing it is not a key rotation and breaks identity continuity. |
| `WEAVE_AUTH_CLIENT_ID` | One registered Supabase OIDC client identifier. |
| `WEAVE_AUTH_CLIENT_SECRET` | At least 32 characters, shared with that relying party only. |
| `WEAVE_AUTH_REDIRECT_URI` | Exact HTTPS Supabase Auth callback. No wildcard redirect. |
| `WEAVE_AUTH_DATABASE_URL` | Dedicated restricted runtime connection. Remote connections require certificate-verified TLS; no SSL query override. |
| `WEAVE_DATABASE_CA_PEM` | Supabase's published database CA in PEM format. Set it on both Vercel preview projects so Node can verify the pooler's certificate and hostname. |
| `WEAVE_AUTH_ENCRYPTION_KEYS` | Secret JSON: `active` wrapping-key ID, `keys` mapping IDs to 32-byte base64url keys, and a separate 32-byte base64url `lookup` key. |
| `WEAVE_AUTH_PORT` | Loopback listener, default 4531. |
| `WEAVE_AUTH_INGRESS` | Defaults to `loopback`. Set to `render` only behind Render's HTTPS load balancer. |
| `PORT` | Required platform-assigned listener port in Render mode. |

Generate wrapping/lookup secrets with the secret manager and retain recovery copies.
The database stores only encrypted signing material. On an authorized environment,
apply the reviewed schema and create the restricted login. In a separate operator
process with an owner connection and the same wrapping secrets, provision once:

```sh
bun run --filter @weave/api auth:keys provision
```

Provisioning is insert-only and refuses to overwrite existing keys. Restore the
runtime connection before starting the bridge:

```sh
bun run --filter @weave/api auth:bridge
```

Startup fails if keys are absent, corrupt, encrypted under missing secrets, or bound
to another issuer. It never generates replacement keys. Do not configure hosted
Supabase or enable deployed sign-in until the issuer has passed preview verification.

## App callback and private access

The website migration owner must review `supabase/candidates/certified-private-access.sql`
after the existing private-saving migration. It replaces Weave's access predicate:
only the stored `custom:certified` identity with a validated issuer/DID subject can
access private commands. Confirmed email and editable user metadata grant nothing.
The predicate also checks JWT expiry, the actual nonanonymous and unbanned user,
and the current, unexpired Supabase session. Existing RLS and save-command ownership,
revision and idempotency checks remain authoritative. No saved row is reassigned.

Configure Supabase's custom OIDC provider as `custom:certified`, with the bridge's
fixed HTTPS issuer/client credentials, `email_optional: true`, `scopes: ["openid"]`,
PKCE enabled and nonce checks enabled. Register exactly the app's `/api/sign-in`
callback. The app adds a random state query; verify its preservation in preview.
Keep website/steward providers unchanged. These settings are an operator release
step, not an automatic part of starting this application.

Server-only app configuration:

| Variable | Contract |
|---|---|
| `WEAVE_ACCOUNTS_ENABLED` | `true` only for a configured, validated environment. |
| `WEAVE_APP_ORIGIN` | Exact HTTPS app origin, without a trailing slash. |
| `WEAVE_SUPABASE_URL` | Exact HTTPS Supabase origin. |
| `WEAVE_SUPABASE_PUBLISHABLE_KEY` | Publishable key, never a service-role/secret key. |
| `WEAVE_SIGN_IN_DATABASE_URL` | Separate LOGIN inheriting only `weave_app_auth_runtime`. Remote TLS verifies certificates. |
| `WEAVE_SIGN_IN_ENCRYPTION_KEYS` | Same JSON format as bridge wrapping keys, with independent secrets bound to the app origin. |

The app role can only insert, read and delete its encrypted `app_signins` records.
It cannot access bridge tokens/keys, Auth users or initiatives. The store refuses
privileged credentials. Ten-minute browser-bound state and a PKCE verifier survive
server replacement; a single atomic delete consumes the attempt. Starting again
invalidates the previous browser attempt. Expired attempts are pruned on each start.
Before redirecting, the browser waits for device persistence and checks for edits
made while the request was in flight. A storage failure leaves the tab open.

The callback exchanges the code server-side, checks the authoritative access rule,
and sets a host-only Secure HttpOnly SameSite=Strict session cookie for at most one
hour. It never stores refresh tokens or writes/loads a draft. The temporary state
cookie uses SameSite=Lax so it can return from Certified. Invalid, missing, expired
or replayed state cannot establish a session. Failures return fixed messages without
provider details. Supabase receives only the publishable key and the person's JWT
for subsequent account commands. Private responses are not cached by the PWA.

For disposable loopback tests only, `WEAVE_LOCAL_AUTH=true` permits local HTTP and
non-Secure cookies. It is refused when `VERCEL` is present or `NODE_ENV=production`.
The bridge's test-only loopback callback option still enforces HTTPS ingress and
Secure cookies when its own issuer is HTTPS. Neither exception belongs in a release.

## Rotation and shutdown

An authorized operator can run `bun run --filter @weave/api auth:keys rotate` with
an owner connection. Rotation uses compare-and-swap under a row lock and prepends
new signing/cookie keys while retaining the previous ones. Reload all instances
together; do not overlap instances with different advertised key sets during new
sign-ins. Old public keys remain available for already-issued tokens. Stop/restart
preserves all persisted interaction, grant and session state.

At most three generations are retained; further rotation fails instead of silently
dropping usable keys. Automated retirement is not implemented. A reviewed operator
procedure must wait for the maximum outstanding token/cookie lifetime and cache
window before removing old generations. Encryption-key rotation must keep old
wrapping keys until persistent material has been rewrapped; the lookup key cannot
change without a separately reviewed index operation. Lost wrapping keys make the
database ciphertext unrecoverable.

SIGTERM/SIGINT stop the listener, cleanup timer and database pool. No user records
are deleted on shutdown. The candidate schema and settings remain intact.

## Readiness and operational events

On the bridge host, use the same configuration and restricted runtime credentials
as the running process:

```sh
bun run --filter @weave/api auth:check
```

The command exits 0 with `certified_bridge_ready` only after it validates the
restricted role, decrypts the stored signing material, writes and consumes a
temporary encrypted state record, and checks the loopback worker's discovery,
client metadata and both public signing-key sets. It removes the probe record and
closes its database connection. A probe interrupted before cleanup expires after
30 seconds. An old worker fails readiness after key rotation until it reloads the
new public keys. A running worker with unreadable keys or denied state writes also
fails, even if its public metadata still responds.

Failure exits 1 with only `certified_bridge_not_ready`. The command does not print
configuration, key IDs, database errors or response bodies. HTTP probes have a
three-second deadline and a 64 KB response limit; they do not follow redirects or
send credentials. It adds no public health endpoint and never reads initiatives
or Auth users. This host-local check does not prove external TLS/ingress, Certified
availability, cookie-key reload or the Supabase callback. Those need preview proof.

The process entry writes structured JSON events to stdout. Events contain only
`component`, a fixed `event` name and, for requests, a fixed route category, numeric
status, duration in milliseconds and an aborted flag. It emits one outcome per
request, including an aborted connection. Startup/shutdown, expired-state cleanup
and provider failures have separate event names. A broken output sink does not
change authentication. Library callers remain silent unless they supply an observer.
No event includes URLs, interaction IDs, headers, cookies, tokens, DIDs, email,
initiative data or raw errors. Keep dependency `DEBUG` logging disabled and ingress
request/query/body logging off; these events do not sanitize other log sources.

Before enabling hosted sign-in, wire `auth:check` into the host's health runner and
route readiness failures, `cleanup_failed`, `provider_error`, server-error request
rates and aborted requests to the selected monitoring service. Review alert
thresholds during preview. No alert destination or deployment is configured by this
implementation. Preserve the external HTTPS and full sign-in checks as separate
release evidence; a host-local readiness result cannot replace them.

## Validation

Run `bun run --filter @weave/api test`, `bun run --filter @weave/api typecheck` and
`bun run --filter @weave/api build`. The default test run skips database tests when
no explicit test URL is supplied. To exercise them, use a disposable Postgres 17
with database name `weave_bridge_test` on `127.0.0.1`, then set
`WEAVE_BRIDGE_TEST_DATABASE_URL` and run:

```sh
bun run --filter @weave/api test:auth-db
```

That suite recreates only `weave_auth` in the named disposable database and creates
synthetic restricted roles. It verifies encrypted persistence, expiry, concurrency,
revocation, role denial, key provisioning/rotation and a complete real OIDC exchange
across child-process restarts. Certified responses are synthetic and cannot fall
through to a live provider. This is fixture integration with real Postgres and the
real OIDC library, not a fresh live Certified signup or hosted Supabase proof.

Local validation on 6 November 2026 passed: 21 API tests with the disposable database
enabled (including five database/service integrations), API typecheck/build, 78 app
tests and app typecheck/build, the catalog build and 129 tests, frozen-lockfile
installation, guidance checks and `git diff --check`. The service-entry test uses
native HTTP to model a trusted ingress preserving Host; it verifies rejection of
missing HTTPS headers and privileged database credentials, then restart with the
same public keys. No browser or hosted environment was exercised in this slice.

The next slice adds five real local Supabase tests in `certified-access.test.ts`.
Set `WEAVE_PRIVATE_TEST_DATABASE_URL` only to a disposable loopback Supabase database
whose database comment is `weave-certified-disposable-test`, with the website's
private-saving migration and both candidates applied. Run the API test command.
For its Auth/REST test, also supply `WEAVE_PRIVATE_TEST_API_URL`,
`WEAVE_PRIVATE_TEST_PUBLISHABLE_KEY` and the disposable instance's
`WEAVE_PRIVATE_TEST_JWT_SECRET`; none belong in source control. Expose `weave` in the
local Data API and refresh its schema cache before testing. The suite rolls back or
removes its synthetic users/saves and removes its test login. It proves
Certified-only access, rejected email-only/forged/anonymous/banned/expired identities,
session revocation, owner isolation, save/retry/reload/revision behavior, encrypted
single-use callback state across connections and runtime privilege denial. It does
not reset a schema or operate on a hosted database. All five passed on 7 November,
including real Supabase Auth and REST calls through the app handlers using the
same email-free synthetic session for Save, retry and Load.

Final local checks on 7 November passed: all 82 app tests; 21 default API tests and
the ten database/service integrations in separate runs; both package builds and
typechecks; design checks and 20 design-system tests; frozen-lockfile installation;
guidance checks and `git diff --check`. The build retains its existing large-chunk
warning. Fixture browser proof in the ChatGPT in-app browser covered 360 px and
1280 px, light/dark themes, keyboard sign-in and Save/Load, page reload, reauthentication,
device backup creation, cancellation and Escape. It exposed and verified a fix for
return messages mounting after device storage finished loading.

Real Certified browser proof passed on 7 November 2026. Proof class: local
Supabase; browser: ChatGPT in-app browser. The user signed in with an existing
Certified identity and approved identity-only consent through the temporary HTTPS
bridge. Weave returned signed in with its device draft unchanged and no saved
cards. Explicit Save created a private initiative; a full-page reload retained the
session and saved card, and explicit Load succeeded without another sign-in.
Settings showed the device backup created before Load.

A read-only database audit found one Auth user with no email, one trusted Certified
identity, one session, one private initiative owned by that user at revision 1 and
one save command. The synthetic device-only note was absent from the initiative
and stored save response. The temporary tunnel and bridge were then stopped. This
validates the implemented local callback and Save/Load flow, not hosted readiness
or fresh Certified signup in this build.

This disposable database now contains a real identity. Do not clear its signing
state to accommodate a different temporary issuer. Retesting needs issuer/key
continuity or a separate disposable environment.

The 7 November operational slice passed 28 default API tests and five disposable
Postgres/OIDC integrations. Coverage includes readiness after restart, rejection of
denied state writes, corrupt stored keys and stale advertised keys after rotation,
bounded HTTP probes, metadata drift, output privacy, aborted requests and a failing
log sink. The earlier real Certified browser proof was not repeated for this slice.

Remaining release gates: real Certified on the selected stable HTTPS issuer,
hosted Supabase and browser/PWA coverage, operational metrics/alerts and reviewed ingress,
key-retirement procedure, a second auth review and a preview deployment. No
production resources, DNS, migrations or shared website Auth settings are changed.

Dependencies approved for this build: `@atproto/oauth-client-node` 0.5.13,
`oidc-provider` 9.13.3, `postgres` 4.0.0 and development types
`@types/oidc-provider` 9.13.1. The older AT/Postgres pins preserve Bun's 72-hour
release-age guard. Sources: [AT OAuth](https://atproto.com/specs/oauth),
[OIDC provider](https://github.com/panva/node-oidc-provider),
[Postgres.js](https://github.com/porsager/postgres).
