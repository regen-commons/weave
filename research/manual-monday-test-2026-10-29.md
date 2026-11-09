# Monday discovery: manual test, October 29, 2026

This immediate manual test proposes **five new funders and six programs**, bringing the catalog from 694 to 699 funders and from 721 to 727 programs. No existing program terms were revised. The test ran for the October 29 date in America/Los_Angeles, using the requested gpt-6-astra / xhigh execution setting. **It does not demonstrate that the weekly Monday timer fired.** The routine execution did not edit the saved automation configuration.

The branch is `codex/test-monday-discovery-2026-10-29`, based on latest main `4688d55232b847b422370441fa1e79d5273a0ec8`. The runner search returned no rows, but the coordinating review independently confirmed documentation-only PR #3 was open. Its scope does not overlap these additions; an empty search alone is insufficient to establish that no PRs exist. All repository work used the pre-created isolated checkout. Its shared Git metadata was copied into a separate temporary location and only its local pointer changed, so Git writes leave the canonical repository untouched. No additional agents were created, private notes accessed, applications submitted, funders contacted, merge performed or production deployment triggered.

The coordinator clarified that normal automatic PR previews and checks are permitted. The existing Vercel configuration is retained; merges and production deployments remain outside this test.

## Proposed additions

| Funder | Program | Published deadline | Award basis and remaining limits |
| --- | --- | --- | --- |
| [Hacker Initiative](https://hackerinitiative.org/) | Signal/Noise 2026 | November 9, 11:59 pm PST; November 10 07:59 UTC | USD 5,000–25,000. Worldwide community focus with legal/payment restrictions. General guidelines and the dated form differ on committee-member exceptions. Sponsorship and borderline website/media projects remain unresolved. |
| [Linux Australia](https://linux.org.au/grants-program/) | Project Grants 2026; Community Grants 2026 | November 15, 23:59 anywhere on Earth; November 16 11:59 UTC | Two categories under one funder. Membership required. The $30k pool is not an award ceiling; no individual bounds or explicit current denomination recorded. Historical AUD examples remain historical. |
| [People Powered](https://www.peoplepowered.org/climate-democracy-accelerator) | Climate Democracy Accelerator, March 2027 cohort | November 27, 23:59 UTC | USD 10,000 implementation grant after program requirements; additional competitive USD 15,000 bonus kept separate. Government/nonprofit partnership and nonprofit due diligence required. |
| [California Department of Fish and Wildlife](https://wildlife.ca.gov/Grants/Restoration-Grants) | Mojave Desert Tortoise Recovery 2026 | December 3; exact time/timezone unknown | California recovery work. The $2 million allocation is a pool; no individual range inferred. Portal time lacks a timezone; workshop and award schedules conflict. |
| [FUNBIO](https://chamadas.funbio.org.br/floresta-viva-sao-francisco) | Floresta Viva — Águas do São Francisco, Edital 04/2026 | December 2, 19:00 Brasília; 22:00 UTC | BRL 17.76 million pool for up to seven projects, not a per-award range. Two-year nonprofit/cooperative condition verified. Regulation returned no readable text; full legal, cost, duration and sponsorship terms remain unknown. |

Names, aliases, domains and program/source URLs were compared against all 694 baseline records. None of these five funder identities was already present. New source evidence adds 11 source entries, for 1,835 total. Original funders, programs, sources and verification dates remain unchanged. The importer still appends programs; this change does not add a general revision store.

## Coverage and limits

The [maintenance review log](maintenance-review-log.json), run `manual-monday-discovery-2026-10-29`, is the authoritative URL-by-URL ledger. It contains findings, fields actually reviewed, failures, next review dates, eight discovery queries, deduplication and the follow-up queue.

| Measure | Count | Meaning |
| --- | ---: | --- |
| Unique source URLs attempted | 37 | Repeated reads and redirects deduplicated; search-only hits excluded |
| Retrieved | 31 | Includes two unusable page shells |
| Verified | 17 | Only the explicitly listed fields reviewed against official evidence |
| Failed verification | 8 | Six retrieval errors plus Grants.gov's loading shell and FUNBIO's unreadable regulation |
| Reviewed without program-term verification | 12 | Directories, discovery listings, portfolio pages and application wrappers |
| Attempted sources left unreviewed | 0 | Does not mean all discovered opportunities were verified |
| Discovered leads with unreviewed call terms | 5 | Listed separately below; not counted as attempted sources |

The four registry sources were attempted. California's portal led to the CDFW call. Terra Viva's first energy/climate page led to People Powered and MIT Solve. Aggregator terms were not imported: MIT Solve's official November 6 deadline agrees with the catalog, despite the aggregator's November 2 date. Grants.gov returned no usable opportunity list; FundsforNGOs returned 403. No exhaustive federal or aggregator inventory is claimed.

Open-source public goods and community education were covered through Hacker Initiative, Linux Australia and the Co-Develop historical lead. Climate/restoration and community energy were covered through California, People Powered, Brazil and Nigeria sources. Digital inclusion was included through Co-Develop, REA/DARES and UNDP's Young Africa Innovates announcement. That announcement promises incubation and exposure to finance, not a direct cash grant, so it was held outside the cash catalog.

The historical queue began with **zero pending leads**. All four unresolved leads were revisited: Co-Develop still shows winners/partnerships rather than an applicant call; Vrbs returned 403; the IFC accelerator still lacks corroboration from IFC; REA/FCMB pages did not establish an applicant-facing Green Finance Investment Facility offer. All original 94 dispositions and unresolved notes remain intact.

The exact incomplete scope is:

- **California/US:** Grants.gov search inventory unavailable. CDFW cutoff timezone and schedule conflicts unresolved. CPUC's October 30 restricted round was rechecked unchanged; its timezone remains unknown.
- **Nigeria:** GCIP's linked notice returned 502. DARES embedded registration forms were not reviewed. ICCA regular-grant terms were rechecked without establishing current intake; the separate catalytic NGO role needs further review. No named Green Finance Investment Facility offer established.
- **Brazil:** FUNBIO's production overview was recovered after two broken paths; its regulation remains unreadable. Articulação Institucional 11/2026 and Porto Sul 10/2026 were seen in the directory but their call terms remain unreviewed. Casa's directory marked displayed calls closed; individual closed-call guidelines were not all reviewed.
- **South Africa:** NAC's annual call was reviewed as a closed March 2026 round. The current funding directory timed out. PESP7's full call was not reviewed; no NLC listing was verified.
- **Global discovery:** Allianz/Social Shifters MoveNow and Earth Journalism Network's India renewable-energy lead remain aggregator-only leads. These two, the two FUNBIO calls and NAC PESP7 are the five unreviewed leads. Other registry pages, Terra Viva categories and authenticated application steps were outside this bounded pass.

No reopened round was established. This is a discovery test, not a Thursday freshness sweep or a claim to 125 reviewed records.

## Preservation and validation

All **694 previous full funder records**, **721 program revisions**, **1,824 source entries**, the **593 original identities**, **112 prior review-log entries** and all historical queue dispositions are retained. The new [baseline](manual-discovery-baseline-2026-10-29.json) pins their hashes; earlier preservation baselines are unchanged.

The test exposed an importer defect: supplemental imports replaced the October 15 follow-up report's historical coverage with current totals. The exact pre-supplemental published report was recovered byte-for-byte from commit `e0d199f93d3ca6e8f3a67ebdcbc11e3ec6639dbc` as [deepening-result.json](deepening-result.json). The formerly published revision is preserved in the [dated archive](maintenance-history/manual-monday-2026-10-29/research-followup-before.json). [Provenance](deepening-result-provenance.json) records both origins. Validation now compares the whole report with that frozen snapshot, while current totals remain in the live coverage report. The recovered snapshot may already include later policy updates under an October 15 checkedOn label; it does not prove contemporaneous October 15 field counts. Historical preservation assertions were retained; only current catalog totals increased.

Checks passed:

- `python3 scripts/import-data.py`: 699 records, all 593 original identities retained.
- `bun run build`: schema/evidence checks, pinned model integrity and search index for 768 program/overview documents passed.
- `bun run test`: 118 passed, zero failed or skipped. Includes full prior-record hashes, retained input-manifest hashes, source-count reconciliation, exact/unknown deadlines, historical-report regeneration and rejection of deliberately corrupted historical coverage.
- `git diff --check`: passed. Public diff inspected; dependencies/model caches and private data excluded.

Node 24.20.0 and Bun were invoked through the explicit installed PATH. Page catalog totals changed; application logic and layout did not. No fresh desktop/mobile browser inspection is claimed by this run. The report verifies the manual research/import/build/test workflow; scheduling remains untested.

## PR review follow-up

The review corrected nine static catalog references (including metadata and the download filename) from 694 to 699, and updated the current README counts. The build now rejects a static count that disagrees with the generated catalog. A GitHub Actions workflow runs build and tests independently of Vercel’s preview skip policy; it has no deployment step. Local Modern Web Guidance was unavailable in the offline cache; this copy correction preserves the existing semantic markup and layout.
