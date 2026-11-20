# All-public Certified index, 15 November 2026

The user decided on 15 November that Weave indexes and shows every listed public
Certified project, replacing the per-project permission manifest
([decision](../../../docs/platform/open-decisions.md#all-listed-public-certified-projects-decided-15-november-2026)).
This record covers the all-public refresh, the daily cron and the public list.
It holds counts and timings only: no project names, addresses or text.

## What was measured

| Proof class | What ran | Result |
|---|---|---|
| Production source, read only | A terminal traversal of `listCollections?types=project`, 25 records a page | 46 pages and 1,131 records in 18 seconds. Largest page 300 KB, largest record 47 KB. No duplicates and no unlisted projects. |
| Production source, read only | Each listed account's DID document from plc.directory, six at a time | 1,068 accounts, all did:plc, in 14 seconds, every lookup answered. Hosts: certified.one 950, dev.certified.app 62, pds1.test.certified.app 48, four bsky.network hosts 4, climateai.org 2, two others 1 each. This matches the platform status session's own count. |
| Production source into local Supabase | `--refresh-all-public` through a restricted login inheriting only `weave_index_job`, Postgres 17 in the Supabase image | Complete in 36 and 42 seconds on two runs. Of 1,131 records, 8 were skipped because their titles carry contact details or markup and 112 belong to accounts on Certified's development or test servers. 1,011 projects were committed; 13 have no usable description text, so 998 are shown. Before the test-server rule, the same refresh committed 1,123 projects in 24 seconds and an unchanged rerun took 25 seconds and withdrew none. |
| Local Supabase | The public list's read of the 998 shown projects | 78 to 101 ms for the whole list, 1.3 MB. Each function instance reads it at most once a minute; searches and pages are then answered in memory in 0 to 2 ms. A search for "soil" matched 188 projects. |
| Fixture, local Supabase | The integration suite `project-index-all-public-postgres.test.ts` | First refresh, cursor paging without gaps, unchanged refresh, unlisted flip, removal, a move to a test server, source outage, page budget, re-listing, expiry, stale reads, two concurrent runs, withdraw-all, a project whose data Postgres refuses, and the signed-in snapshot reading the same rows. |
| Fixture | Unit suites for the traversal, refresh, account lookups, cron handler and public list | Retries and Retry-After, adaptive page size, cursor cycles, the shrink guard, dates Postgres cannot read, test-server and failed lookups, DID document parsing, time-budget resume, contention, the `off` page, the once-a-minute copy, secrets and log content. |
| Fixture, local Supabase, in-app Chromium | Initiatives and Home with 30 fictional projects, at 360 and 1280 px in light and dark | Search, Clear search and Show more by keyboard; the empty index and an outage on both pages. No horizontal overflow or console errors. |

The live corpus was deleted from the local database after measuring. The
first production refresh, hosted cron timing and freshness over several days
are not measured here.

## Behavior established

- Only a complete traversal replaces the permission set. A failed page, a
  repeated cursor, the page budget or the time budget leaves every stored row as
  it was. The integration suite checks the outage and page-budget cases byte for
  byte; the unit suite covers the time budget.
- A record whose dates or text Postgres cannot store (year 0000, an offset
  beyond 15:59, a lone surrogate) is skipped as malformed. If Postgres still
  refuses a project's data when it is committed, that one project is recorded
  as malformed and the sweep goes on, so one record cannot break the list or
  stall later refreshes.
- Projects whose account's DID document names `dev.certified.app` or a
  `*.test.certified.app` server are left out, and withdrawn if shown. An account
  that plc.directory reports gone (404 or 410), or whose own document names no
  https server, is left out too. A lookup that times out, errors or returns
  anything other than that account's document leaves the run unapplied.
  did:web accounts are judged by their own domain and never fetched.
- Added 19 November 2026: projects whose name or own words declare them a QA or
  test entry are left out the same way and withdrawn if shown, counted as
  `testNamed` or `testDescribed` in the refresh report. A project on a test
  server is counted only as a test host. The unit suite covers the rule and its
  hard negatives; this record's runs predate it. A read-only run of the rule
  over the public list on 19 November (class `production`, built-in Chromium
  browser, 1,006 projects, at most two passages each) found 14: 13 by name and
  1 by its own words, with no other project caught. The index reads up to ten
  sentences a project, so a refresh may count slightly more.
- A listing that would withdraw more than half of at least 20 shown projects is
  refused, even if new projects keep the count up. Projects not confirmed by a
  complete traversal stop showing after 72 hours, so a lasting change still
  applies. While a run is refused, unlistings wait too, for at most those 72
  hours.
- A sweep cut short by time resumes the next day with the projects checked
  longest ago, so later projects are not starved.
- An outage or a rate-limited page is retried twice, after at least 2 and 4
  seconds and never sooner than the server's Retry-After; a wait over 30 seconds
  ends the run. A refused or malformed page is never retried. A page over its
  byte budget is read again with 5 records, then 1.
- The list shows a project only while it is listed, unexpired, read within
  seven days and has current evidence, the same conditions as the signed-in
  snapshot. Each card shows the name, the first two passages in reading order,
  the shared date (never later than the source's index time) and the date
  Weave checked it. Until the list is switched on it answers an empty `off`
  page, so the app keeps its starter list without an error.

## Hosted settings found while building

The index connection verified certificates against Node's trust store only.
Supabase's database certificate chains to Supabase's own CA, so a hosted run
would have failed TLS. The connection now takes `WEAVE_DATABASE_CA_PEM`, as the
account runtime already does. Statements are no longer prepared, so the same
login works through the session or transaction pooler.
