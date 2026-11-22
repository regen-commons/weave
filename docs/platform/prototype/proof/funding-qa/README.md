# Funding page QA with four invented initiatives

Checked on 20 November 2026, 23:10 to 23:30 Pacific time (07:10 to 07:30 UTC on 21 November), at
`develop` `425b224`. This is the first QA pass of Weave's own Funding page. It also settles the old
unmerged fix `0174e2d`. No screenshots are committed; the captures were looked at during the check.

**Fixture, local production build, Claude desktop app's built-in browser (Chromium).** The app was
built with `bun run --filter @weave/app build` and served by the `app-preview` entry in
`.claude/launch.json` on port 4174, because another session's dev server held port 5173. No
`?fixture=` parameter was used: the dev fixtures swap the catalog for invented records, so they
cannot exercise the rubric. The page ranked the real bundled catalog (771 programs and overview
records from 699 funders, sources last checked 16 November 2026) against device drafts. Nothing
was signed in, saved or sent. This is not live proof.

Each initiative went in through Describe, Needs And Offers and Your Initiative, then Details For
Funding at the foot of the Funding page. A Node replay of
[`engine.ts`](../../../../../packages/app/src/funding/engine.ts) with the same catalog, rules,
conditions and project produced the same order as the page for all four, and gave the scores and
shared words quoted below.

## Commit 0174e2d: close it

`0174e2d` ("fix(client): screen unverified offers and applicant requirements", on
`codex/qa-matching-fixes`) has the same `git patch-id --stable` (`1a8ee47b`) as `49a31d5`, which
merged as pull request #4 on 29 October. `49a31d5` is in `develop`, `main` and
`codex/funding-commons-demo`. Every piece is still in `develop` unchanged: the unverified-offer
readiness, group and priority cap of 9, and the applicant and beneficiary readiness labels in
[`dist/matching.mjs`](../../../../../dist/matching.mjs); the two Verizon conditions in
[`research/program-conditions.json`](../../../../../research/program-conditions.json) and their
generated copies; and [`docs/matching-screening.md`](../../../../../docs/matching-screening.md) and
[`tests/qa-findings.test.mjs`](../../../../../tests/qa-findings.test.mjs), both byte for byte. The data
change went through the research inputs and the importer, as it should. Weave inherits it: the
Unverified funding offers group shows "Funding offer unverified" (below). Nothing needs redoing.
Deleting the branch needs the owner's go-ahead.

## Results per initiative

All four are invented. Details For Funding were filled for each: work, beneficiary and base
country, applicant type, kinds of funding and a goal in USD. The order is the page's default sort,
Research priority.

| Initiative | Details | Top three on the page | Plausible? | Readiness on those cards |
|---|---|---|---|---|
| Riverlight Mural Workshop (art), informal group of young muralists in Accra, first pilot season | GH, informal group, grants and prizes, 5,000 to 15,000 | NEH Public Humanities Projects; Rufford First Small Grant; FID Pilot grants | No. NEH takes US applicants only; Rufford is conservation research; FID is poverty programmes. Shared words: "public", "first, small", "pilot" | Check geographic scope; Check geographic scope; Confirm 2 requirements |
| Tidal Carbon Field Study (research), university team measuring mangrove blue carbon in Kilifi County, second field season | KE, university, grants and fellowships, 40,000 to 120,000 | NLnet Restack (second call); California Mojave Desert Tortoise Recovery; Open Tech Fund Internet Freedom Fund | No. Shared words: "second, open", "recovery, restoration", "open". The best fit, Rufford First Small Grant, is 8th | Check geographic scope on all three |
| Ridge Valley Seed Commons (place-based), nonprofit seed bank and agroecology in the Sierra Norte of Oaxaca, six years running | MX, nonprofit, grants, 20,000 to 60,000 | FUNBIO Floresta Viva (São Francisco basin, Brazil); Conservation, Food and Health Foundation; International Trans Fund SEED grants | Second only. The first is Brazil-only; the third matched "seed" | Check geographic scope; Check geographic scope; Confirm 5 requirements |
| Fieldnote Soil Sensors (technology), social enterprise with open-source soil moisture sensors in Dharwad, ready for a larger pilot | IN, business, grants and investment, 30,000 to 100,000 | GitHub Secure Open Source Fund; Geode Labs Ethereum community grants; FLOSS/fund | Partly. All three are open-source software funds matched on "open, source". Paul Hamlyn's India Fund is 7th and Acumen Patient Capital 91st | Confirm 3 requirements; Confirm 2 requirements; Confirm 2 requirements |

- No result reached Research leads for any of the four. Every record fell in Limited relevance,
  Unverified funding offers or Conflicts or funding preferences. On Your Initiative, Funding That
  Fits said "Nothing in the catalog matches this card yet." for all four.
- Under Research priority the top of each list is a tie at the weak-topic cap (24). Within it, open
  access and generic shared words decide the order, not topical fit.
- MIT Solve's 2027 Global Climate Challenge rated a Strong thematic fit for the research
  initiative, but sits 655th under Conflicts or funding preferences, because it is outside the
  kinds of funding chosen. The readiness says so. A person sees it only through the Priority group
  filter.

## What reads correctly

- Unverified overview records (filter Priority group, Unverified funding offers: 23) show
  "Funding offer unverified", "Funding offer has no researched program terms.", "Award size not
  established" and "No verified application deadline".
- Prerequisites start as Not answered. On the GitHub fund, Yes to all three gave "Open route;
  verify eligibility"; one No gave "Known eligibility conflict" with "A sourced requirement
  conflicts with supplied project facts." The answers were cleared afterwards.
- Missing data stays missing: "Current award range is not verified; no budget fit assumed.",
  "Fit not assessed" where there is no grade, and "Fit is not eligibility. Unknown facts stay
  unknown." on every detail. The detail says the fit is keyword matching and no model has
  downloaded.
- Each card shows the kind and amount, the funder, the fit as a bar and a word, how to apply,
  the deadline, the readiness and the source date.

## Defects

None were fixed in this session. Each was reproduced on the build above.

1. **Generic words decide the order (high).** Enter any of the four initiatives and open Funding.
   Expected: the top cards share purpose with the card. Actual: they share words such as "public",
   "first", "small", "pilot", "group", "second", "open", "seed", "years" and "families", and the
   fit explanation lists them as keyword topics. Suspect: the stop words and shared-term rule in
   [`dist/matching.mjs`](../../../../../dist/matching.mjs) (`STOP`, `terms`, `BROAD_PURPOSE_WORDS`).
   This is the live site's rubric too, which runs with on-device semantic similarity; Weave passes
   none, so the keyword path alone sets the order.
2. **"art" never meets "arts" (medium).** Enter the art initiative ("community art and music
   workshops"). Expected: the LA Cultural Affairs Public-Space Activation Fund (focus "Community
   arts, Public space") shares "arts". Actual: it shares only "space" and "public" (Limited, 30).
   With "arts" in the description it becomes Partial (50). `TERM_FAMILIES` maps art to arts, but
   only after the exact shared-term match. Suspect: `dist/matching.mjs`.
3. **A country mismatch does not lower a weak result (medium).** Enter the art initiative with GH.
   Expected: NEH, US applicants only, drops below records without a mismatch. Actual: it is first;
   the reason says the mismatch "lowers priority", but its cap (24) equals the weak-topic cap (24).
   The same puts FUNBIO (Brazil) first for Mexico and a California call second for Kenya.
   Suspect: `scoreMatch` in `dist/matching.mjs`.
4. **"Open call" beside "Ended" (medium).** In a time zone behind UTC, after 00:00 UTC on a
   closing day, open Funding with any initiative. Expected: one answer. Actual: the Climate Resilience
   Fund's Climate Smart Communities card showed "Open call" and "Ended 20 Nov 2026" at 23:15 Pacific
   time, and the rubric still scored it as open: it was first for the research initiative before
   countries were added. `effectiveAccess` in [`dist/domain.mjs`](../../../../../dist/domain.mjs)
   uses the local date; [`deadline.ts`](../../../../../packages/app/src/funding/deadline.ts) counts
   to the end of the day in UTC (DL-103). Reproduced in Node with `TZ=America/Los_Angeles` from
   16:00 to midnight; with `TZ=Africa/Nairobi` both say closed.
5. **Change Initiative drops arrow-key choices (medium).** With four initiatives, Tab to Change
   Initiative, press Enter, then Down three times. Expected: the page compares with the fourth
   initiative. Actual: focus is on Riverlight Mural Workshop, but the checked option and the page
   stay on the first one reached, Ridge Valley Seed Commons. Reproduced twice. Each arrow press
   is a change, and `compareWith` in
   [`Funding.tsx`](../../../../../packages/app/src/pages/Funding.tsx) ignores changes while one
   is in progress. Suspect: that guard with
   [`RadioMenu.tsx`](../../../../../packages/app/src/ui/RadioMenu.tsx).
6. **Two answers to "does anything fit?" (low).** Your Initiative says "Nothing in the catalog
   matches this card yet."; Funding says "Showing what fits Riverlight Mural Workshop." above 771
   cards, none of them a research lead. Suspect:
   [`FirstFunding.tsx`](../../../../../packages/app/src/ui/FirstFunding.tsx), which shows only
   `lead`, and `subjectLine` in [`subject.ts`](../../../../../packages/app/src/funding/subject.ts).
7. **"Relevant themes" beside "Limited evidence" (low).** Open the GitHub Secure Open Source Fund
   for the technology initiative. Expected: one verdict on topical fit. Actual: the fit says
   "Relevant themes" and the first reason says "Limited evidence of shared program purpose".
   Suspect: `thematicFit` and the `fitScore` limit in `dist/matching.mjs`.
8. **A raw timestamp in the detail (low).** Open NEH Public Humanities Projects. Actual: "Source
   deadline 16 December 2026, 2026-12-17T04:59:00Z." Expected: a readable local time, or the
   funder's "11:59 pm Eastern". Suspect:
   [`Opportunity.tsx`](../../../../../packages/app/src/pages/Opportunity.tsx), line 135.
9. **Only the short description reaches the fit (low, a gap more than a bug).** The fit uses the
   card's About it (at most 400 characters, which Describe fills from the first sentences) and
   its themes. The type of work, people served, needs and offers are not used, so ticking Art and
   culture changes nothing. The art initiative's themes were empty, so its fit came from about 330
   characters. Suspect: `projectFrom` in
   [`profile.ts`](../../../../../packages/app/src/funding/profile.ts).
10. **Slow answers (low).** Each prerequisite answer re-ranks the whole catalog: "Comparing your
    card on this device" showed for 5 to 8 seconds. Suspect:
    [`use-catalog.ts`](../../../../../packages/app/src/funding/use-catalog.ts).
11. **The menu reopens on the first option (low).** Reopen Change Initiative after changing it.
    Focus is on the first option, not the chosen one. Suspect: `RadioMenu.tsx`.

For the catalog, not the app, and only through the catalog routine: "Climate Smart Communities
Initiative2027" lacks a space, and the GitHub fund's award line on the detail has no currency
while its card says USD 10,000. Describe also left Where you work empty for "the Sierra Norte of
Oaxaca, Mexico", suggested Technology for a seed bank, and kept a comma-separated offer as one card
while it split the needs. Those are intake findings, outside this record.

## Layout, themes and keyboard

- 1280 px and 360 px, light and dark (emulated `prefers-color-scheme`): no horizontal overflow
  (`scrollWidth` equals the width), three columns at 1280 px, one at 360 px, Filters in a sheet
  on a phone, and the fit shown by a bar and a word in both themes.
- Keyboard only, 1280 px light: Skip to content, the header, Search funding, the seven filter
  buttons, Change Initiative, then two stops per card: its name and its fit. Every stop shows a
  3 px outline; on a card name the whole card shows it. The fit explanation opens on focus and
  closes about two seconds after focus leaves. Enter on a card opens the sheet with focus on Close;
  Escape closes it and returns focus to the card. Enter on Change Funding Details puts focus in Work
  countries; Enter in the form keeps the details and returns focus to the button.
- Keyboard only, 360 px dark: Skip to content, Weave, Sign In, Search funding, Filters, Change
  Initiative, then the cards, with the same 3 px outline. Enter on Filters opens the sheet with focus on Close; Escape returns focus to
  Filters.

## Checks

- `git patch-id --stable` on `0174e2d` and `49a31d5`: both `1a8ee47b`.
- `node --test tests/qa-findings.test.mjs tests/shortlist.test.mjs` on `develop`: 17 passed.
- `bun install --frozen-lockfile`, `bun run --filter @weave/api build` and
  `bun run --filter @weave/app build`: succeeded.
- The Node replay of `engine.ts` and a `TZ` replay of `effectiveAccess` against `deadlineSign`, as
  above.

## Not proven

- The Loading, error, offline and long-content states, which need the dev server's `?fixture=`
  states, and two tabs on one draft.
- A screen reader, touch input, Safari, Firefox and a real phone.
- Production. Weave's production catalog is the same bundle, but this pass ran locally.
- The live Funding Commons site, which ranks with on-device semantic similarity and may order these
  initiatives differently.
