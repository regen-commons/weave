# Partner holdout for D32 (`partner-real-v2`): plan

A plan for the owner's decisions, written on 21 November 2026. Nothing here is
built: no query is written, no model is downloaded and no engine has changed.

## What it decides

One question: in server jobs, should partner suggestions come from multilingual
MiniLM-L12 with keyword veto, from multilingual-e5-small with keyword veto, or stay
with the current matcher (`partner-concepts-v2`)? This follows the D32 answer of
19 November 2026 in [open decisions](../../../docs/platform/open-decisions.md).
It does not decide hosting, browser use or the live site's fund vectors, and a
result here approves no model dependency.

## Why a new set

- **v3 is synthetic and examined.** Agents wrote and judged it, and its misses
  have been read.
- **partner-real-v1 is examined too.** The current matcher's misses were read
  before the model run, and every engine's results on it are now published.
- **Its pool cannot judge the models.** The v1 worksheet pools the lexical
  baseline's and the current matcher's top five, so a model suggestion outside
  that pool has no human label.
- **Its key is public.** The worksheet key and the agent labels are committed in
  this public repository. Blind review depends on reviewers not looking.
- **The model files change.** The
  [licence check](experiments/matching-architecture/README.md#licence-check-21-november-2026)
  moves both models to upstream's own 8-bit files, a different quantization, so
  the 19 November figures do not carry over.

## What the corpus allows

Read from `GET https://weave.regencommons.com/api/public-projects` on 21 November
2026: index status `bounded`, checked at 04:19 UTC, 993 projects listed. The v1
corpus rules in `scripts/partner-real-corpus.mjs` leave 979. They drop 1 QA or test
listing, 10 with placeholder text and 3 with contact details.

| What | Count |
|---|---:|
| English | 958 |
| Spanish | 13 |
| French | 5 |
| Portuguese | 1 |
| Other | 2 |
| Place, by the v1 theme keywords | 825 |
| Research | 68 |
| Software | 67 |
| Art | 19 |
| Projects not in v1 | 839, all English: 767 place, 37 research, 35 software, no art |
| Projects with two passages | 965; median text 230 characters, a tenth under 99 |

Every non-English project and every art project is already in v1. A set built only
from fresh projects therefore cannot test non-English or art projects. The
language test moves to the query side: Portuguese and Spanish needs and offers
against mostly English projects, which is also what Weave members will do. Art
stays thin however the set is built.

## Design

### Corpus

All 979 projects, frozen with v1's rules and a new salt, without sampling. Engines
search the whole index in production, so the holdout does too. Results are
reported separately for the 140 projects v1 used and the 839 it did not.

### Queries

160 queries: 20 needs and 20 offers in each of art, software, research and place,
the technical spec's minimum. Languages: 100 English, 40 Portuguese and 20
Spanish, as the user confirmed on 21 November 2026. Two kinds:

- **Seeded, about 100.** The writer sees one project drawn at random, from the new
  projects first and from the 19 art projects for art. They write a need that
  project could serve or an offer it could use, in their own words. A check flags
  any query that reuses the project's distinctive words. The seed is a known fit
  that no engine picked, so whether each engine finds it measures recall in a way
  the pool cannot bias. About 16 of these are hard negatives instead: a need or
  offer the seed cannot serve that still shares its vocabulary.
- **Blind, about 60.** The writer sees no project, only the domain, direction,
  language and a description of the initiatives Weave serves. Some will have no
  fitting project, which tests whether an engine stays quiet. About 20 are sparse,
  a few words with no description.

The writers are agent instances, one per domain as in v1, that have never read the
matcher, `partner-concepts.ts`, the experiment, the v1 to v3 fixtures or any
result. They write all 160, as the user decided on 21 November 2026; people
write none.

### Engines, frozen before the pool is built

1. The current matcher, `partner-concepts-v2`, as the bar to beat.
2. Multilingual MiniLM-L12 with keyword veto.
3. Multilingual-e5-small with keyword veto.

Both models load upstream's own 8-bit ONNX files at pinned revisions, with every
file hashed. Their cut-offs are set again on development data with a rule fixed
in advance: `partner-real-v1`, with its agent labels, becomes development data
beside v2 development. The proposed rule is the highest share of relevant
suggestions among the top five on v1, with recall at five no lower than the
current matcher's there. e5-small needs this most: at its v2 cut-off it answered
all eight no-match queries on v1. Engine settings, scripts and model hashes go into
a committed manifest before any query is run.

The frozen lexical baseline is left out. It is known to be weak (19% relevant on
v1), and its suggestions would add reviewer time without informing this choice.

### Pool and worksheet

For each query the pool holds every suggestion the three engines make (their top
five), the seed project and two seeded random controls. In the v1 runs, those
thresholded engines' suggestions came to 4.5 projects per query on average (at most
10) over 140 projects. Adding each model's top five with no threshold raised that to
9.6. With 979 projects the engines overlap less, so treat the estimates below as
lower bounds.

The worksheet groups pairs by query, so a reviewer reads each need or offer once,
and shuffles the projects within it. It shows no engine, seed or label. Packets
are cut by domain.

| | Suggestions only (recommended) | Also each model's top five, unthresholded |
|---|---|---|
| Pairs per query | about 7 | about 12 |
| Pairs for 160 queries | about 1,100 | about 1,900 |
| Time per reviewer, at an assumed 15 to 20 seconds a pair | 4.5 to 6 hours | 8 to 10.5 hours |
| What it adds | Every suggestion any engine would show is judged | How much a different threshold could find |

### Judging

Two reviewers, labelled A and B and never named in the repository, judge with the
unchanged rubric `partner-real-rubric-v1`: relevant, irrelevant or uncertain, with a
short reason for relevant and uncertain. Before starting, they judge 20 pairs from
the v1 worksheet together to calibrate; those pairs are not scored. Then they work
independently and compare nothing until both finish. A third person or a recorded
joint discussion settles each disagreement. Uncertain pairs stay out of the scores
and are reported beside them, with raw agreement and Cohen's kappa.

### Sealing

- The holdout files are not committed until the scored run. Before reviewers
  start, a manifest of SHA-256 hashes is committed: corpus, queries, worksheet,
  key, engine settings, model files and scoring script. The runner refuses to score
  if any file differs.
- Until then the files live in private storage the owner chooses. The key never
  goes to reviewers.
- Query writers never see an engine. Whoever builds the engines never sees the
  queries before the manifest is committed, and the pool is built only from frozen
  engines.
- There is one scored run. After it the set is examined, and later runs are
  regression evidence.

### Scoring

The measures keep the spec's definitions, as `scripts/matching-real.mjs` applies
them:

- relevant suggestions among the top five, over resolved suggestions on queries
  with a fitting project, and among the top three
- seed recall on seeded queries, and recall at five against the pooled relevant
  projects
- queries shown at least one fitting project, and positive queries with no
  suggestion
- no-match queries with a suggestion
- unsupported confirmations, explanation and provenance failures

Each measure is broken down by domain, direction, language, seeded or blind, and
v1 or new project. Intervals come from a bootstrap over queries, paired against the
current matcher. v1's intervals treated suggestions as independent and came out too
narrow.

### Proposed decision rule

The owner confirms or changes these before the reviewers start:

1. **Hard gate.** No unsupported confirmation, explanation or provenance failure.
2. **Relevance.** More relevant suggestions among the top five than the current
   matcher, with the 95% interval of the paired difference above zero.
3. **Recall floor.** Seed recall no more than 5 points below the current
   matcher's. This is the recall floor the spec asks to agree before tuning,
   relative to today's matcher, because no absolute floor has been agreed. It
   takes the place of setting the floor from v1's human review, which was
   replaced on 21 November 2026.
4. **Languages.** Portuguese and Spanish seed recall above the current matcher's.
5. **Quiet when nothing fits.** No-match queries with a suggestion no more than
   10 points above the current matcher's share.
6. **Host budget.** Met on the hosting tier, as measured below.

If both candidates pass, the one with more relevant suggestions wins, and on a tie
the smaller one. The spec's 80% target is reported for each domain and direction
but not used to choose, since the current matcher misses it too.

## Host measurement

Kept apart from quality. A server job script in `packages/api` loads one model from
its pinned upstream files, embeds the 979 projects, then answers the 160 queries.
It runs locally on Node 24 first, then on the hosting tier through a preview
deployment, which needs the owner's go-ahead. It records:

- download and on-disk bytes, and the function bundle against the host's limits
- cold start, from process start to the first vector
- warm query embedding at p50 and p95
- time to embed the whole corpus
- peak memory

The spec's budget is first useful results within 2 seconds at p95 for an entry
already indexed, with cold starts measured separately. Production and the live
site are not touched.

## Order of work

1. The owner answers the questions below.
2. Engines are prepared on development data and the manifest is committed, in a
   draft PR.
3. The corpus is frozen and the queries written. An agent checks the quotas,
   without labelling anything.
4. The pool, worksheet and key are built, their hashes committed and the packets
   handed to reviewers.
5. Calibration, independent judging and adjudication.
6. One scored run. The files and the report are committed in a draft PR.
7. Host measurement, with the owner's go-ahead for the preview deployment.
8. The owner decides.

## Questions for the owner

1. Who are the two reviewers, and can each give about 5 to 6 hours, or 8 to 10.5
   for the larger pool?
2. Should this review replace the human review of `partner-real-v1`? **Answered
   on 21 November 2026: yes.** v1 serves as development data with its agent
   labels, and its worksheet does not go to reviewers. Its human review would
   mostly have rechecked an examined set whose pool cannot judge the models.
3. Is 100 English, 40 Portuguese and 20 Spanish the right language mix?
   **Answered on 21 November 2026: yes, keep it.**
4. Should blind agent instances write all the queries, or should people write some?
   **Answered on 21 November 2026: agents write all of them.**
5. Where do the sealed files live until the scored run?
6. Do the margins in the decision rule (5 and 10 points) and the relative recall
   floor stand?

## What it will not show

- Shared needs and offers, the device snapshot and PostgreSQL ranking. Every
  candidate is public work.
- Projects' full text. The public list shows at most two passages of 600
  characters, and the index can hold more.
- Non-English or art projects. There are too few, and v1 has seen them all.
- Phones and browsers. D32 tests server jobs first.
