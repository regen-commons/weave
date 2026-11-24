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
leave them out entirely, and the validator refuses a confirmation an agent signed. The
one label file holds drafts only, so precision and NDCG are not gated today: see
[Labels](#labels).

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
  Case, accents and punctuation do not count, and a case may list other ways of writing
  the same name, such as "Tech & Sun". A name where none was stated is a false positive.
- **Where you work**: each place said, scored place by place; Global for worldwide or
  online work.
- **About it**: must hold every `includes` phrase and none of the `excludes`, such as a
  need sentence or a link. Every case expects an About it, so its precision and recall
  are the same number: the share of cases where it was right.
- **Cards**: one per need or offer, scored by key phrase as whole words. Two items in
  one card match neither, and a card for the other list is a false positive. A key
  inside another key is refused, since no card could meet it.
- **Link**: the website, on the cases that name one. `https://`, `www.` and a trailing
  slash do not count.

Each field gets precision and recall, overall and by typed or spoken words and by
language.

| Split | Cases | Who wrote it | Runs |
|---|---|---|---|
| `extraction-v1.json` (development) | 61: 31 describe, 16 needs, 14 offers; en, pt, es; typed and spoken | The agent that built the runner, after reading the rules, from the describe-flow walkthrough and hand-over notes, the app's tests and invented cases; Green Goods and Tech and Sun from their owner's profile | CI, in `test/extraction-eval.test.ts` |
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

The one exception is Green Goods and Tech and Sun, two real projects included with their
owner's consent. Their 12 typed and spoken cases (`owner-profile-2026-11-23`) are written
from the public-safe facts of the owner's profile and leave out everything the owner
marked private; Tech and Sun's place is Awka only, for now. With those cases and d-31
added on 23 November, development (61 cases) scores Name 1.00 / 0.73, Where you work
1.00 / 0.41, About it 0.87 / 0.87, Link 1.00 / 0.33 and Cards 0.56 / 0.53. The owner's
longer texts lose most of the cards: on the needs and offers steps, each sentence of a
typed description becomes a card, and a recording becomes a few long cards that each
hold several items, their titles cut at 140 characters. Link is filled from a full
address such as `https://mangrove-futures.example.org`, but not from a bare domain such
as "greengoods.app" or from one said aloud.

### What better places would need (24 November 2026)

Where you work is the field the holdout shows weakest (recall 0.06), and keyword rules cannot raise it without wrong places. Three reviews attacked three successive attempts to read places said in a sentence ("we grow vegetables in Accra, Ghana", "trabajamos en Oaxaca, México", "worldwide"). Each found dozens of sentences that gave someone else's place, a past or a wish, a firm or a pepper with a country's name, or a false Global: 85 of 112, then 73 of 81, then 67 of 83 even for the strictest version. A wrong place is worse than none, so no rule that widens Where was shipped. Their 290 sentences, and the attempt, are kept with the describe-flow session's notes. Better places need one of two things, a choice for the user:

- **A vetted place list on the device**: towns and regions with their countries, so a place said without a capital or a country ("bristol", "belo horizonte minas gerais") is known to be one, and a country's name that is also a word or a person ("chile", "Jordan") is told apart by what is around it. It needs a named source with a licence that allows shipping it (for example GeoNames, CC BY 4.0, which would need attribution), a size budget, and the same review against attack sentences before it ships.
- **The on-device model** (D32 in `docs/platform/open-decisions.md`): it reads a sentence's meaning, which keywords cannot, but it is not yet approved, its download sizes and devices are unproven, and its answers would need the same precision gate on this eval and on attack sentences.

What did ship is the opposite direction: places the rules already gave wrongly are gone (`test/places-false.test.ts`).

## Labels

`fund-relevance-v1-labels.json` holds 840 labels for the 40 initiatives in
`fund-relevance-v1.json`. Each initiative is a public Certified project record, its
description the passages the public project list shows, verbatim, from
[the partner corpus](../../api/evaluation/partner-real-v1-corpus.json); countries are
assumed from the places they name. Each one's pool is the first 20 programs Funding
ranks and the first 10 the live site ranks, about 21 programs, as of 23 November 2026.
The question for every pair: should the people running this initiative spend time
looking at this program? `fits`, `maybe` or `doesnt`, as the file's `question` defines
them. It is relevance, not eligibility.

**Every label is an agent's draft.** Four agent instances drafted them, 52 fits, 174
maybe and 614 doesn't. They reported that most "doesn't" notes were written by rule
from a program's focus and geography rather than pair by pair, so those notes are
hints only. No metric counts a draft.

`fund-relevance-owner-v1-labels.json` holds the pairs for **Green Goods** and **Tech and
Sun**, two real projects whose owner grades every pair in person. They are included with
their owner's consent, in public-safe form built only from their public docs (the Green
Goods repository, MIT, and the Tech and Sun documentation, CC BY-SA 4.0), as an exception
to the rule that fixtures describe invented initiatives: `fund-relevance-owner-v1.json`
gives each one's source. Their pool is Funding's first 20 and the live site's first 10,
plus the funds their profile expected to fit or not that Weave did not rank high, so a
missed match can count. No agent graded them: every pair waits, ungraded, for the owner.

To review, export a spreadsheet outside the repository, grade the rows you judge, and
import it. `--labels` picks the file by its dataset name; the first is the default:

```sh
bun run --filter @weave/app eval:labels -- --export ~/weave-review.csv          # Weave's ranks, drafts and confirmations beside each row
bun run --filter @weave/app eval:labels -- --export ~/weave-review.csv --blind  # none of them, to judge unprompted
bun run --filter @weave/app eval:labels -- --export ~/sample.csv --blind --initiatives rel-001,rel-009
bun run --filter @weave/app eval:labels -- --labels fund-relevance-owner-v1-labels --export ~/owner.csv
bun run --filter @weave/app eval:labels -- --import ~/weave-review.csv --reviewer "Your Name"
bun run --filter @weave/app eval:labels -- --labels fund-relevance-owner-v1-labels --import ~/owner.csv --reviewer "Your Name"
bun run --filter @weave/app eval:labels -- --add-pool   # after a ranking change: new candidates, ungraded (add --labels for the owner's file)
bun run --filter @weave/app eval:funds -- --record-baseline
```

Each row shows the initiative's words and places, the program's focus, who it serves,
its geography and kind of funding, where Weave ranked it on Funding and the live site, its
draft and any confirmation already made. "Your grade" always starts blank: fill it in with
strong, possible or wrong (fits, maybe and doesn't are read the same way) for the rows you
judge, and add "your note" if you like. The sheet opens in a spreadsheet as UTF-8, and one
saved back with semicolons reads the same. The import confirms exactly the rows you
graded, under your name and the day, keeps the draft each one answered beside it, and
leaves every other row as it was. It refuses a row for a pair the file does not hold,
a graded row whose "program" cell is not its program id's name (an edited id would move
the grade to another pair; if the catalog renamed a program since the sheet was made, add
`--renamed`), a pair graded twice, an agent as reviewer, and a grade on a pair someone
else already confirmed, unless you add `--replace`, when the note records whose grade it
replaced. The reviewer's name is written into the public label file, so use the name or
handle the person agreed to. A sheet can be shared out in parts: import each part as it
comes back. Commit the label file with the new baseline in the same pull request, and say
who judged. An agent never runs the import.

The file holds one grade per pair. Who judges is still to be decided. A blind sheet
avoids leaning on the drafts; to have two people judge, give the second a blind sheet,
compare their grades outside the file, and import the grade they agree on.

A ranking change can bring programs into a first five that the file does not hold:
`--add-pool` adds them as ungraded drafts. A catalog change can drop a program a draft
names. That draft counts for nothing, so CI only warns; rebuild the pool before it is
reviewed. A confirmed label for a program the
catalog no longer holds fails by name.
