# Handover prompt: build the Weave interface from the prototype

Paste everything below the line into a new session. It follows the [interface prototype](01-ui-design-first.md), now at version 4 in [docs/platform/prototype](../prototype/README.md), and the [repository foundation](02-repo-scaffolding.md), which is on `main`.

---

You are building the interface of Weave's first version in `regen-commons/funding-commons`: every screen and state of the approved prototype, as React pages in `packages/app` on patterns in `packages/design-system`, with the behaviour that runs in the browser. Phase 0 goes live by 30 November 2026 (PRD section 9). Server work (the Supabase schema, sign-in, email, cloud models) is a separate track: build up to its boundary and stop there.

## Current state (checked 4 November 2026)

- `main` at `64b10f7` holds the workspace: the live catalog site at the root; the design system in `packages/design-system` (tokens generated from the root `DESIGN.md`, layered CSS with `rc-` classes, brand, voice and the pattern library); the app shell in `packages/app` (React 19 and Vite in TypeScript, stub routes in `src/routes.ts`, thin components in `src/ui`, no app CSS); and `packages/api` with one health check. Weave has no backend yet.
- The prototype, its sources and the decisions from my two reviews are in `docs/platform/prototype/`, added on the branch `claude/weave-interface-handover`. Branch from an up-to-date `origin/main` that has `docs/platform/prototype/review-decisions.md`. If it does not, stop and tell me.
- `review-decisions.md` lists 28 decisions, each with where it belongs. None is placed yet. Three change existing guidance: no decorative eyebrows, the eight kinds of support by their framework names, and pop-ups for small tasks, against COMPONENTS.md's "never a modal".
- For the interface, the prototype and `review-decisions.md` win where the plan documents disagree. Step 0 brings the documents into line.
- The published prototype is at https://claude.ai/artifact/797CzZQeSRsk7XsQ44CUBQ. Build it locally, as its README says, to step through every state and read the source.

## Read first

1. `docs/platform/prototype/README.md`. Run the prototype and walk every screen and state at 360 px and 1280 px in both themes. Then read `review-decisions.md` in full.
2. `AGENTS.md`, `packages/app/AGENTS.md`, `packages/design-system/AGENTS.md` and the `design` skill. Use the `plan` skill before a step that crosses packages, and the `review` and `ship` skills for each pull request.
3. `DESIGN.md`, `packages/design-system/COMPONENTS.md`, `brand/VOICE.md`, `dialects/app.md`, `decision-log.md` and `principles/ui-review-checklist.md`.
4. `docs/platform/04-prd.md` sections 6, 7 and 9, `08-accounts-and-saving.md`, `05-technical-spec.md` sections 4 to 7, 15 and 16, and `open-decisions.md`.

## Where each prototype screen goes

| Prototype screen | In the app today | What changes |
|---|---|---|
| Home | `home` | Rebuilt as decision 7 describes |
| Step 1, the assistant prompt, the cloud consent dialog, Check your card | `initiative` | The conversation led by voice (13); the prompt and consent become states and a dialog of the step |
| Steps 2 and 3 | `needs`, `offers` | The conversation with ask cards beside it (14, 15) |
| Finish | none | A new page after offers |
| Partners, before and after sharing | `matches` ("Partners for you") | The Partners page (3, 18, 20) |
| Funding, Opportunity detail | `directory` ("Funding directory") | The Funding page and a detail page with team slots (4, 21) |
| Sign-in sheet, Saved, Share sheet, Signed in with a draft | `save` | Sheets over the page the person is on (19, 23); the page route goes |
| Initiatives, the public initiative page | none | New pages (3, 4, 9) |
| Settings, What we store, What the assistant did | none | A settings page and two pop-ups (24, 25) |

## Step 0: place the decisions

Open one docs-only draft pull request that:

- Updates the PRD and 08 as "What the plan needs to change" in `review-decisions.md` lists.
- Adds the decision-log entries it proposes, after DL-018, with the log's statuses: `locked` for design choices I confirmed, and `proposed` for product-wide choices the council confirms (two ways to be on Weave, partners for shared initiatives, the email door).
- Adds its questions to `open-decisions.md`, each with a recommendation and an owner.
- Links each placed row in `review-decisions.md` to where it now lives.

Wait for my approval before building on a rule that pull request changes. Rules for `DESIGN.md`, COMPONENTS.md, VOICE.md and the review checklist are placed from step 1 on, with the patterns that follow them.

## Then build, in this order, one small draft pull request each

In each step, move the patterns it needs from the prototype's `rcp-` proposals into the design system first: CSS in the right layer, an entry in COMPONENTS.md and a pattern-library example, as the design skill says. Then add thin components in `packages/app/src/ui`, then the pages. Place the decisions a step builds in the same pull request.

1. **Frame and lists.** The header with save status and account button; the navigation (Home, Partners, Funding, Initiatives); the footer on every page; one left edge; the card grid; cards with media, work tags and a level fit line; the tooltip; the filter bar with menus and chips. Fix the `base.css` box-sizing gap. Update `src/routes.ts` and its test for the new pages, with fixture lists. Decisions 1 to 6, 8, 9, 11, 12, 22 and 26 to 28.
2. **Home.** The hero, the woven-thread backdrop (still under reduced motion), three steps, the eight kinds with tooltips, recently shared initiatives and funding closing soon. Decisions 7 and 10.
3. **Describe.** Step 1 as a conversation led by voice, the card filling in beside it, Build my card, the check step with derived details in pencil, the assistant prompt and the cloud consent dialog. Drafts stay on the device (R1). The keyword tier runs everywhere (spec section 6). Use the browser's own speech recognition and model where they exist, behind feature detection, and put downloaded models behind an adapter. Decisions 13 and 16. Phase 0 needs evidence of local AI with real users by 20 November, so raise the model dependency and its content security policy change as soon as this step starts.
4. **Needs, offers and finish.** The same conversation with ask cards beside it, every kind of support alike, five of each at most; then the finish page with first funding, the share card and the person's card. Decisions 14 and 15.
5. **Funding and opportunity detail.** The funding list from the catalog with the existing rubric, as spec sections 7.3 and 15 describe, without breaking the live site; then the detail page with team slots. Where a fund's asks come from is an open question, so use labelled fixtures until it is decided. Decision 21.
6. **Partners, Initiatives and the initiative page.** The share card before sharing, partner cards with reasons after, and counts only for a private initiative; the directory with the Support filter; the public page with media, ask cards and link previews. Decisions 18 and 20.
7. **Save, share and the email door.** The sheet and dialog, the code panel and inline field, the two ways to be on Weave, reminders and introductions, all through one email door. Sign-in needs the Supabase project (D12), so build against a typed adapter with an in-memory fixture for development and tests, and keep its entry points out of production builds until the real adapter exists. Decisions 17, 19 and 23.
8. **Settings and your data.** Settings set in place with Leave at the bottom, delete, and What we store and the assistant record as pop-ups, with the record kept on the device. Decisions 24 and 25.

Finish with a review pass: the review checklist on every page; the checks the prototype's `src/audit.js` makes (sideways scrolling, text under 12 px, targets under 44 px, unlabelled fields, one `h1`, contrast) at 360 px, 375 px and 1280 px in both themes; and readiness for the usability round described in `review-decisions.md`.

## Rules

- Work on branches from an up-to-date `origin/main`, keep each pull request small with its own checks, and open drafts. Do not merge, deploy, change DNS, create Vercel or Supabase projects, or add secrets.
- The prototype is the design reference, not code to port. Rebuild each pattern for the product with native elements (`dialog`, `popover`, form controls), and never copy `proto-` classes or the prototype's string templates. An `rcp-` class becomes an `rc-` pattern in the design system before the app uses it.
- The app owns no visual CSS and uses tokens only. Never edit `packages/design-system/tokens/`: change `DESIGN.md` and run `bun run design:tokens`.
- Never show a control that does not work. Behaviour that needs a service waits behind an adapter and stays out of production builds.
- Add no dependency without my approval. Name each one in the pull request with its reason, and commit `bun.lock` with it. Widen the content security policy only in the change that needs it.
- Fixtures use invented content, labelled as such: no real people, contact details or private records. The repository is public. The prototype's Unsplash photos are not for the app; until the image question is decided, use no third-party images.
- Keep the live site working: `bun run build` and `bun run test` pass at the root, and funding-commons.vercel.app keeps serving the catalog.
- Stop and ask me when a decision conflicts with a rule beyond the three marked, when an open question blocks a screen (build the rest, and use the prototype's choice only as a labelled default), or when a step needs a dependency, a service or a person.

## Done means

One approved docs pull request, then one draft pull request per step, each passing CI, with the widths, themes and browser you checked and the five-minute review in its description. Every prototype screen and state exists in the app or is listed with what it waits for, and every row in `review-decisions.md` links to where it now lives. Finish with a short summary: what each pull request adds, what a person must do next (Supabase access and migrations, the sign-in email, model hosting, the subdomain), the open questions still blocking, and anything in the plan that turned out wrong.
