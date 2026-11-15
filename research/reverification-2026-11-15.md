# Re-verification: November 15, 2026

The November 5 Thursday freshness run and the November 9 Monday discovery run each
prepared proposals but could not open a pull request. This pass re-checked every
proposal at its official source, applied the three that still hold, dropped one
stale call and held three changes to existing terms for
[PR #9](https://github.com/regen-commons/weave/pull/9).

| Proposal | From | Outcome | Checked November 15 |
|---|---|---|---|
| NLnet Restack, second call | Nov 9 | Applied as `nlnet-restack-call2-2027` | [Call page](https://nlnet.nl/restack/), [announcement](https://nlnet.nl/news/2026/20261103-call.html), guide, FAQ and AI policy 2.0: closes January 3, 2027 at 12:00 CET |
| NLnet second call as `nlnet-restack-call2-2026` | Nov 5 | Superseded | Same round as the Nov 9 proposal, which had fuller terms |
| FUNBIO Articulação Institucional 11/2026 | Nov 9 | Applied | [Call page](https://chamadas.funbio.org.br/articulacao-institucional) and Errata 01/2026: closes December 4, 2026 at 23:45 Brasília time |
| CDFW Delta golden mussel decontamination | Nov 9 | Applied, date only | [California Grants Portal](https://www.grants.ca.gov/grants/delta-based-decontamination-control-sites-to-prevent-the-spread-of-golden-mussel/): due December 15, 2026 at 16:00, no timezone |
| FUNBIO TCSA Porto Sul 10/2026 | Nov 9 | Dropped as stale | [Call page](https://chamadas.funbio.org.br/tcsa-porto-sul) shows the call closed; November 9 deadline, no extension |
| Susan T. Buffett Scholarship, 2027 dates | Nov 5 | Held for PR #9 | [Applicant page](https://www.buffettscholarships.org/applicants) and FAQ: opens December 1, due March 1, 2027 before 5 p.m. CST |
| Spencer Small Research Grants, 2027 pause | Nov 5 | Held for PR #9 | [Program page](https://www.spencer.org/grant_types/small-research-grant/): no new competitions January to June 2027 |
| Whitley Awards 2027, closure | Nov 5 | Held for PR #9 | Page not readable: HTTP 403, then a bot check that was not bypassed |

## Catalog changes

Three rounds are appended under their existing funders, with eight new source
records and nine screening conditions, one per stated requirement. No existing
program, source or condition changed, and no funder identity was added or merged.

Re-checking corrected two details in the November 9 proposals. NLnet's eligibility
page does not name accessibility as a cost, so the cost list now follows the page,
and the FAQ and AI policy 2.0 add the cap on facilities and administrative costs and
the ban on AI costs. CDFW's state listing caps advance payments at 25% of the award.
The CDFW owner page and call guidelines reset the connection today, so the program
keeps the guidelines' November 9 date on that evidence. Their Pacific Time and PDT
wording still conflict, so only the date is stored.

The catalog was recompiled at the current date with `python3 scripts/import-data.py`.
Three funders now show a different program on their card because the previous one
closed after October 30: NLnet (first call closed November 3), the Seabury
Foundation (Chicago closed November 6, now Benzie County) and the Los Angeles
Department of Cultural Affairs (NEAR closed October 30, now Public Space
Activation). Their research terms are unchanged. Records with an upcoming dated
deadline fall from 43 to 21 because deadlines passed.

## Why three changes are held

Buffett, Spencer and Whitley need existing program terms rewritten, and the earlier
audits must still be able to recover the old terms. PR #9 adds that revision journal
and is still open, so this pass does not build a second one. Until it lands, the
catalog's Buffett note still gives a November 1 opening; that is the most visible
stale item. Whitley's October 30 cutoff has passed, so its card already reads as
closed.

## Preservation

The [archive](maintenance-history/reverification-2026-11-15/preservation.json) keeps
the full prior record of each of the five changed funders, their prior input
entries and the hashes of every changed file.
`tests/helpers/reverification-2026-11-15.mjs` rebuilds the catalog, the supplemental
inputs and the screening conditions as they stood before this pass, byte for byte,
by undoing only the archived appends and display changes. The earlier audits use it
and still check their original hashes; any other difference fails.

## Coverage

Twenty URLs were attempted: 17 retrieved and 3 failed (the CDFW owner page, the CDFW
guidelines and Whitley). Thirteen supported checks of named fields, two had no
terms, and five failed, including two FUNBIO regulation downloads with no readable
text. The [review log](maintenance-review-log.json) records each attempt, the
fields it supports and each proposal's outcome. No whole-record verification date
advanced.

This pass re-checked proposals only. It ran no new discovery search and no
125-record freshness sweep, and it does not stand in for the November 12 Thursday
run, which failed before reviewing any source.
