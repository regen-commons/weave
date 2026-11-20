# Retrieval options on real public projects: results, 19 November 2026

On the real-project set `partner-real-v1`, multilingual MiniLM-L12 with keyword
evidence it can veto doubled the share of relevant suggestions over the current
matcher (64% against 31%) and found slightly more (36% against 31% recall at
five). It also gave Portuguese queries relevant suggestions, where the current
matcher gave almost none. No engine came near the spec's 80% target, and the 91%
this engine reached on the synthetic v3 holdout did not carry over.
multilingual-e5-small with its veto answered almost every query, all eight no-match
queries included, and 24% of its suggestions were relevant.

This was one run, untuned, with the cut-offs the experiment chose on v2 development.
Full output is in [the JSON beside this file](2026-11-19-partner-real-v1.json); the
script is [`retrieval-real.mjs`](../retrieval-real.mjs).

## What this does and does not show

- **Agent labels only.** Two agent instances per domain labelled every pair. No
  person has judged them, and the agents disagreed on 271 pairs against 276 they
  agreed were relevant. The human worksheet run may draw the line elsewhere.
- **An examined set.** The current matcher's results and misses on this set were read
  before this run. Every number here is regression evidence, not an independent
  result.
- **A small, narrow corpus.** 140 public projects, each with at most two passages of
  at most 600 characters, mostly English land and ecology work, with 13 Spanish
  projects and 1 Portuguese. All candidates are public work: shared needs and offers,
  the device snapshot, PostgreSQL ranking and phone performance are not exercised.
- **Small language groups.** One query moves Portuguese or Spanish recall by about
  four to five points. No intervals are given.
- **Not grounds for a decision.** Nothing here is grounds for choosing a threshold or
  shipping a model. D32 approved testing in server jobs, not a model dependency,
  hosting or CSP change.

## Results

135 queries with at least one fitting project and 8 with none, as both agents agree.
"Relevant among top five" counts suggestions with a resolved label on the 135
positive queries; suggestions to a project the agents disagree on are left out and
counted in the last column. The 17 queries with no agreed fitting project and at
least one unresolved pair are scored in no row.

| Engine | Relevant among top five | Recall at five | Positive queries with no suggestion | No-match queries with a suggestion | Unresolved suggestions left out |
|---|---:|---:|---:|---:|---:|
| Current matcher (`partner-concepts-v2`) | 75 of 241, 31% | 31% | 42 of 135 | 2 of 8 | 24 |
| multilingual MiniLM-L12, keywords with veto | 81 of 127, 64% | 36% | 45 | 4 of 8 | 14 |
| multilingual MiniLM-L12, meaning only | 64 of 97, 66% | 30% | 60 | 4 of 8 | 7 |
| multilingual-e5-small, keywords with veto | 91 of 373, 24% | 40% | 1 | 8 of 8 | 23 |

Queries shown at least one fitting project: 57 for the current matcher, 62 with the
MiniLM veto, 51 for MiniLM meaning only and 73 for e5-small. Over the top three,
which is what the app shows, the shares are 38%, 63%, 66% and 25%.

### By language

| Language and sample | Engine | Relevant among top five | Recall at five | Positive queries with no suggestion | No-match queries with a suggestion |
|---|---|---:|---:|---:|---:|
| English: 93 positive, 7 no-match | Current matcher | 66 of 195, 34% | 37% | 25 | 2 of 7 |
| | MiniLM-L12, keywords with veto | 66 of 102, 65% | 40% | 24 | 4 of 7 |
| | MiniLM-L12, meaning only | 52 of 77, 68% | 33% | 36 | 4 of 7 |
| | e5-small, keywords with veto | 72 of 247, 29% | 44% | 1 | 7 of 7 |
| Spanish: 23 positive, no no-match | Current matcher | 8 of 39, 21% | 30% | 4 | none |
| | MiniLM-L12, keywords with veto | 8 of 15, 53% | 30% | 11 | none |
| | MiniLM-L12, meaning only | 5 of 10, 50% | 22% | 14 | none |
| | e5-small, keywords with veto | 13 of 53, 25% | 41% | 0 | none |
| Portuguese: 19 positive, 1 no-match | Current matcher | 1 of 7, 14% | 5% | 13 | 0 of 1 |
| | MiniLM-L12, keywords with veto | 7 of 10, 70% | 23% | 10 | 0 of 1 |
| | MiniLM-L12, meaning only | 7 of 10, 70% | 23% | 10 | 0 of 1 |
| | e5-small, keywords with veto | 6 of 73, 8% | 16% | 0 | 1 of 1 |

On the 15 positive cross-language queries, the current matcher made 17 resolved
suggestions and none was relevant. The MiniLM veto made 7, 4 of them relevant, and
found 17% of the fitting projects.

### Where wrong suggestions came from

Suggestions both agents call irrelevant, over the 135 positive and 8 no-match
queries, by the evidence that let them in.

| Engine | Keywords only | Meaning only | Both |
|---|---:|---:|---:|
| Current matcher | 168 | 0 | 0 |
| MiniLM-L12, keywords with veto | 13 | 38 | 2 |
| MiniLM-L12, meaning only | 0 | 40 | 0 |
| e5-small, keywords with veto | 10 | 285 | 9 |

### Ranking with no threshold (diagnostic)

Each model's five most similar projects for every query, whatever the score. No one
would ship this; it shows what ranking alone can find.

| Model | Relevant among top five | Recall at five | No-match queries with a suggestion |
|---|---:|---:|---:|
| multilingual MiniLM-L12 | 121 of 633, 19% | 52% | 8 of 8 |
| multilingual-e5-small | 98 of 641, 15% | 42% | 8 of 8 |

## What these runs say

1. **The veto buys precision, not recall.** Against the current matcher, the MiniLM
   veto doubled the relevant share and cut wrong suggestions from 168 to 53, but
   recall rose only 5 points and it stayed silent on 45 positive queries instead
   of 42. Offers stay hard: 21% recall against 52% for needs.
2. **The v3 numbers did not travel.** The veto engine fell from 91% relevant on v3
   to 64% here, and meaning only from 97% to 66%. Both now answer half the no-match
   queries, all four of them needs. e5-small's cut-off lets almost everything
   through, as its v3 run already hinted.
3. **On real text, meaning brings most of the errors.** On v3, nearly every wrong
   suggestion in the hybrid came in on keywords. Here, with the veto, 15 wrong
   suggestions came in on keywords (alone or with meaning) against the current
   matcher's 168, and 38 of the 53 came in on meaning alone. The hybrid without a
   veto was not run, so this does not measure the veto by itself.
4. **Ranking is weaker on this corpus.** MiniLM's five most similar projects hold 52%
   of the fitting ones, against 93% on v3. Meaning-only suggestions are a subset of
   those five, so no threshold on meaning alone could find more than 52% here.
5. **Portuguese improves, from a low base.** The Portuguese row goes from 1 relevant
   suggestion in 7 to 7 in 10, on 19 queries.

One more finding about the method: three projects (`rp-033`, `rp-082`, `rp-091`)
keep no text after the experiment's clause rules, which drop any clause with a
negation word or a request ("without fear", "no land mammals", "seeking funding").
They are relevant to six query pairs that the model engines cannot reach by meaning.

## How it ran

Settings were fixed and committed before the first scored run, in `bcedaee`, whose
script header lists them. In order:

1. The models were downloaded by running `retrieval-eval.mjs --models
   me5-small,mminilm-l12`. Its output matched the committed
   [`2026-11-19-retrieval.json`](2026-11-19-retrieval.json) in every field but timing,
   so the downloaded files behave as the ones the experiment used.
2. A pre-flight scored nothing new: both models recompute their committed cut-offs on
   v2 development (MiniLM-L12 z at least 2.9 with keywords vetoed below z 2.02,
   e5-small z at least 2.1 with keywords vetoed below z 1.77). The production
   matcher's accepted projects match `matching-real.mjs`'s top five on all 160
   queries.
3. One scored run wrote the JSON beside this file. The script stops before scoring if
   a cut-off, the keyword evidence or the current matcher's committed result does not
   reproduce; none did.
4. A second run with `--offline` wrote a byte-identical file (SHA-256
   `8381165d1100697a27354cfed8438a4c87395b33ffb518b359c82c618665b6e2`).

No threshold, veto, prompt, label or setting changed after a score was seen. Two
things had to change for the experiment to run on this set at all: its candidates
hold one passage and its keyword evidence is per passage, while projects here hold up
to two. So each project is one candidate whose passages are separate clauses, and
keyword evidence is the production matcher's accepted projects, at most ten per
query. `evaluateReal` in `matching-real.mjs` and `prepare` in `retrieval-eval.mjs`
each gained one optional argument so the new script reuses their definitions; with
the defaults, both reproduce their committed output byte for byte.

```sh
node packages/api/evaluation/experiments/matching-architecture/retrieval-real.mjs --output <file>
node packages/api/evaluation/experiments/matching-architecture/retrieval-real.mjs --offline --output <file>
```

Run on Node 24.20.0, Apple M4. The first run needs the two models in `.cache/`, which
`retrieval-eval.mjs` downloads; `--offline` then uses cached vectors only.

## Models and licences

| Key | Repository | Revision | Licence the repository states | Upstream licence, as `models.mjs` records it |
|---|---|---|---|---|
| `mminilm-l12` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046f11709e9df2c122e59ffbdc2f900` | None | Apache-2.0 (`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`) |
| `me5-small` | `Xenova/multilingual-e5-small` | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` | None | MIT (`intfloat/multilingual-e5-small`) |

Checked on 19 November 2026 through the Hugging Face model API at each pinned
revision: neither model card declares a licence, and neither repository carries a
licence tag. A separate licence file in either repository was not looked for, and
the download brought only configuration, tokenizer and weight files. The upstream
licences were not re-checked here. Settle both before any use beyond this experiment.
