# Manual Thursday freshness test — October 29, 2026

This manual test produced a reviewable evidence ledger and two archived revision proposals. It adds no funders or programs and applies no catalog revisions. All **694 funders, 721 programs, 1,824 source revisions and 593 original identities** remain unchanged. The existing 112 review-log entries and both historical preservation baselines are retained.

This was an immediate test on **October 29, 2026, America/Los_Angeles**, not evidence that the Thursday 9:00 a.m. timer fired. Execution settings supplied for this test were `gpt-6-astra` with `xhigh` reasoning; the repository does not independently attest the runtime model. The previously authorized standalone-model documentation edit is included. Automation configuration was not changed.

Work used `/private/tmp/funding-thursday-freshness-20261029` on `codex/test-thursday-freshness-2026-10-29`, based on merged main `4688d55232b847b422370441fa1e79d5273a0ec8`. Direct collector dates are October 30 UTC, corresponding to the October 29 Pacific review. Raw retrieval timestamps were not backdated. Installed dependencies and model caches were reused locally and remain ignored.

## Coverage and its limits

The [inventory](freshness-inventory-2026-10-29.json) contains all 762 program/source records. Priority review covered 128 records: all 29 available dated deadlines through November 19, plus 99 reopening, conditional-call and source-conflict cases. It then selected the 125 oldest remaining records by prior successful verification date, funder ID and program ID; unknown dates sort first. Active routes target 30 days and closed/source-only/other inactive routes 90 days. No dated record was overdue under those targets at the start; nine had never been successfully verified. This is a proactive review, not a claim that every selected record was overdue.

| Selected records | Specific fields verified | Reviewed, no terms established | Failed access/extraction | No identified source |
| --- | ---: | ---: | ---: | ---: |
| 128 priority | 101 | 7 | 20 | 0 |
| 125 oldest remaining | 96 | 13 | 11 | 5 |
| **253 total** | **197** | **20** | **31** | **5** |

Application-related fields were checked for 157 records. Each entry lists exactly which fields and sources were reviewed. **These are partial field reviews, not 197 complete program-term audits or 125 successful oldest-record verifications.** Unchecked eligibility, currency, dates, sponsorship and other terms remain unresolved. Whole-record verification dates were not advanced; scoped field dates and next-review dates are recorded separately.

Of **379 unique attempted source URLs**:

- **217** support specific reviewed fields, including **two limited official search-index excerpts** (Youth Community Access and the older CPUC announcement). Full-page access to those two remained blocked.
- **73** failed to provide usable content, including HTTP errors, network failures, thin pages, extraction failures and two HTTP-200 error shells.
- **54** yielded content that remains unreviewed.
- **35** were reviewed without establishing selected program terms, including directories, identity candidates and historical-lead overviews.

Transport success is separate: 320 direct requests returned 2xx, 299 produced usable extracted content after identifying two error shells, and five web-render recoveries brought full-content availability to 304 URLs. Two additional official indexed excerpts support only their stated fields. Initial failures and subsequent recovery attempts are retained. A fetched page alone never counts as verified terms.

The [coverage ledger](freshness-coverage-2026-10-29.json) is authoritative for exact scope: `sources` lists every URL, attempt, outcome, evidence form, reviewed field and finding; `recordReviews` maps them to identities/programs. `backlog` enumerates all 73 failed sources, 54 unreviewed sources, 56 selected records with no verified fields, the remaining fields for all 197 partial reviews, and **509 records outside this run's selection**. No source-access failure is interpreted as closure. The [maintenance review log](maintenance-review-log.json) records the run, counts, failed/unreviewed IDs, coverage references and 253 new scoped review entries.

Of the 29 near-term deadlines, 27 received deadline-field review. **LA City's NEAR and CO-UP 2027–28 residencies remain unverified in this run** because their shared official source could not be retrieved. The Youth Community Access deadline has only indexed official evidence. These are the most immediate access gaps; prior published terms remain intact.

## Proposed changes and retained uncertainty

The [revision archive](maintenance-history/manual-thursday-2026-10-29/proposals.json) stores exact prior full funder records, hashes, before/after application values, unknowns and new official evidence for two proposals:

1. **Emergent Fund:** the [application page](https://www.emergentfund.net/apply) says all remaining 2026 applications are closed and intake resumes January 1, 2027. The proposal replaces the expired October 1–22 window with a future January 1 opening and no invented closing date or cutoff. The homepage's monthly-intake wording remains an explicit conflict. The previous record and every source/evidence revision are archived intact.
2. **Keeling Curve Prize:** the [portal](https://kcp-conduit.org/apply/kcp/) now names a 2027 call closing January 15, 2027 at 11:59 p.m. IDLW, subject to a 500-eligible-application cap. The [main site](https://www.climatecurve.org/applications-closed) still says applications are closed. The proposal updates the conflict note while retaining the closed route and null dates until current access is reconciled. Annual November 1 language is not converted into a dated opening.

**Neither proposal is imported.** The importer currently appends programs but has no general revision overlay. Applying revisions requires that mechanism and tests that recover prior program/source versions. This run supplies the archive and a full-record preservation test, and leaves revision application explicitly unimplemented.

Other findings retain their scope: CPUC's current October 30 cutoff conflicts with its older October 15 announcement; the $75,000 restricted-round allocation is not assumed to be a per-award ceiling. Halcyon's October 30 stage is invitation-only. IKI remains conditional on funding approval. EKOenergy's possible December call is unconfirmed, and its web/PDF duration wording differs. ISOC's nonprofit/social-enterprise wording, NEEF's sponsor copy, and LA County CIAG's timezone conflict remain unresolved. Spencer's rendered page confirms “Now closed”; an “Applications Open” heading alone does not establish a reopening. None of these observations silently overwrites prior terms.

## Discovery, deduplication and parallel PRs

Read `docs/maintenance.md`, the historical intake, discovery registry, prior review log and current merged-main data. The historical queue had zero pending leads. Revisited all four unresolved dispositions: Co-Develop climate DPI, Vrbs, IFC SME Growth Accelerator and REA/FCMB Green Finance Investment Facility. None acquired sufficient official applicant terms for import. The unrelated `ifcgrants.org` domain was not accepted as IFC evidence.

Checked all four discovery-registry entry points. Grants.gov and Terra Viva remained directory-level reviews; no exhaustive opportunity search or individual federal-call coverage is claimed. California's portal surfaced Land and Water Conservation Fund and Trauma Recovery Center leads whose individual calls remain unreviewed. JRF's page surfaced a Scotland participation learning-partner brief with a November 11 deadline; the brief, timezone and full terms remain unreviewed. These three held leads are recorded, not imported. FundsforNGOs retrieval failed.

Public identity searches did not resolve Alpina Foundation, The Funding Network, Carnegie Foundation, BOA Foundation or The Building Resilience Helping You Thrive Foundation. Same-name candidates were not substituted. Global Welfare, Next Step, Energy Transition Fund and Bala Family Foundation also retain identity/terms uncertainty. Shared sources are deduplicated in the URL ledger while every original funder/program/round identity remains. Benito Massó and Mosaic/Momentum alias candidates were not destructively merged.

Inspected repository-wide open PRs with both `gh pr list` and `gh api 'repos/regen-commons/funding-commons/pulls?state=open&per_page=100'`:

- [Draft PR #6](https://github.com/regen-commons/funding-commons/pull/6): Monday additions and the fix freezing the pre-supplemental historical report. Do not duplicate Hacker Initiative, Linux Australia, People Powered, CDFW Mojave tortoise or FUNBIO São Francisco, or its historical-report fix. This test has no dependency on those additions. **Both PRs append the review ledger**, so merge resolution must retain both sets of entries and distinct run IDs; accepting only one side would lose coverage.
- [Draft PR #3](https://github.com/regen-commons/funding-commons/pull/3): separate historical QA document, outside this change.

The currently merged generated historical report remains affected by the known pre-supplemental-baseline issue owned by PR #6. A passing build here does not certify that issue is fixed. Existing audit baselines and preservation assertions were not regenerated or weakened to obtain passing checks.

## Validation and delivery

- Import reproduction in a local fixture retained all 694 full records and reproduced the currently published historical report byte for byte.
- `python3 scripts/import-data.py`: passed in the isolated checkout; all 694 full records matched the starting catalog. The only two generated changes were `compiledAt` timestamps, restored to avoid unrelated output churn. The existing historical report was unchanged.
- `bun run build`: schema/evidence/static validation, all 593 original identities, and 762 program/overview embedding documents across 694 funders; pinned model weights validated.
- `bun run test`: 121 tests, including seven new checks for complete-record preservation, prior-ledger retention, deterministic priority/oldest selection, honest source counts, partial verification dates, archived unapplied proposals and unresolved leads.
- `git diff --check`: whitespace validation.

The first build attempt found a copied dependency symlink without its local target; installing the existing local cache target resolved it. The successful build uses the explicit Node 24.20.0 and Bun paths requested for this test. Dependency/model caches and raw fetched text/PDFs are not committed. Published artifacts contain public URLs, metadata and scoped paraphrases; no private Drive/Linear captures or contact lists were added.

Delivery is a draft PR labeled `automated/codex`. No PR is merged and no production deployment or promotion is performed. Existing automatic previews and checks remain enabled. Remaining work is the exact source/record backlog above, resolution of the two proposed revisions, and the separate historical-report correction in PR #6. This manual run does not test whether the weekly timer fires.

## PR review follow-up

PR #7 is now stacked on PR #6. The combined ledger retains all 112 previous entries, nine Monday entries and 253 Thursday entries (374 total), with both full run records. The integration baseline pins the independent PR heads before combination; a regression check rejects dropping or changing either run's entries. The original 694-record inventory and coverage counts above describe the manual test's starting catalog; the combined branch includes PR #6's five additions and frozen historical report.

A fresh direct HTTPS check of the Keeling Curve portal returned the same 2027 response checksum as source-361 (`e933fada8c58ad1aafffc84f89bb0980ce86d67a733bf1fe6b294cc74fcc6e10`). A web retrieval returned an older 2026 page. This version discrepancy does not establish new terms: the direct capture supports the original scoped finding, while the main site's closure remains unresolved. Both revision proposals stay unapplied. See [the review record](pr-review-2026-10-29.md) for the combined validation and merge order.
