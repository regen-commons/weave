# Partner matching evaluation

The local matcher now recognizes a bounded English vocabulary of related activities,
including mapmaking/cartography, bicycle repair/bike maintenance and soil analysis/soil
testing. It can use a Certified project's documented work even when the project has
never stated a need or offer. This is a rules-based improvement, not general language
understanding or a new AI model.

## What runs

From the repository root:

```sh
bun run --filter @weave/api eval:matching --split development --compact --output /private/tmp/weave-development.json
bun run --filter @weave/api eval:matching --split holdout --compact --output /private/tmp/weave-holdout.json
bun run --filter @weave/api eval:matching --split holdout --review-output /private/tmp/weave-review.jsonl --review-key-output /private/tmp/weave-review-key.jsonl
```

The last command writes an unscored worksheet for a separate reviewer. It omits the
expected labels, algorithm rankings and source IDs that reveal synthetic labels. Each
pair has a random opaque ID. Give reviewers only the worksheet; retain the optional
separate key for joining their judgments later. The key must use a new file path.
The worksheet contains only the synthetic query and public-project fixture text. No Certified account, live API or private initiative is
used. Do not add private initiative text to this public repository.

`matching-v2.json` contains 176 queries and 200 fictional public project profiles:
art, software, research and place-based work, in both need and offer directions.
Each split contains 88 queries, 100 projects, 20 activity families and four no-match
families. Each activity has a literal description, related wording, a negation, a
request and a nearby but different activity. Repeated wording variants are correlated;
there are five activity families per domain in the held-out split, not 22 independent
examples. Both sides of a query/project family stay in the same split.

The dataset and frozen `partner-lexical-v1` baseline have SHA-256 checks. The baseline
comes from `eff987424f8aae7546cc11963adad8ba62f36587`, with only its type-import path
adjusted. Dataset version 1 was withdrawn before any held-out scoring because the same
no-match query occurred in both splits. Version 2 replaces those eight no-match
families with distinct activities; no relevance label was changed to improve a score.
The validator rejects repeated normalized text, family leakage and invalid judgments.

Only the development split runs in ordinary CI. Run the held-out command after freezing
the candidate. Once its misses have been examined, do not tune against this same holdout
and call a later run independent validation. Preserve the report; collect a new version
for the next quality claim. The vocabulary and both fixture splits were authored by the
same agent. The split is held out from scoring/tuning, **not from the author's knowledge**.
Its high scores are regression evidence, not an unbiased estimate of usefulness.

## Results and what they establish

The [original report](reports/2026-11-11.json) preserves the pre-review engine results
and machine. After independent code review, the
[development report](reports/2026-11-12-development.json) and
[reviewed-holdout regression report](reports/2026-11-12-holdout-regression.json) record
the corrected engine hashes, unchanged corpus and baseline, domain breakdowns and every
miss. These were run with the commands above on the same Node 24.20.0 / Apple M4
environment. `--compact` omits successful per-query rows, keeping failure rows and all
summaries. Omit it for the full per-query output. On the 88 already-reviewed holdout queries:

| Path | Baseline recall | New recall | New precision among returned results |
|---|---:|---:|---:|
| Indexed retrieval simulation, refreshed public index | 75% | 97.5% | 100% |
| First 80 projects downloaded to the device | 57.5% | 77.5% | 100% |
| Full fixture corpus, isolating final ranking | 75% | 97.5% | 100% |

The software cases reach 90% recall in each direction; the other three domains reach
100% in this small synthetic set. The remaining software case says only “quality
assurance,” which does not establish software testing. The matcher deliberately lacks
that ambiguous equivalence. That label needs independent review, not a new alias added
to make the score perfect. No held-out no-match query produced a result, and public work
never became a confirmed need or offer. These are finite fixture assertions. Independent code review then found and fixed
reordered literal evidence misses, unrelated-clause phrase matches and a dependent
“but” request misread as experience. Regression tests also cover activity lists and
field boundaries. The reviewed holdout was rerun after those fixes; the scores above
were retained, but this rerun is explicitly regression evidence, not fresh held-out
validation. The fixture data and judgments were not changed.

The device result misses projects outside its 80-project snapshot. Better ranking
cannot recover unseen evidence. Sixteen positive device queries abstain rather than
return weak alternatives. The evaluator reports candidate recall, final recall,
precision among the results actually returned (up to five), no-match errors and
abstentions separately, including each domain/direction. Empty results do not earn
perfect precision, and count as zero recall when a relevant project exists.

Indexed retrieval here simulates token overlap over expanded public text. It is not
PostgreSQL's `ts_rank_cd` or a whole-network coverage test. The separate opt-in
`partner-index-postgres.test.ts` exercises the actual restricted index writer and SQL
shortlist in disposable PostgreSQL: related wording, unchanged source evidence,
version-driven reindexing and removal of indexing permission. It passed locally on
PostgreSQL 17.11 with pgvector installed; no vectors were generated or queried.

The reviewed full local `bun run ci` passed: 628 tests passed and 39 opt-in tests
were skipped. API and app tests and typechecks passed separately. The new database
check above was rerun explicitly against disposable local PostgreSQL, including the
restricted writer role; its temporary container was then stopped. `git diff --check`
and guidance checks passed. Two independent code reviews covered the matcher and
evaluation harness; the matcher was reviewed again after its fixes.

Browser proof is **fixture**, in Codex's in-app browser. A team need was changed to
“Mapmaking” and saved privately. A project describing cartography appeared with
“Related wording: mapmaking / cartography” and unknown availability. The team remained
not shared. The disclosure was checked at 360 px and 1280 px in both themes, with keyboard
opening and visible focus. Tab navigation reached the source link. This is not
hosted authorization proof.

Ranking timings in the report exclude retrieval, transfer, model initialization and
concurrent user load. CI ran concurrently with the measurement, so these timings are
not a latency benchmark. The existing scale benchmark remains a separate experiment.

## Implementation and activation boundaries

- `partner-concepts.ts` owns the finite phrase vocabulary. Generic words such as
  “mapping,” “support,” “model” and “capital” are not aliases by themselves.
- The public index expands **public passages only**, in `lexical_text`. Original
  passages, record identity, content hash and provenance remain unchanged. This
  improves public-project retrieval without adding a SQL column or migration.
- The browser and server use the same final matcher. Related wording must occur in
  supported evidence within phrase boundaries. Reordered literal evidence can qualify
without a vocabulary alias, and a supported activity in a list can qualify on its own.
Negation, requests presented as experience, explicit shared-entry
  conflicts, expiry and ownership exclusions still apply. A lone shared word in an
  otherwise specific unrecognized request is insufficient. These are conservative
  English heuristics; multilingual and more complex sentences can be missed.
- Public work becomes `inferred_capability` for a need, or `potential_use` for an
  offer. Availability stays unknown. Related phrases never create confirmed offers,
  publishing authority, workspace access or a reciprocal obligation.
- Private needs and offers stay on-device during suggestion ranking. The unchanged
  snapshot endpoint receives only the workspace ID. Network matching still requires
  the existing explicit sharing and authorization checks.
- Shared-entry SQL retrieval is unchanged. Related wording can improve its final
  ranking only when those candidates reach the matcher. This change expands retrieval
  for indexed public projects, not every shared need and offer.
- `PROJECT_EXTRACTION_VERSION` now includes the phrase-vocabulary version. Before a
  later authorized index refresh, increment the manifest generation: the old generation
  with a changed projection hash is correctly rejected. The refresh rebuilds public
  lexical text; it does not rewrite Certified records. Existing indexes do not gain
  these phrases merely by deploying the app. No hosted refresh was run here.
- Production pilot, semantic-retrieval switch, authentication, tester gates and
  publishing settings are unchanged. No deployment or migration is part of this work.

## Independent quality evaluation still required

The [technical spec's quality criteria](../../../docs/platform/05-technical-spec.md#quality-and-performance-proof)
remain open. Before making a release-quality claim:

1. Collect permitted real Certified passages, sparse profiles, unfamiliar wording,
   language variation, hard negatives and queries with no relevant project. Preserve
   source URI, CID, field, collection date and permission evidence outside this synthetic
   fixture. Obtain at least 20 independently authored needs and 20 offers per domain;
   template variants do not substitute for independent examples.
2. Have two domain reviewers judge query/project pairs without engine rankings or
   expected labels. Record relevant, irrelevant or uncertain, plus rationale. Publish
   disagreement and adjudication counts. Keep unresolved judgments separate from scored
   examples and report their coverage.
3. Group duplicate projects, related records and paraphrases before splitting. Freeze
   the corpus, labels, sampling method, recall floor and engine versions before tuning.
   Use development for tuning and a separately maintained holdout for the final run.
4. Compare candidate recall and top-five relevance for both directions, domains and
   evidence kinds. Compare the baseline and new matcher on the same candidates as well
   as through actual retrieval. Retain no-match errors, abstentions and regressions;
   an 80% relevance target alone can conceal low recall.
5. Test refresh/withdrawal and access rules against the hosted database later, then
   measure realistic network, cold-start and phone performance. Broad semantic retrieval
   stays disabled until its own comparison and activation approval.
