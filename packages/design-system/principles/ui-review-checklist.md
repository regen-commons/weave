# UI review checklist

Use the [five-minute review](../../../DESIGN.md#how-we-follow-them) for every UI change. Use this list for new screens and larger changes. Test on a rendered page at 360 px, then across widths up to 1440 px. Report what you checked, with screenshots and the proof class from the handoff. Letters mark the source: K for Krug, R for *Refactoring UI*, A for *Atomic Design*.

## Arriving and finding the way

- [ ] Home's first phone screen has a plain tagline of six to eight words, a start action and search. (K)
- [ ] Home shows signed-in state, one sign of life and at most one teaser. (K)
- [ ] Home has its hero, three steps with the first as the way in, eight kinds, recently shared initiatives and the earliest three upcoming funding deadlines, with days left.
- [ ] Every page has the footer, with a slim row on focused steps.
- [ ] Partners, Funding and Initiatives are pages, with search, filter menus, removable chips, count and sort on lists.
- [ ] New pages start at the top with the heading focused; phone heroes stay short.
- [ ] Every page has a prominent name that matches the label tapped to reach it. (K)
- [ ] The product name sits top-left and returns home. (K)
- [ ] The current section, step or tab has at least two cues, and an active tab joins its content. (K)
- [ ] On three random deep links, the product name, page name, main areas, location and search are found in ten seconds. (K)
- [ ] Search is a box, a button and the word Search, and lists show their size. (K)
- [ ] Links from email and social media open the exact item. (K)

## Choosing

- [ ] Everything tappable looks tappable without hover, and targets are at least 44 px. (K, R)
- [ ] One solid primary action per region, with secondary outlined and tertiary link-style. (R)
- [ ] No choice set has overlapping options. (K)
- [ ] Labels use plain words from [VOICE.md](../brand/VOICE.md). (K)
- [ ] Gated actions say so before the tap, and say what unlocks them. (K)
- [ ] Nothing is shown that does not work yet. (R)

## Reading

- [ ] In greyscale, the primary action, current step and key data stay obvious. (R)
- [ ] Each card opens with its reason or purpose and reads in three seconds. (K)
- [ ] Prompts are one sentence, and hints one or two. No welcome paragraphs. (K)
- [ ] At most two weights and three text colours per screen. No weight under 400 below 36 px. (R)
- [ ] Labels are merged into values where possible. (R)
- [ ] Prose runs 45 to 75 characters on wide screens, and 35 to 45 on a 360 px phone. (R)
- [ ] No text under 12 px, and capitals are three words at most with 0.05 to 0.1em tracking. (R)
- [ ] No decorative label sits above a heading; factual labels use sentence case.
- [ ] Card titles reserve two lines, fit and price lines align across a row, and actions sit at the bottom.
- [ ] Every compact sign has a tooltip usable by pointer, keyboard and screen reader.
- [ ] The eight kinds use their framework names as titles, with plain meanings beneath and examples in tooltips; compact tags keep the meaning in help.
- [ ] Mixed sizes share a baseline, numbers align right, and centred text is three lines at most. (R)

## Seeing

- [ ] Sizes, gaps, radii, shadows and colours come from tokens, with no raw values or inline styles. (R, A)
- [ ] The gap inside a group is at most half the gap between groups. (R)
- [ ] Wide lists use card grids with columns at least 18 rem and equal heights, sharing the logo's left edge.
- [ ] A field and its paired button use the large control height; flow steps keep a steady height.
- [ ] At 360 px there is no horizontal scroll, the gutter is 16 px and widths use limits. (R)
- [ ] Text meets 4.5:1 on its rendered background. Large text and control boundaries meet 3:1. (R, K)
- [ ] Meaning survives greyscale and colour-blind simulation, with a word, icon or shape alongside colour. (R)
- [ ] Cards are lighter than the page in both themes, and only the five shadow levels appear. (R)
- [ ] Fewer than five hairlines per screen. (R)
- [ ] Images use fixed ratios, and text over images holds its contrast at the worst pixel. (R)
- [ ] Grain and canvas sit behind at most one region, never inputs or rows. (R)

## Filling it in

- [ ] Every input has a visible label outside the field, with the hint above the control. (K)
- [ ] Empty, one, many, long text, stale, error, offline and Portuguese variants all work. (A)
- [ ] Every list has an empty state: a headline, one line, one action, and no filters. (R)
- [ ] With models off, the core task still completes. Anything derived appears in pencil until confirmed. (A)
- [ ] Describe offers local speech when available, typing and attachments throughout, then Build my card and the four public fields in review. No extra structured fields are required.
- [ ] Keep, Change, Remove and Undo work. Confirmed corrections survive rebuilds; open corrections block continuing. Source changes mark an older card stale.
- [ ] Needs and offers show a count out of five and every applicable kind alike. Overflow is explicit; removal frees a slot and Undo cannot exceed five. Empty steps can continue.
- [ ] Manual entry retains earlier words and unfinished fields without running extraction. Finish requires checked steps and copies only the kept card data.
- [ ] Finish shows no partner names to a private initiative, invents no live counts and offers no unconnected email or sharing controls.
- [ ] Funding retains every catalog identity and exact program link. Visitors have no invented fit. Closed cycles, resources, unverified offers, missing screening data and source dates remain explicit.
- [ ] Optional funding edits survive reload and validation errors. Team slots show counts only for private initiatives, count each requirement once and request each picked initiative once. Coverage is never eligibility.
- [ ] Errors say what happened, keep what was typed and offer a next step. (K)

## Trust and saving

- [ ] Saving asks for an email only, and accepts a pasted code with spaces. (K)
- [ ] A wrong email or code can be fixed without losing the draft. (K)
- [ ] No checkbox or subscription is pre-checked, and requesting a code subscribes to nothing. (K)
- [ ] The page works on a throttled connection without waiting for sign-in or a model. (K)
- [ ] The privacy label on the screen is true. (K)
- [ ] Reload retains unfinished words, links, corrections and original file bytes. Storage errors and other-tab conflicts preserve recovery text and do not claim a save.
- [ ] Local capabilities never silently download a model or use remote speech. Unsupported files and unread PDF pages say so; cloud examples are labelled and absent from production.
- [ ] No streaks, countdowns, leaderboards or invented urgency. (K)

## Access

- [ ] The keyboard reaches everything in a sensible order, with a visible focus ring and a skip link. (K, A)
- [ ] Headings nest and fields are labelled in markup. (K)
- [ ] The largest browser text size and 200 percent zoom work without breaking. (K)
- [ ] Dark and light both pass. Reduced motion is honoured, canvas included. Forced colours keep boundaries. (A)
- [ ] Continuous resize from 320 to 1440 px shows no clipped text or overlapping controls. (A)

## The system

- [ ] Every element traces to a named pattern with one job, with no look-alikes. (A)
- [ ] Larger patterns include smaller ones, and copy and data are not hard-coded in patterns. (A)
- [ ] The page uses representative content, not lorem ipsum. (A)
- [ ] The pattern's entry in [COMPONENTS.md](../COMPONENTS.md) has its status, parts, limits and lineage, and every listed user was re-checked. (A)
- [ ] The name passes the blur test, with no page, content, persona, brand or look in it. (A)
- [ ] A new shared pattern has two real uses, and nothing has zero users. (A)
- [ ] Deprecations name a replacement and a removal phase, and token or stable pattern changes appear in the [changelog](../README.md#changelog). (A)
- [ ] Settled questions went into the [decision log](../decision-log.md). (A)
