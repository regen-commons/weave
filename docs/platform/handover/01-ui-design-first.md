# Handover prompt: interface prototype before any build

Paste everything below the line into a new session. It runs in parallel with the repository foundation in [02-repo-scaffolding.md](02-repo-scaffolding.md). That session owns every repository change, so this one reads the repository and does not edit it.

---

You are designing the interface for Weave, the first version of the Regen Commons platform at weave.regencommons.com. Build it as an interactive prototype that I can click through on a phone and a desktop before anything is implemented, published as a private Artifact on claude.ai. The brand and design system are Regen Commons' own and are defined in the repository. This session is design only: do not write application code, create the app, touch the database, or edit, commit or push to the repository.

## Read first, in this order

1. The living plan doc: https://claude.ai/artifact/YEjb6QGeaF5iGLaQRczUhH (tabs: Proposal brief, Product requirements, Saving and accounts, Design system, Open decisions). For requirements and decisions it wins over the repository. Note any difference.
2. In `regen-commons/funding-commons`, an up-to-date `origin/docs/tend-platform-plan` whose history includes "docs(platform): sync plan with the living doc and add handover prompts". If it doesn't, stop and tell me. Read `docs/platform/01-proposal-brief.md`, `docs/platform/04-prd.md` (sections 6 and 7, R1 to R47), `docs/platform/08-accounts-and-saving.md` and `docs/platform/open-decisions.md`.
3. The design system: `DESIGN.md`, `packages/design-system/README.md`, `packages/design-system/brand/BRAND.md`, `packages/design-system/brand/VOICE.md`, `packages/design-system/COMPONENTS.md`, `packages/design-system/decision-log.md`, and `packages/design-system/principles/` (the three books, the review checklist and the usability testing plan).
4. The example pages in `packages/design-system/patterns/pages/` (home, step-needs, finish, matches, matches-empty, code, saved). Run `bun run design:serve` and open `http://localhost:4173/patterns/index.html` to see them rendered.

The foundation session may move these files while you work. Read them from a temporary worktree of one commit of that branch, outside the main checkout, and record which commit you used.

## What the first version must do (November 2026, live by 30 November)

- Intake is a three-step conversation: your initiative, your needs, your offers. Each step works by voice, by file or link, or by typing, and works with no AI at all.
- Local AI runs in the browser. Cloud AI is a per-use, logged choice that names the provider and retention.
- Step 1 asks for four public fields only: name, locations, description, links. Stage, lenses, themes, place and eligibility are derived from those and shown only so they can be corrected: in pencil until confirmed, never asked as a question.
- Needs and offers are cards with forms of capital (eight capital tiles), place scope, timeframe or capacity, and exchange terms.
- Matches have two tabs. Opportunities show solo fit plus a "stronger with" partner suggestion. Partners work as give to get: before someone shares their initiative, they see how many partners match and why, with names hidden. Names, cards and "Ask for an introduction" open once they add their initiative to the list. Anyone can still browse the public directory.
- Saving asks for an email and nothing else, inline, after the first opportunities and the partner teaser. Sign-in is code first. Initiatives are private by default; who can see one (Only you, People signed in, Anyone) is a separate choice.
- Regen Commons branding and identity from day one: only the design system's tokens, patterns, voice and plain labels.

## What to build

One prototype that walks through the whole first version, with working navigation:

1. Home for a first-time visitor: what this is, a plain tagline, one primary action, and a way to browse the directory.
2. Step 1 in each input mode (speaking, attaching a deck or link, typing), with the model-download prompt and the cloud consent dialog.
3. The initiative card with derived details in pencil, and how a person corrects one.
4. Step 2 (needs) and step 3 (offers), with suggested cards in pencil and kept cards in ink.
5. Finish: first opportunities, the partner teaser, "your card" and the save panel.
6. The share decision that unlocks partner names, and the Partners tab before and after sharing.
7. The Opportunities tab, and an opportunity detail with "stronger with".
8. The email and code flow, including every error row in `08-accounts-and-saving.md`.
9. The public directory of initiatives, with search and filters.
10. Empty, loading, offline, error and very-long-content states for every screen, each reachable from a visible state switcher.

Add a small control bar with a screen list, the state switcher, a theme choice (system, light, dark) and a 360 px phone frame alongside the full desktop width. Style it so it can't be mistaken for product UI.

## How to build it

- Use the design system itself, not a copy of its values. Publish `packages/design-system/css/`, `packages/design-system/tokens/tokens.generated.css` and `packages/design-system/fonts/` unchanged, at the same relative paths, as the Artifact's supporting files, and link only `css/index.css`. Its imports load the fonts, tokens and layers. Anything new goes in one separate prototype stylesheet that uses only tokens, with each new pattern marked as proposed.
- Start from the feature, not the layout. List the screens and states and the `COMPONENTS.md` patterns each one uses. Flag any new pattern you need and say why no existing one fits.
- Use fictional example content, and say so on every screen. Simulate the AI and the network: show the real download, consent and offline prompts, but call no model and no service.
- Collect nothing. The email and code steps run in page state only, and nothing typed is sent or stored.
- Publish early (home and step 1), then keep updating the same Artifact so its link stays the same. It is private by default; do not share it or make it public.
- Run the five-minute review in `packages/design-system/principles/ui-review-checklist.md` on every screen at 360 px and 1280 px in both themes.
- Draft the script for the one usability round that runs before 30 November: three participants, tasks from `usability-testing.md`, run on this prototype. Include a task on whether the partner teaser makes people want to share. `usability-testing.md` has no such task yet (its task 8 is the weekly update), so propose the wording.

## Done means

A private Artifact link where every screen and state above can be reached in both themes and at both widths, built from the design system's own CSS, tokens and fonts plus the marked proposals. A notes panel in the prototype records the commit you read, the patterns you propose, the review results, proposed decision-log entries, questions for `open-decisions.md`, and anything in the plan that the design shows to be wrong. Hand over the usability script with it. Leave the repository untouched; I will place the decisions once the foundation work has landed.
