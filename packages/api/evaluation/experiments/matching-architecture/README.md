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

Results are in the [dated report](reports/2026-11-19.md). The engines the
[`partner-real-v2` plan](../../partner-real-v2-plan.md) compares for D32 were
frozen on 21 November 2026; see [D32 engines](#d32-engines-21-november-2026).

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
| `models.mjs` | The embedding models compared, the upstream files the D32 engines load, and a disk cache for vectors |
| `retrieval-eval.mjs` | Scores the current matcher and the hybrid variants on the v2 development split and the v3 holdout |
| `retrieval-real.mjs` | Runs those engines once, with their v2 cut-offs, on the real-project set `partner-real-v1` ([report](reports/2026-11-19-partner-real-v1.md)) |
| `d32-engines.mjs` | The engines `partner-real-v2` compares, the rule that set their cut-offs, and the engine manifest ([report](reports/2026-11-21-d32-engines.json)) |
| `teams.mjs` | Gap enumeration, the smallest covering team, the reverse direction and the privacy projection |
| `teams-demo.mjs` | Thirteen worked examples and the need-as-query comparison |
| `prototype.test.mjs` | Fourteen checks on the rules the prototype must keep |
| `fixtures/` | Fictional initiatives, labelled team asks for three real programs, and one reading of the catalog's team wording |

## Models and dependencies

No package or lockfile changed. The runtime is the root's pinned
`@huggingface/transformers`. The pinned English model comes from the build's
verified files. The multilingual models are pinned only for this experiment, in
`models.mjs`; using one in the product is a decision for the owner under D32.

| Key | Model | Revision | Licence |
|---|---|---|---|
| `mxbai-xsmall-en` | `mixedbread-ai/mxbai-embed-xsmall-v1` | `b0561d9a97e6b298da39f0ef3e7d3cf153b1b29a` | Apache-2.0 |
| `me5-small` | `Xenova/multilingual-e5-small` | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` | MIT upstream |
| `mminilm-l12` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | `2c4055b12046f11709e9df2c122e59ffbdc2f900` | Apache-2.0 upstream |
| `me5-small-upstream` | `intfloat/multilingual-e5-small`, `onnx/model_qint8_avx512_vnni.onnx` | `614241f622f53c4eeff9890bdc4f31cfecc418b3` | MIT |
| `mminilm-l12-upstream` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, `onnx/model_qint8_avx512.onnx` | `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` | Apache-2.0 |

The two `Xenova` repositories are conversions of upstream models
(`intfloat/multilingual-e5-small` and
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`) and state no
licence of their own. The check below settles what to use instead.

### Licence check, 21 November 2026

Neither conversion states a licence, and both upstream repositories publish their
own ONNX files under their own licence. For the D32 benchmark and anything after
it, take the model files from the upstream repositories, pinned and hashed, and
stop using the conversions. This is a reading of the published licences, not legal
advice.

| | multilingual-e5-small | paraphrase-multilingual-MiniLM-L12-v2 |
|---|---|---|
| Conversion tested here | `Xenova/multilingual-e5-small` at `761b726` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` at `2c4055b` |
| What the conversion states | No `license` field and no licence file. The card names the upstream model as `base_model` and says it adds ONNX weights | The same |
| Upstream revision checked | `intfloat/multilingual-e5-small` at `614241f622f53c4eeff9890bdc4f31cfecc418b3` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` at `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` |
| Upstream licence | MIT, in the card's metadata. No licence file and no copyright line | Apache-2.0, in the card's metadata. No licence or NOTICE file |
| What upstream is built on | `microsoft/Multilingual-MiniLM-L12-H384`, MIT | Not named on the card |
| Upstream's own 8-bit ONNX file | `onnx/model_qint8_avx512_vnni.onnx`, 118,346,824 bytes, added 17 February 2025 | `onnx/model_qint8_avx512.onnx`, 118,412,398 bytes, added 11 October 2024. The `_arm64` and `_avx512_vnni` files are the same bytes |
| Its SHA256 | `dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88` | `783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672` |
| Tokenizer files in the conversion | `tokenizer.json` and `sentencepiece.bpe.model` match upstream byte for byte | `unigram.json` matches. `tokenizer.json` was regenerated (17.1 MB against 9.1 MB upstream) |

What this means:

- MIT and Apache-2.0 both allow use, modification and redistribution, so
  converting either model is allowed, and the permission comes from the upstream
  authors.
- What the conversions leave open is whether the converter claims anything in the
  converted files. They also leave out the licence text that Apache-2.0 asks
  redistributors to include. A mechanical conversion probably adds no rights of its
  own, but that is a legal question this check cannot settle.
- Upstream's own files remove the question: one publisher and one stated licence
  per model, in the same repository. Their 8-bit files are the same size as the
  conversions tested, about 118 MB.

What changes for the benchmark:

- Upstream's 8-bit files are a different quantization from the conversions'
  `onnx/model_quantized.onnx`, so the figures in `reports/2026-11-19*.md` do not
  carry over. The D32 holdout runs on the upstream files.
- The pinned `@huggingface/transformers` 4.2.0 accepts a `model_file_name`
  option, so loading an upstream file by name should need no new dependency. This
  was untried at the time of the check. Both files loaded this way later the same
  day (see [D32 engines](#d32-engines-21-november-2026)).
- If upstream's files do not load or run, the fallback is to convert from
  upstream's weights ourselves and record the tool versions and hashes. That needs
  Python tooling outside the repository.

If a model ships, to a server job or later to browsers:

- Pin the upstream revision and hash every file, as `research/model-assets.json`
  does for the live model.
- Ship the licence with it: the MIT text crediting the authors the E5 card cites,
  or the Apache-2.0 text, plus the model card, as the build does with
  `research/MODEL-README.md`. A file we quantize ourselves from the Apache-2.0
  model also needs a notice saying we changed it.

Not settled by this check:

- Training data. The E5 card lists MS MARCO among its fine-tuning sets, and MS
  MARCO's terms say it is "intended for non-commercial research purposes only".
  The model itself is released under MIT. Whether a dataset's terms reach a model
  trained on it is unsettled, and this check does not decide it. The multilingual
  MiniLM card lists no training data.
- Any legal review.

How it was checked: the Hugging Face model API, file listings and cards at the
revisions above, and the MS MARCO site, read on 21 November 2026. No model file
was downloaded.

### D32 engines, 21 November 2026

`d32-engines.mjs` freezes the engines the
[`partner-real-v2` plan](../../partner-real-v2-plan.md) compares, and writes the
[engine manifest](../../partner-real-v2-engines.json) the v2 runner checks before
it scores.

- **Loading.** Both models load upstream's own 8-bit file through
  `model_file_name`, with `dtype` set to `fp32` so the runtime adds no file suffix.
  The weights stay 8-bit. No package or lockfile changed. On this Mac, in Node 24 on
  the CPU, each model loaded in about a second and embedded a text in about 12 ms.
  That is not a hosting measurement.
- **Cut-offs.** Set on `partner-real-v1` with agent labels, now development data,
  by the rule in the script's header: the most relevant pair on a grid among those
  that pass the holdout's own gates. The first version of the rule kept only the
  recall floor; the [report](reports/2026-11-21-d32-engines.json) keeps what it
  chose.
- **Result.** MiniLM-L12 goes forward at z 3.5 with a keyword veto below z 1.8:
  69% relevant among the top five and 34% recall on v1, against the current
  matcher's 31% and 31%. e5-small does not: no pair on the grid passed the gates.
- **Checks.** The current engine reproduces `matching-real.mjs` on every v1
  query. `--verify` compares the manifest with the scripts, model pins and
  lockfile on disk.

To repeat it, from the repository root:

```sh
node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs --fetch
node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs --output <report.json>
node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs --verify
```

`--fetch` downloads the two models' pinned files, about 263 MB, into `.cache/` and
checks every hash. Once those files are there, the other two make no network
requests.

## Limits

- The inputs are the committed fixtures and the public catalog. No private or user
  text was used, and none was sent anywhere. The only network requests are model
  downloads.
- The v3 holdout was examined before this work. Every number on it is directional.
- The initiatives are fictional and written by the same agent that wrote the
  prototype. The worked examples show mechanics, not quality.
- `fixtures/team-requirement-labels.json` and `fixtures/program-asks.json` are one
  unreviewed reading of catalog text. They are not catalog data.
