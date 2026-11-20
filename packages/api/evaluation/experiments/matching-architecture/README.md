# Matching architecture experiment

An offline prototype for the [unified matching proposal](../../../../../docs/platform/research/matching-architecture.md).
It measures three things on committed data: how a funding program fits the shape of
an initiative's needs and offers, how retrieval options compare on the frozen
matching fixtures, and whether gap-driven teams can be built from what the funding
engine already reports.

Nothing in the app, the API or the live site imports these files. They read
production modules (`dist/matching.mjs`, `packages/api/src/partner-matcher.ts`,
`partner-concepts.ts`) and never change them. `bun run --filter @weave/api test`
does not run the test file here.

Results are in the [dated report](reports/2026-11-19.md).

## Run it

From the repository root, after `bun install --frozen-lockfile` and `bun run build`
(the build verifies the pinned model files and writes the catalog data):

```sh
node packages/api/evaluation/experiments/matching-architecture/catalog-shape.mjs
node packages/api/evaluation/experiments/matching-architecture/teams-demo.mjs
node packages/api/evaluation/experiments/matching-architecture/retrieval-eval.mjs
node --test packages/api/evaluation/experiments/matching-architecture/prototype.test.mjs
```

Add `--output <file>` to the first three to write the full JSON report.

`retrieval-eval.mjs` needs network access the first time. It downloads two
multilingual models from Hugging Face, about 135 MB each, into `.cache/` in this
folder, which git ignores. Vectors are cached there too, so later runs can use
`--offline`. `--models mxbai-xsmall-en` limits the run to the model the repository
already pins and needs no download.

## What is here

| File | What it does |
|---|---|
| `shape.mjs` | The shared shape: a party with offers and asks, conditions on an entry, and where each statement comes from |
| `catalog-shape.mjs` | Maps all catalog programs into that shape and counts what fills it |
| `models.mjs` | The three embedding models compared, with a disk cache for vectors |
| `retrieval-eval.mjs` | Scores the current matcher and the hybrid variants on the v2 development split and the v3 holdout |
| `teams.mjs` | Gap enumeration, the smallest covering team, the reverse direction and the privacy projection |
| `teams-demo.mjs` | Thirteen worked examples and the need-as-query comparison |
| `prototype.test.mjs` | Twelve checks on the rules the prototype must keep |
| `fixtures/` | Fictional initiatives, labelled team asks for three real programs, and one reading of the catalog's team wording |

## Models and dependencies

No package or lockfile changed. The runtime is the root's pinned
`@huggingface/transformers`. The pinned English model comes from the build's
verified files. The two multilingual models are not pinned anywhere in the
repository; using one in the product is a decision for the owner under D32.

| Key | Model | Revision | Licence |
|---|---|---|---|
| `mxbai-xsmall-en` | `mixedbread-ai/mxbai-embed-xsmall-v1` | `b0561d9a97e6b298da39f0ef3e7d3cf153b1b29a` | Apache-2.0 |
| `me5-small` | `Xenova/multilingual-e5-small` | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` | MIT upstream |
| `mminilm-l12` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046f11709e9df2c122e59ffbdc2f900` | Apache-2.0 upstream |

The licences of the two `Xenova` conversions are those of the upstream models
(`intfloat/multilingual-e5-small` and
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`). The conversion
repositories state no licence of their own, which needs checking before any use
beyond this experiment.

## Limits

- The inputs are the committed fixtures and the public catalog. No private or user
  text was used, and none was sent anywhere. The only network requests are model
  downloads.
- The v3 holdout was examined before this work. Every number on it is directional.
- The initiatives are fictional and written by the same agent that wrote the
  prototype. The worked examples show mechanics, not quality.
- `fixtures/team-requirement-labels.json` and `fixtures/program-asks.json` are one
  unreviewed reading of catalog text. They are not catalog data.
