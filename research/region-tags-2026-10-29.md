# Restore CDFW and FUNBIO region-filter discovery

CDFW's Mojave Desert Tortoise Recovery call now carries the **North America** navigation tag. FUNBIO's São Francisco call carries **Latin America & Caribbean**. Previously both records were searchable without a region filter but disappeared when the expected work region was selected.

The [California Grants Portal](https://www.grants.ca.gov/grants/mojave-desert-tortoise-recovery/) locates the CDFW work within California tortoise range/recovery units. The [FUNBIO call](https://chamadas.funbio.org.br/floresta-viva-sao-francisco) locates projects in the Sobradinho and Itaparica reservoir watershed areas in Brazil. These locations support the broad navigation tags. They do not establish applicant domicile or continent-wide project eligibility.

Only the two enrichment-region arrays in the supplemental input change. The normal importer projects those tags into each public record's region arrays. Program geography, applicant conditions, sponsorship uncertainty, award terms, deadlines, source evidence and verification dates remain intact. The existing UI already labels these as broad coverage tags and directs readers to country eligibility.

The [dated revision archive](maintenance-history/region-tags-2026-10-29/revisions.json) retains both exact previous public funder records and input entries, their source commit, official geographic evidence and before/after region values. It also records hashes for the entire prior 699-record catalog and input manifest. Tests reconstruct both exactly, allowing only these region fields to differ. Older preservation baselines and review logs are unchanged. This focused archive does not implement the separate general revision importer or apply the Thursday freshness proposals.

Validation covers search combined with the appropriate region, rejection from an unrelated region, reproduction of the original gap from the archived records, complete prior-record recovery and import regeneration. Build, full tests and browser results are recorded in the PR.

## Validation results

- `python3 scripts/import-data.py`, `bun run build`, all 129 tests and `git diff --check` pass.
- CDFW plus North America returns one result at 1440×1000; FUNBIO plus Latin America & Caribbean returns one result at 390×844. Geographic scope, unknown applicant domicile/registration rules, the two-year FUNBIO condition and cutoff uncertainty remain visible. No horizontal overflow or browser warnings/errors observed.
- All 699 prior full records and the entire input manifest reconstruct exactly from the archive and current data. Program conditions, source evidence, verification dates and the maintenance review log remain unchanged.
