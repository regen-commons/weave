# Thursday freshness: November 5, 2026

Four public-evidence proposals are ready for review. None changes the catalog yet.
All 699 funders, including the 593 original identities, and every existing
program/source revision remain unchanged. The append-only importer cannot safely
apply existing-term revisions; [PR #9](https://github.com/regen-commons/funding-commons/pull/9)
is still open. Its implementation is not duplicated here.

| Program | Previous record | Proposal and official evidence |
|---|---|---|
| Susan T. Buffett Scholarship | November 1 opening note; no 2027 cutoff | [Applicant page](https://www.buffettscholarships.org/applicants) now gives December 1 opening and March 1, 2027 before 17:00 CST / 16:00 MST. Eligibility is not reverified. |
| NLnet Restack | First call, September 3 to November 3, 2026 | [Second call](https://nlnet.nl/restack/) runs November 3, 2026 to January 3, 2027 at noon CET. Add a distinct round only after its remaining terms are checked; retain the first call. |
| Spencer Small Research Grants | Closed; generic twice-yearly wording | [Program update](https://www.spencer.org/grant_types/small-research-grant/) rules out new competitions January–June 2027. Updated schedules are expected in June, not a promised reopening. |
| Whitley Awards 2027 | Open route with October 30 cutoff | [Official application page](https://whitleyaward.org/apply-for-conservation-funding/apply-for-a-whitley-award/) now explicitly says closed. Retain the prior cutoff. |

The [proposal archive](maintenance-history/thursday-2026-11-05/proposals.json)
contains exact prior funder records, hashes, before/after application values and
official evidence. Emergent Fund's January 1, 2027 resumption was reconfirmed, but
its October 29 proposal is retained without duplication. Keeling Curve's prior
portal conflict remains unresolved.

## Coverage and remaining work

The [inventory](freshness-inventory-2026-11-05.json) covers 762 program/source
records. Initial triage selected 131 priority records, followed by the 125 oldest
remaining records ordered by whole-record successful verification date, funder ID
and program ID. Prior partial-field checks do not advance that whole-record clock.

There were 240 unique primary URL attempts: 71 sources supported named field
checks, 29 failed or returned unreadable text, and 140 supplied excerpts without
enough reviewed program terms to certify a field. Shared sources support 72
records: 45 priority and 27 oldest records. Another 149 records have excerpt-only
coverage, 30 have failed source checks, and five have unresolved identities.
**This is not 125 complete term reviews.** Additional page sections, linked
conditions and source conflicts still need work. No whole-record verification
date advances. The 506 unselected records and exact failed/excerpt-only records
are listed in the [coverage ledger](freshness-coverage-2026-11-05.json).

The initial inventory has no dated 30/90-day target breach and nine records with
no whole-record verification date. Those targets do not certify current terms.
Deadline and passed-cutoff records are due for follow-up November 6; other selected
gaps are due November 12. Failed retrieval is never treated as closure.

Confirmed upcoming cutoffs include MIT Solve and Seabury Chicago on November 6,
Rocket Pool on November 7, Pisces on November 9, FFC on November 10, Oilwatch on
November 13, D-Prize on November 15, and CSCI and Mozilla on November 20. See each
record's evidence and exact cutoff qualifications in the coverage ledger.

The historical pending queue is empty. The four unresolved historical leads were
revisited without adopting unverified terms. All four discovery registries were
attempted; FundsforNGOs returned 403. FUNBIO's prior Porto Sul and institutional
coordination leads now have owner-overview evidence for November 9 and November 23
respectively, but full regulations remain unverified. JRF's November 11 learning
partner brief was unreadable. These leads remain held, alongside the untouched
deferred leads from the prior runs. New catalog additions: zero.

## Repository and validation

Started from main `5fd72bb78afa970d44676aa688b1aaaf650c0154` in an isolated
`codex/thursday-freshness-2026-11-05` checkout. GitHub search and the repository-wide
pull listing both returned PRs [#3](https://github.com/regen-commons/funding-commons/pull/3),
[#9](https://github.com/regen-commons/funding-commons/pull/9),
[#30](https://github.com/regen-commons/funding-commons/pull/30) and
[#31](https://github.com/regen-commons/funding-commons/pull/31). None owns this weekly
coverage update. Names, existing IDs, program URLs and historical dispositions
prevent duplicate proposals; no identities are merged or removed.

The frozen-lockfile install, import at the committed catalog timestamp, build and
131 catalog tests passed, including two new preservation/coverage checks. The historical region audit now reconstructs and hashes its exact 374-entry/two-run ledger prefix, retaining its original hash while allowing append-only maintenance. Design and guidance checks passed. The standalone harness run stalled without results and was interrupted.
The build verified cached model hashes after the network blocked model download.
The full CI command reached workspace tests but failed on a sandbox-denied
`listen 127.0.0.1` operation in the API suite; the app suite then stalled and was
interrupted. A final bounded retry repeated the failure and stopped after 90 seconds (exit 124). This is an incomplete local CI result, not a passing check. The
repository's GitHub checks and automatic preview policy remain unchanged.

No private notes were accessed or committed, and no applications, messages,
merges, production deployments or promotions were performed.
