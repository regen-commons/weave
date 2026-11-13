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


## Certified project backend preview

The project backend is opt-in with `WEAVE_PROJECTS_ENABLED=true` on an HTTPS
app origin. Keep the existing Certified-only account and Save/Load setup.
Apply the workspace and project OAuth candidates through the database
migration owner. Use the separate Weave Preview database for staging.

| Configuration | Purpose |
|---|---|
| `WEAVE_PROJECT_ACCESS_MODE` | Explicit `authenticated` permits any verified Certified identity to enter project flows. Omitted or `pilot` retains the two-account restriction. This only controls rollout eligibility; current project authority and workspace grants still apply. |
| `WEAVE_PROJECT_PILOT_DIDS` | Exactly two comma-separated Certified DIDs in pilot mode. Leave absent in authenticated mode; conflicting configuration fails closed. |
| `WEAVE_PROJECT_WORKSPACE_DATABASE_URL` | Dedicated login granted only `weave_workspace_runtime`. |
| `WEAVE_PROJECT_OAUTH_DATABASE_URL` | Separate login granted only `weave_project_oauth_runtime`. |
| `WEAVE_PROJECT_DATABASE_POOL_MODE` | Optional `supabase-transaction` selects port 6543 on the existing Supabase shared-pooler host for both project database clients. No credential or key changes. Leave absent for explicitly configured endpoints and local fixtures. Other values and incompatible hosts/ports fail closed. |
| `WEAVE_PROJECT_OAUTH_ENCRYPTION_KEYS`, `WEAVE_PROJECT_OAUTH_SIGNING_KEYS` | Dedicated state cipher and ES256 private JWK array for the project OAuth client. Provision separately from identity bridge keys. |
| `WEAVE_CERTIFIED_GROUP_ORIGIN`, `WEAVE_CERTIFIED_GROUP_PDS_ORIGIN` | Certified Group Service origin and the group's actual backing PDS. The PDS host determines the created group handle suffix. |
| `WEAVE_CERTIFIED_PROJECT_PDS_ORIGINS` | Optional comma-separated allowlist of additional project repository PDS origins. |
| `WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED` | Defaults to off. Set `true` only after the selected CGS and backing PDS prove scoped group create, read-back and conditional deletion. The adapter blocks both group writes while off. |

### Serverless project database connections

Each warm function keeps a separate project OAuth and workspace client. Each client
uses one connection, one query in flight and no prepared statements. Supabase's
shared transaction pooler does not support query pipelining; `max_pipeline: 1`
serializes ordinary queries without disabling the driver's transaction support.
For Vercel, enable the
transaction-pooler option only after confirming that the configured host is the
project's shared Supabase pooler. This changes the connection mode in memory while
preserving the write-only database credentials and certificate validation. The
existing identity bridge and its keys are separate and are not changed by this
option.

Supabase recommends [transaction pooling for serverless functions](https://supabase.com/docs/guides/database/connecting-to-postgres).
The application's one-connection limit applies per warm function, not globally.
Keep the runtime roles' connection limits and monitor SQLSTATE `53300`; budget
server-side pools across roles and the shared website before changing any limits.
Do not raise the shared project's pool size as a shortcut.

Project OAuth locks use the same hashed transaction-scoped advisory lock inside
`sql.begin`, acquired with a nonblocking try. A busy attempt ends its transaction
before bounded backoff; only that busy result retries. Protected callbacks, token
refreshes, writes and uncertain commits are never replayed. Caller cancellation
bounds waiting and ordinary upstream calls; critical refresh settlement has its
own bounded budget below. Rotated state commits before an upstream error is
surfaced.

The pinned SDK's `requestLock` owns session read/refresh/store coordination.
Ordinary Certified RPCs run after that short lock is released; they do not hold a
database transaction while waiting for a remote response. Every SDK lock entry
rechecks the same actor, Weave session, action and grant expiry. Invalidation
outside the SDK lock reacquires it and compares the captured token/key/expiry
version, so a late invalid-token reply cannot delete a newer grant.

Once a refresh token is dispatched, caller cancellation cannot interrupt its
settlement. One independent five-second transport budget covers the refresh and
any DPoP nonce retry. The transaction is checked immediately before dispatch and
has a transaction-local ten-second idle timeout. An uncertain exchange without a
stored rotation withdraws that project grant rather than reusing a possibly
consumed token; the account and saved initiatives remain available.

The HTTP project and matching boundaries close the request and await registered
SDK lock/refresh/state settlements before returning. Inner provider deadlines
still bound ordinary or uncooperative adapters. Closed requests cannot start new
SDK critical work; an already-started refresh may finish token persistence and
transaction cleanup. Function execution must allow that bounded cleanup budget.

Project clients cap their local connection queue at ten seconds. Cancellation
while queued is observed when a lease arrives or that queue ceiling rejects;
it is not immediate cancellation or a strict ten-second whole-request deadline.
An expired queued attempt cannot start protected work. Work already started must
settle so token rotation and transaction cleanup are preserved.

The loopback-only `WEAVE_PROJECT_LOCK_TEST_DATABASE_URL` regression uses the
dedicated `weave_project_lock_test` database. It checks contention across clients,
exclusive committed revisions, unrelated grants, cancellation before acquisition,
queue removal, no callback replay and rollback. It never contacts Certified.

Workspace commands establish and restore their request context within each SQL
call. Neither relies on session state surviving between transactions. Local
PostgreSQL tests prove the worker connection bound and the existing transaction
behavior; they do not prove hosted Supavisor capacity or cold-start behavior.
Retest concurrent workspace loading, sharing, edits and callbacks on the approved
hosted release before accepting this rollout. Removing the option restores the
configured endpoint; reverting the release does not remove saved work or keys.

The client metadata, public keys and callback are served at
`/api/certified-project-client`, `/api/certified-project-jwks` and
`/api/certified-project-callback`. Project access uses granular RPC scopes.
Group registration and the signed-in person's group membership list go
through the PDS service proxy. Group-scoped reads and writes use one-use
service tokens. Prove both paths with the selected Certified environment
before enabling project writes.

The bridge and project consent currently pin the existing production
Certified identity issuer. The official Certified staging PDS uses a
different issuer and accounts. A proof using staging-only Certified
identities requires a separate stage-bound identity configuration and
the confirmed backing group PDS. Verify the supported handle resolution
response and public project read-back on the same environment.
[Certified service environments](https://docs.hypercerts.org/reference/services#running-services)

The isolated Weave Preview database has the project OAuth and workspace
migrations. A rollback-only PostgreSQL 17.11 proof used synthetic Certified
membership evidence to verify setup approval, explicit grants, suspension,
create checkpoints and private-save preservation. A separate query confirmed
that the fixture left no workspace or OAuth records. This proof covers the
database boundary. Real Certified browser consent and upstream writes remain
a separate staging check.

For staged acceptance, use two disposable Certified identities. The first
creates a group and a project, then verifies the same URI and workspace on
retry. The second requests setup on an existing group project or receives
an explicit grant, and can read the workspace link only after verification.
Exercise removal, rejected consent, and a lost response. Check that both
private saves and the workspace's canonical link keep their IDs. Report
database fixtures separately from a real Certified browser and write proof.


### Local team saving and workspace matching

Apply the local `weave-team-content.sql` candidate after the matching and
project workspace migrations. `POST /api/projects` accepts `team_load` with a
`workspaceId`, or `team_save` with the same ID, `expectedRevision`,
`requestId`, and checked `document`. Use revision zero for the first save.
Load returns `saved` and the current `accessRole` (`viewer`, `editor` or
`admin`). An empty workspace has `saved: null`. Both commands use the existing
Certified session and require current group membership and a Weave grant.
Use the `membership` consent action if the session has not granted it.

The migration closes the old direct matching RPC path. Release it together
with the workspace-aware matching handler when the pilot can be enabled.
Keep the hosted candidate disabled until then. The disposable
`project-workspaces-postgres.test.ts` suite uses a loopback database named
`weave_workspace_test` and the checked-in account baseline from the website
repository. It tests workspace and matching permissions with synthetic
Certified authority.

### Local public evidence for private suggestions

Apply `weave-public-evidence-snapshot.sql` after the project index and team
content candidates. `POST /api/projects` with action `public_evidence` and a
`workspaceId` verifies the linked project and workspace access. It returns
public passages, index coverage and a short expiry. The client ranks private
needs and offers in a browser worker. Open `/workspaces/<workspaceId>`
using the ID from a linked group project result. The page loads the team's
saved document and access role with `team_load`. Editors and admins can
add or change needs and offers through `team_save`. Each save retains its
request ID when retried after a lost response. A revision conflict keeps
the form available for copying.

The page reuses the matching review for selected entries. Saving alone
keeps new entries private. Editing a shared entry removes its eligibility
until an editor reviews and shares it again. Withdraw uses the reviewed
entry identity and current version. Viewers can read documents, suggestions
and shared results. The API and database reject their save, review, share,
withdraw and lead changes.

The page uses open entries in the same `CertifiedSuggestions` component.
It keeps the team document in memory and requests Certified membership
consent when the session needs it.
Both commands stay behind the existing project pilot gate.

Use `WEAVE_WORKSPACE_TEST_PROJECT_INDEX=1` with the disposable workspace
database suite to check the actual index schema. The database needs pgvector.
The new two-workspace regression covers private saves, selected sharing,
edit invalidation, a fresh review, withdrawal and viewer write denial.
Its database rerun is deferred at the user's request after the current
Codex session could not access the local Docker socket. The local HTTP
fixture regression and browser editor/viewer checks passed. Keep those results distinct from
PostgreSQL and live Certified proof.

### Local support publication candidate

Public support publication uses separate `support_review`, `support_publish`,
`support_withdraw`, `support_reconcile` and `support_state` commands on
`POST /api/projects`. Private Save and Share for matching remain independent.
The [draft support Lexicon and lifecycle](lexicons/README.md) describe the public
record and its validation boundaries. Keep project actions disabled for production;
the local synthetic proof does not establish live Certified write permission.

The migration owner must apply these candidates in order after the existing
private-account and Certified private-access baseline: `weave-matching.sql`,
`weave-project-workspaces.sql`, `weave-team-content.sql`, then
`weave-support-publication.sql`. Project OAuth uses its separate
`weave-project-oauth.sql` candidate and login. The new publication candidate has
not been applied by this change. Release its API and schema together.

Review returns the exact public record, destination DID, audience `public-atproto`,
saved revision, entry revision and review expiry. Publish requires that review ID,
a stable request ID, audience `public-atproto` and `confirmPublic: true`. An
`expiresAt: null` review creates an undated listing by omitting its public expiry;
the ten-minute review lifetime still applies. `updatedAt` advances on every reviewed
publication so an identical replacement receives a different CID.

The current workspace editor and Certified authority must both permit the action.
The separate `publish-support` and `withdraw-support` consent actions request group
create/delete RPC scopes and personal collection-limited create/delete scopes.
Personal writes require the repository owner. Certified checks group membership
and record author permissions during each group write. The runtime defaults
`WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED` to off. Primary source inspection shows
that the current CGS delete handler forwards its input, but the selected hosted
service must prove `swapRecord` before group creation or deletion is enabled.

The SQL transaction queues withdrawal when published fields change or an entry
closes or is removed. Confirmed parent-project deletion or unlisting also queues
withdrawal and invalidates old matching reviews. Temporary verification failures
leave the existing state intact. The old reviewed public record remains attached
to the request; replacement details stay private until explicitly republished.

Only one durable create claim may send an operation. A retry first reads its stable
AT URI. It can confirm the expected content and CID, or retain a pending result.
A definitive authorization rejection releases the claim for a later authorized
retry. A never-observed uncertain create remains pending and is not resent; absence
cannot prove that an old request will not arrive later. Conditional delete includes
the expected CID and is confirmed only after public read-back returns absence.
Current authority can resolve a queued withdrawal even while its parent is paused.

An external `RecordNotFound` changes only public publication state. It preserves
the private entry and any eligible Weave share. An externally changed or terminal
record reports a conflict, since inactive status alone does not prove removal of
its public details. Previously public copies may persist in independent readers.
Publication history is paginated in stable `kind`, `entryId` order: `support_state`
returns at most 100 rows and `nextCursor: string | null`. Pass that cursor with the
same workspace to load older requests, including deleted-entry withdrawals.

`support-publication.test.ts` uses synthetic personal and group repositories and a
standalone public reader that discovers one need and one offer through public
`listRecords` and `getRecord`. It checks consent denial, author restrictions, lost
responses, a single concurrent create claim, conditional deletion and read-back.
The separate `support-publication-postgres.test.ts` suite requires a disposable
loopback database named `weave_support_test`, supplied through
`WEAVE_SUPPORT_TEST_DATABASE_URL`, plus the private-account baseline path in
`WEAVE_SUPPORT_TEST_BASELINE`. It covers revisions, grants, transactional withdrawal
triggers and stale operations. That suite remains unexecuted here because this
session has neither a local PostgreSQL server nor access to the Docker daemon.
Hosted personal/group consent, write and independent read-back remain pilot gates.

### Production pilot preparation

On 12 November the user chose open project access rather than supplying two
tester DIDs. The `authenticated` access mode implements that choice without
weakening Certified session verification, current group membership, explicit
workspace grants or editor/admin rules. Signed-out, email-only and unauthorized
workspace requests remain rejected. Hybrid retrieval, optional email hints and
group public support publishing remain off. This change is prepared for review;
it does not establish a production release or hosted acceptance. The earlier
two-account pilot procedure below is retained for restricted environments.

Platform records `20261110040828_weave_project_oauth` and
`20261110040924_weave_project_workspaces`. The website migration folder owns
copies with those versions. Read-only checks verified separate runtime roles
and denial of the workspace command to anonymous and authenticated clients.

Vercel built the gated backend as candidate `dpl_8DwTj9pMCEajRuUcW8v7QDRDErva`. The
stable Weave Preview alias continues to serve `dpl_ykn9ctFtKvsZbopsC4GgausFL511` while
the UI is in progress. The candidate has project actions disabled and
has no production alias. No live Certified action was used to verify it.

Keep project actions disabled while the UI is in progress. For the live
pilot, use the existing production Certified issuer, provision separate
runtime logins and project OAuth keys, confirm the group's backing PDS, and
set the two tester DIDs. The UI needs to complete project consent on return
and retry the intended command in the same Weave session. The pilot uses
fictional public project details and existing Certified test accounts.
