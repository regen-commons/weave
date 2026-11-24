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
the describe step holds none since DL-127, so every path ranks the description alone,
as the app does. Every path ranks as of the catalog's `compiledAt`, so the result
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
