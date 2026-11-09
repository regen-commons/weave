# Private account connection proof

November 5, 2026. Production verification below is separate from the earlier
fixture rendering, HTTP and disposable PostgreSQL 17 policy proof.

## Production verification

[Weave](https://weave.regencommons.com) serves commit
`d697c3784fb22f7e1c8ae8a7b5973b841f3fb377` from production deployment
`dpl_BKhVUhr5w519YtkoKBbYkKVpY1c9`. `/api/health` reports that commit;
`/api/account` reports accounts available, eight-digit OTPs and `fixture: false`.
App PRs [#27](https://github.com/regen-commons/funding-commons/pull/27) and
[#28](https://github.com/regen-commons/funding-commons/pull/28) are merged with
all four GitHub Actions passing. Full local CI passes 309 tests, including with
synthetic enabled release settings. No dependency or lockfile changed.

**Production, Brave 156 and ChatGPT in-app browser:**

- Requested and verified real Supabase codes through the deployed UI and existing
  Resend SMTP. A wrong code was rejected while preserving the input. Both new-user
  and returning-user code emails use the reviewed generic template.
- Used Resend's documented reserved test recipients, which simulate delivery.
  This proves the live Auth/SMTP/code path, not delivery to a person's inbox. No
  personal mailbox or existing steward account was accessed.
- Created a clearly synthetic checked initiative with one Material need and one
  Experiential offer. Explicit Save produced revision 1 and private visibility.
  A targeted database read confirmed one need, one offer and no source turns.
- Signed in from the independent in-app browser. The saved-card list appeared
  before any choice to save its existing local draft. Loading required confirmation
  and backed up that draft. Finish showed the saved initiative, need and offer.
  A full page reload preserved the session and saved state.
- Restored the earlier local draft through Device backups. The loaded server copy
  was backed up first. Signing out preserved both drafts; the first browser session
  remained signed in.
- Signed in to a second reserved test account. Its saved-card list was empty.
  Direct loading of the first account's initiative returned `not_found`.
- Checked 360 × 800 and 1280 × 900 in light and dark themes. Keyboard focus remains
  visible, labels match controls, and the saved status and private-save choice
  are readable. Captured local screenshots of Settings and Finish contain only
  synthetic records and reserved test addresses. Temporary viewport and appearance
  overrides were reset, and the earlier device draft was restored.

The hosted migration is version `20261105082413`, applied through the website's
authenticated CLI lane after a private schema-only backup. RLS is enabled on all
new tables. The four exposed RPCs are invokers, denied to anon and granted to
authenticated users. A publishable-key request without a session was denied.
Data API exposure includes `weave` and excludes `private`.

[Website PR #12](https://github.com/regen-commons/website/pull/12) remains unmerged:
GitHub requires approval from someone other than the last pusher. That rule was
preserved. The exact migration is already live and must not be renamed or reapplied.
Synthetic private test records remain for repeatable verification.

Live stale-revision, quota and revoked-session browser tests were not performed;
the disposable SQL and automated API tests below cover them. Personal delivery and
the existing steward's sign-in remain for their owner to verify. Sharing, reminders,
editors, account export/deletion and automatic refresh are outside this release.

## Earlier fixture verification

The following checks used no hosted code, private member record or live write.

## Rendered checks

- Chrome 149: keyboard email/code sign-in, invalid code preserving the input,
  sign-in recovery, explicit private save and the Saved header. A captured save
  request contained only `version`, `initiative`, `needs`, `offers`, `funding`.
  Synthetic unfinished source words and file bytes were absent. JavaScript saw no
  session cookie or localStorage Auth token.
- Brave 156, a fresh isolated browser context: signed in to the same synthetic
  account, listed the earlier saved card and loaded its initiative, need and offer
  into a fresh device draft. No local draft was sent merely by signing in.
- ChatGPT in-app browser: inspected Settings at 360 × 800 and 1280 × 900 in both
  themes, with native inputs, labels and keyboard submit. Primary and secondary
  actions remain readable, focus is visible, page title and h1 agree, and the
  account choices use the existing design-system forms and notices. The email
  step places focus on the code. Loading has a distinct confirmation with Cancel.
- In-app browser: added unfinished Describe words to a loaded card, returned to
  Settings, loaded the account card, restored the device backup, and verified the
  unfinished words remained in the Describe textarea. A fresh device with no
  stored draft correctly has no backup to list.
- Reduced motion was enabled for the desktop-browser checks. No new motion or
  CSS was introduced. The design checks cover both-theme contrast and tokens.

The five-minute review found misleading device-only copy in the card preview and
an unconditional backup-success sentence. Both were corrected. The interim entry
through Settings is recorded in DL-030 for maker review; contextual dialogs remain
later work. Screenshot export from the Chrome/Brave tools failed; the in-app
screenshots were inspected during the review and are not committed artifacts.

## Reproduce safely

Run `WEAVE_ACCOUNT_FIXTURE=1 bun run --filter @weave/app dev`. Open Settings and use
`example@weave.test` with `12345678`. The dev-only account transport is in memory,
never calls Supabase and sends no email. Complete and check a synthetic initiative,
needs and offers before saving. A second isolated browser can load that saved copy.
Restarting this server clears only its synthetic account records. The production
entry never reads `WEAVE_ACCOUNT_FIXTURE`.

## Automated evidence

`bun install --frozen-lockfile` changed no dependencies or lockfile. `bun run ci`
builds the app and API, tests sign-in cookie and request boundaries, native HTTP
Auth/RPC transport, revoked-session and provider failures, checked-document
roundtrips, retry identity, conflicting tabs, quota failure and backup recovery.
Production-bundle checks reject the fixture email, label and cookie name.

The website suite separately applies all seven migrations to disposable Postgres
17 with synthetic Auth stubs, then runs all seven SQL access suites. The Weave
suite proves owner reads, denied anonymous/non-owner/steward/spoofed-metadata
reads, unconfirmed/expired/revoked sessions, direct-write denial, complete save/load,
idempotent receipts, stale revisions, validation, private-only visibility and
30 acknowledged saves per account per hour with free retries.

These fixture and SQL checks do not themselves prove hosted services. Production
verification is recorded separately above.
