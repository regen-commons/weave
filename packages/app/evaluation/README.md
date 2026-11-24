# App evaluations

These check the quality of what the app works out on the device, not only that the
code runs. Each one has a runner here and a test in `test/` that CI runs. Kinds of
support and user flows are described in the
[API evaluation README](../../api/evaluation/README.md#kinds-of-support).

## Fund ranking

`fund-ranking.ts` ranks the 20 initiatives in `fund-ranking-v1.json` on the three
paths that order funds, and keeps the first five of each in
`fund-ranking-v1.snapshot.json`:

| Path | What it is |
|---|---|
| `keyword` | The live site's order unless a person turns on its optional model: the shared rubric with keywords only, one result per fund |
| `funding` | Weave's Funding page in Strongest fit, the order it opens in for an initiative, one result per program |
| `mcp` | The MCP tool `find_funds_for_initiative`, called through its own argument parser |

Fourteen initiatives are paraphrased from public Certified project records (each keeps
its `sourceUri`, and no person's name), and six are invented in the same style to add
Portuguese, Spanish, software, art and a one-line card. Countries and applicant types
are assumed where a record does not say. No initiative has themes: a card confirmed on
the describe step holds none since DL-127. Funding and the MCP tool rank the description
with the catalog topics its Portuguese or Spanish words name (DL-142), as the app does,
and the live site ranks it alone. Every path ranks as of the catalog's `compiledAt`, so the result
depends only on the code and the catalog, and moves on when the catalog does.

```sh
bun run --filter @weave/app eval:funds                       # compare with the snapshot
bun run --filter @weave/app eval:funds -- --update           # accept today's order
bun run --filter @weave/app eval:funds -- --output /private/tmp/funds.json   # first ten on every path
```

`test/fund-ranking-eval.test.ts` fails when any first five differs from the
snapshot, whether the ranking code or the catalog changed. Its message gives each
changed path's old and new first five, marks what is new and what moved, and says
where a program that left went. If the change is intended, update the snapshot in the
same pull request; the diff then shows the new order to reviewers. A renamed program
is not a change, and a hand edit that breaks the file's layout fails with the update
command in its message. The test also checks that the MCP tool and Funding put every
initiative's programs in the same order. Ties are broken by comparing names, so the
update refuses to write a snapshot under any collation but `en-US`, which Node uses
under `en_US`, `C` and `C.UTF-8` alike.

The snapshot says what changed, not whether it is better. That needs labels: a
person's judgment of whether a program fits an initiative (`fits`, `maybe` or
`doesnt`). For each label file listed in `LABEL_FILES`, the gate reports precision at
5 (confirmed fits among the first five, an unjudged place counting as not fitting),
NDCG at 10 (gain 2^grade - 1, so 3, 1 and 0, with the ideal order built from every
confirmed grade) and how many of the first five are judged, for each path. Once a file
holds a confirmed fit, every path must hold the baseline recorded for that file in
`fund-ranking-baseline.json`, and a drop names the path, the metric and each
initiative that fell. New or changed confirmations void that file's baseline until
`-- --record-baseline` writes a new one in the same pull request. A label for a
program the catalog no longer holds fails by name.

Only a person confirms a label, with their name in `by` and the day in `confirmedOn`.
An agent may draft labels, signed `agent: <name>`; drafts stay `draft`, the metrics
leave them out entirely, and the validator refuses a confirmation an agent signed. No
label file exists yet, so precision and NDCG are not gated today.

What this does not cover: the live site's optional semantic ranking, which needs its
model and can differ by machine; the live site as deployed, which runs the rubric from
`codex/funding-commons-demo` rather than this branch's; and the order of Funding That
Fits on an initiative's page, which takes the leads from the same Funding order.

## Extraction

`extraction.ts` puts words through the app's own rules and checks what comes out. On
the describe step the words fill Name, Where you work and About it (`structureWords`
then `fillFields`, as Fill In The Fields runs them). On the needs and offers steps they
become cards (`chunksFrom` and `keywordExtraction`, after `spokenList` for a recording).
Only the keyword rules are measured: the browser's own model, which both steps try where
a browser has one, is not. Each case says what a careful person would want there:

- **Name**: the initiative's name only where the words state one, never a person's.
  Case, accents and punctuation do not count. A name where none was stated is a false
  positive.
- **Where you work**: each place said, scored place by place; Global for worldwide or
  online work.
- **About it**: must hold every `includes` phrase and none of the `excludes`, such as a
  need sentence or a link. Every case expects an About it, so its precision and recall
  are the same number: the share of cases where it was right.
- **Cards**: one per need or offer, scored by key phrase as whole words. Two items in
  one card match neither, and a card for the other list is a false positive. A key
  inside another key is refused, since no card could meet it.

Each field gets precision and recall, overall and by typed or spoken words and by
language.

| Split | Cases | Who wrote it | Runs |
|---|---|---|---|
| `extraction-v1.json` (development) | 48: 26 describe, 12 needs, 10 offers; en, pt, es; typed and spoken | The agent that built the runner, after reading the rules, from the describe-flow walkthrough and hand-over notes, the app's tests and invented cases | CI, in `test/extraction-eval.test.ts` |
| `extraction-v1-holdout.json` | 26: 14 describe, 6 needs, 6 offers | Another agent that read no code or tests | By hand only |

```sh
bun run --filter @weave/app eval:extraction                        # development, against the floor
bun run --filter @weave/app eval:extraction -- --record            # record today's rates as the floor
bun run --filter @weave/app eval:extraction -- --split holdout --output holdout.json
```

CI fails when any field's precision or recall on development falls below
`extraction-v1-floor.json`, and when any field of any case is worse than when the floor
was recorded: it passed and fails now, or it has more wrong or missing items than it had,
even if it already failed. The message names each rate that fell, and each case with
what it wanted and what it got. A case that newly passes is named so the floor can be
raised. Adding or changing a case fails until the floor is recorded again, so the new
case is held too. The floor is today's level, not a target: it stops a regression and
says nothing about whether the level is good enough.

The holdout was frozen by `extraction-v1-holdout.sha256` before its first scored run,
and the runner refuses a changed file. It has been scored once, in
[the 23 November report](reports/2026-11-23-extraction-holdout.json). Its misses have
now been seen, so a rule written to fix them makes it development data; write a new
holdout for the next independent check. (It was scored again after review changed how
places are paired; the rules were the same and so were the numbers.)

| 23 November 2026 | Development (48) | Blind holdout (26) |
|---|---|---|
| Name, precision / recall | 1.00 / 0.81 | 1.00 / 0.50 |
| Where you work | 1.00 / 0.50 | 1.00 / 0.06 |
| About it | 0.92 / 0.92 | 0.64 / 0.64 |
| Cards | 0.88 / 0.79 | 0.62 / 0.42 |

What the holdout shows: the rules never invent a name or a place, but they miss most
places said in sentences ("in Leeds", "in Belo Horizonte"), most Spanish and many
Portuguese names, and most lists typed with commas or said in Spanish. About it keeps
the whole box, so it often holds the speaker's own name ("my name is dara") and a
need sentence. These are agent-written cases and agent-judged labels, so read them as a
direction, not a measured rate for real people's words. Every person and link in both
splits is invented; places are real. A label names a place as fully as the words do, so
"Oaxaca de Juárez" and "San Cristóbal de las Casas, Chiapas" are both whole answers.
