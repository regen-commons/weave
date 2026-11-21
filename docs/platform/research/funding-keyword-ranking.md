# Why generic words order Weave's Funding page: a proposal

Status: proposal for the owner of the matching rubric, 21 November 2026. Nothing
here is decided or built. It changes no production code, no catalog data and no
part of [`dist/matching.mjs`](../../../dist/matching.mjs), which the live Funding
Commons site also runs. It follows the fixture QA in
[draft pull request 127](https://github.com/regen-commons/weave/pull/127), which
found that for four invented initiatives nothing reached Research leads and
words such as "public", "first", "small", "pilot" and "open" set the order.

## In plain words

Weave ranks funding with the same rubric as the live site, but without the live
site's on-device model, so only the keyword half of the rubric runs. With the
model, the rubric averages the two signals and applies its thresholds to the
average. Alone, the keyword score is much smaller than that average. Three things
follow:

1. **Every program hits the weak-topic cap.** The keyword score stays below the
   rubric's 0.25 floor for 770 or more of 771 programs, so all of them are capped
   at 24 and filed under Limited relevance.
2. **An open door outweighs the topic.** Topic points on the top cards come to 2
   to 14 in keyword mode; an open application route alone is worth 15. So the order is set by
   access, and topic only breaks ties.
3. **The words that break ties are program names.** "First Rufford Small Grant",
   "Pilot grants", "SEED grants" and "Restack: second call" put rare, and so
   heavily weighted, words into the keyword index. An initiative that says "first
   season" or "small groups" matches them.

What we recommend:

- **Take one small rubric pull request to the owner** (option B below). Its
  biggest part changes only the keyword-only path, which on the live site is just
  the fallback when the model has not loaded. With all four parts, the replay put
  9 arts programs in the art initiative's top 10 (from 0), the three agroecology
  anchors at 2, 3 and 4 for the seed commons (from 1, 24 and 23), and no country
  mismatch in any top 10. It does not help the mangrove research initiative, whose
  words the catalog does not use.
- **Keep on-device similarity for Weave in D32.** It is the only option that
  helps the research initiative, but it needs a 39.6 MB download, a CSP change and
  D32's approval.
- **Do not expect the accepted "Asking about money once" change to fix ranking.**
  Adding a financial need's purpose left all four top-10 lists unchanged.

Two things the replay cannot show, said plainly. There is no labelled funding set,
so "better" below means "more programs on the initiative's topic", judged by a
word pattern and by programs we picked by hand. And most of the missing Research
leads are not a ranking fault: only 1 to 6 programs on each initiative's topic
could ever reach a lead, because the rest are closed, invitation-only or
unverified.

## How it was measured

A Node replay ran the bundled catalog (699 funders, 771 programs and overviews,
compiled 17 November 2026), its rules and conditions, as of 21 November 2026.
The baseline goes through [`engine.ts`](../../../packages/app/src/funding/engine.ts)
unchanged, and each option is a scratch copy of the rubric with one change; the
replay checks that its unchanged copy gives the same order as `engine.ts`. The
semantic runs embed the query with the live site's pinned model
(`mixedbread-ai/mxbai-embed-xsmall-v1`, q8, mean pooling) against the vectors
`bun run build` writes, as the live site's worker does.

The four initiatives are invented, rebuilt from the QA table because pull request 127 did not
record their exact words: a young muralists' group in Accra (GH, informal), a
university team measuring mangrove blue carbon in Kilifi (KE), a nonprofit seed
bank in Oaxaca (MX) and a social enterprise making open-source soil sensors in
Dharwad (IN). Rebuilt, they give the same kind of top cards the QA saw: Rufford,
NEH and FID for the art group, NLnet and Open Tech Fund for the research team,
open-source software funds for the sensors.

Each run reports:

- **On topic in the top 10:** programs whose name, focus or beneficiaries match a
  word pattern for the initiative (arts and culture; biodiversity, conservation,
  coastal or marine; agroecology, food sovereignty, Indigenous or farming;
  agriculture, soil or water). A proxy, not a judgment of fit.
- **Country mismatch in the top 10:** programs whose recorded work countries do
  not include the initiative's.
- **Anchor ranks:** where programs we judged plausible land. Research: Rufford
  First Small Grant, JRS Biodiversity funding inquiries. Seed commons: Agroecology
  Fund, Farming the Future, A Team Foundation food and land grants. Soil sensors:
  Paul Hamlyn India Fund, Acumen Patient Capital, USDA Conservation Innovation
  Grants. None for the art group: the catalog has no arts program we could call
  plausible for an informal group in Ghana.

## The defects, traced

All line numbers are in [`dist/matching.mjs`](../../../dist/matching.mjs) unless
another file is named.

**Defect 1, generic words set the order.** Four causes stack.

- Weave passes no semantic scores (`engine.ts` line 21, `null`), so `fitScore` is
  the keyword score alone (lines 418 to 419).
- The keyword score is `sqrt(query share × document share)` (line 80). A 24 to 29
  word description matching two words of a short focus list scores 0.05 to 0.20.
  Only one of the 3,084 initiative and program pairs reached 0.25.
- So the weak-topic cap of 24 applies to nearly everything (line 358), the group
  is Limited (line 397), and topic points, `fitScore × 70` (line 345), come to 2 to
  14 on the top cards against up to 15 for an open route (line 332). Ties at the
  cap are broken by `fitScore` (line 292).
- The keyword index reads `programText`, which starts with the program's name
  (lines 51, 58 and 64). Administrative words in names ("first", "small",
  "second", "pilot", "seed", "years") are rare in the corpus, so they weigh more
  than topic words: "first" 4.3, "pilot" 5.0, "second" 5.6, "years" 6.0. `STOP`
  (lines 28 to 32) and `BROAD_PURPOSE_WORDS` (line 45) hold none of them, so they
  also count as specific evidence (line 420) and support a fit grade of 50.

A longer stop list is the obvious fix and the wrong one: "seed" is the seed bank's
real topic, and "open" is the sensors' real topic. Reading the focus instead of the
name removes most of these words without guessing which are generic. "public",
"open", "three" and "family" still leak through.

**Defect 2, "art" never meets "arts".** `lexicalMatch` compares exact terms
(line 73). `TERM_FAMILIES` (lines 94 to 98) is applied only inside `thematicFit`
(line 111), to words already shared. So "art" and "arts", "mangrove" and
"mangroves", or "farmers" and "farmer" never meet, though the live site's fit
explanation says word forms such as art and arts count once.

**Defect 3, a country mismatch does not lower a weak result.** The mismatch cap
(line 366) is 24, the same as the weak-topic cap (line 358), the geography check
cap (line 364) and the broad-purpose cap (line 353). Once a program is at 24 for
weak topics, the mismatch changes nothing, and the tie goes to `fitScore`. A
data issue sits underneath: of 149 programs with recorded work countries, only 32
have an executable country rule that could make a conflict. NEH Public Humanities,
FUNBIO Floresta Viva and the Mojave tortoise call have none. And some programs
record example countries as their work countries: Rufford, Whitley and UNESCO's
cultural fund all list Nigeria, Brazil and South Africa while their scope says the
named countries are examples, which reads as a mismatch for Kenya and Ghana. The
geography scope of 11 programs calls its listed places examples.

**Defect 7, "Relevant themes" beside "Limited evidence of shared program
purpose".** Two measures of topic disagree. The fit label grades the number of
distinct specific shared words (lines 109 to 118; three words give 65, Relevant).
The priority limit reads `fitScore < 0.25` (line 358). In keyword mode the first is
often 50 or 65 while the second is almost always below 0.25.

**Defect 9, only the card's short description reaches the fit.** `projectFrom`
passes `description` and `tags` (themes) only
([`profile.ts`](../../../packages/app/src/funding/profile.ts) lines 50 to 51).
About it is capped at 400 characters (`ABOUT_LIMIT`,
[`contracts.ts`](../../../packages/app/src/describe/contracts.ts) line 94). Type of
work, who it serves, needs and offers are not read. The live site's project has the
same two fields, so this is a Weave gap, not a rubric one.

## Options and what they did

| | Art, Accra | Research, Kilifi | Seed commons, Oaxaca | Soil sensors, Dharwad |
|---|---|---|---|---|
| Today (keywords) | 0 on topic, 5 mismatches | 0, 2; anchors 53, 95 | 2, 1; anchors 1, 24, 23 | 0, 0; anchors 11, 64, 44 |
| A. Richer query | 0, 5 | 0, 1; 12, 97 | 2, 2; 5, 44, 43 | 0, 0; 11, 67, 61 |
| B. Rubric fixes | **9, 0** | 0, 0; 65, 130 | **6, 0; 2, 3, 4** | 0, 0; 16, 21, 19 |
| C. Semantic, as the live site | 0, 4 | **3, 2; 16, 6** | 5, 1; 2, 1, 5 | 2, 0; 8, 11, 4 |
| B and C | 2, 0 | 3, 0; 25, 5 | 6, 0; 2, 1, 3 | 3, 0; 24, 7, 4 |

Each cell gives programs on topic in the top 10, then country mismatches in the
top 10, then anchor ranks out of 771. No option produced a Research lead for the
art, research or seed initiatives. C produced three for the sensors, all
open-source and Ethereum ecosystem funds.

### A. Weave only: read more of the card

Add needs, offers, type of work and who it serves to the text `projectFrom`
passes. No rubric change, so no risk to the live site.

It did almost nothing. The top 10 kept 8 to 10 of its programs. Under the current
formula more query words lower the query share, so the extra words dilute as much
as they add. The "Asking about money once" subset, adding only the financial
need's purpose, left all four top-10 lists unchanged. That fits what the owner was
told when accepting it: the change makes the form shorter and is not shown to
improve results. It still makes sense with B or C, which reward added words
(A with B put 8 arts programs in the art group's top 10, and A with B and C put 7).

### B. Rubric fixes in four parts

1. **Keyword-mode scale.** With no semantic score, take topic strength from the
   specific-term grade the fit label already uses, halved to sit on the blended
   scale: `fitScore = max(keyword score, keyword grade / 200)` (lines 418 to 419).
   Two specific words give 0.25, three give 0.33. This also settles defect 7 in
   keyword mode, since the label and the limit now read the same evidence.
2. **Keyword index from the focus.** Build the index from the program's focus and
   beneficiaries, not its name (`createLexicalIndex`, lines 62 to 70). The
   embedding text stays as it is, so the vectors do not change.
3. **Word forms before matching.** Apply `TERM_FAMILIES` and a plain plural rule
   inside `terms`, on both sides (lines 33 to 37).
4. **Country mismatch below the weak-topic cap.** Lower the mismatch limit from 24
   to 19 (line 366).

The scale accounts for most of the gain for the seed commons (6 on topic, anchors
at 2, 3 and 5 on its own). The index and word forms bring the arts programs in (6
of the art group's top 10 with the scale). The country cap clears mismatches from
every top 10. Sensors moved from open-source funds only to Acumen at 21 and the
USDA grants at 19, from 64 and 44.

B made the research initiative worse in keyword mode: Rufford fell from 53 to 65,
and JRS from 95 to 130. Neither shares a single word with the mangrove
description, so the scale, which lifts programs with two or more specific shared
words, raises others past them. Keywords cannot bridge "mangrove carbon" and
"biodiversity research"; only C does.

**Risk to the live site.** Parts 2 to 4 change the live site's order when its model
runs. Replayed the way the live site ranks (whole funds, semantic scores on), its
top 10 kept 5 of 10 funds for the art group, 8 for research, 9 for the seed
commons and 8 for the sensors; 395 to 575 of 699 funds changed position; leads
were unchanged. Part 1 changes only the keyword fallback. All 71 rubric tests in
`tests/` still pass under every part, which shows the suite does not pin these
behaviors, not that the change is safe. B needs its own regression tests (an "art"
query meeting an "arts" focus, a program name not counting as evidence, a mismatch
below an equal non-mismatch) and the owner's review, since matching scores are
sensitive. It would land through `develop` and `main`, and reach the live site
only by an authorized cherry-pick onto `codex/funding-commons-demo`.

### C. On-device similarity in Weave

Run the live site's pinned model in Weave and pass its scores to `rankFunds`
instead of `null`. This is how the live site runs whenever its model has
loaded.

It is the only option that helps the research initiative (JRS at 6, Rufford at
16) and it gave the sensors three leads, all open-source and Ethereum ecosystem
funds. For the art group the model does find the arts programs: the two programs
most similar to its description in the whole catalog are the Los Angeles NEAR
artist residency (0.470) and the Minderoo Artist Fund (0.466). But they are closed
or unconfirmed, so they rank 52nd and 53rd, and the top three were a California
streams program, an early-years fund and Azim Premji's general grants. Country
mismatches stay, because C leaves the caps alone.

**Risk to the live site:** none; the rubric is unchanged. **Cost:** a 39.6 MB cold
download, `wasm-unsafe-eval` in the content security policy, and a model the app
downloads, which waits for D32. The model is English-only, while the
[matching proposal](matching-architecture.md) recommends a multilingual model for
partners. If D32 chooses that one, the funding vectors would need rebuilding with
it, and the live site would have to follow or keep its own.

## Recommendation

Propose B to the rubric's owner as one reviewed pull request, with its regression
tests and the live-site replay above. If the owner wants the live site's
model-backed order left alone for now, land part 1 by itself: it touches only the
keyword-only path, which is Weave's whole path and the live site's fallback, and it
alone moves the seed commons' anchors from 1, 24 and 23 to 2, 3 and 5.

Ask the catalog routine to separate example countries from work countries for the
11 programs whose geography scope calls its listed places examples, and to add executable country
rules where a program names one country, as NEH and FUNBIO do.

Put funding similarity into D32's benchmark rather than deciding it here. Keep A
for when B or C is in, and keep the money-once change as accepted: it was never
meant to change the ranking, and in this replay it did not.

## What remains unverified

- Whether any of this ranks better for real people. There is no labelled funding
  set; the topic pattern and the anchors are our own reading.
- The four initiatives are rebuilt, not the QA's exact words, and four is a small
  sample. Different words could tip the near ties.
- The live-site replay reproduces its ranking call in Node, not its page, and the
  live site may also filter and sort differently on screen.
- The 0.5 factor in part 1 and the cap of 19 in part 4 are judgment calls, not
  fitted values.
- Defects 4, 5, 6, 8, 10 and 11 from pull request 127 are outside this proposal.
