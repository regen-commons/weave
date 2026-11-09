# Design decision log

Settled questions, so each session does not reopen them. Entries are append-only. Change a decision by adding a new entry that supersedes the old one.

Status: `open` while unanswered, `proposed` until the council or the maker confirms it, `locked` once confirmed, `codified` once tests or tokens enforce it, `superseded` once replaced. Nothing here is `locked` as of 2026-10-31. Confirmation of product-wide choices belongs to the council. See [open decisions](../../docs/platform/open-decisions.md).

## DL-001: DESIGN.md is the single source of tokens

**Status:** codified. Root `DESIGN.md` in the DesignMD format holds all tokens and reasoning. `packages/design-system/scripts/generate-tokens.mjs` produces CSS and JSON, and tests fail on stale output. Green Goods and Coop use the same format. Groups the format lacks (fonts, motion, shadows) live in a fenced block in the same file, so there is still one source. The linter runs on a pinned `@google/design.md` 0.4.0, a newer release than Green Goods' 0.1.1.

## DL-002: Keep every website value

**Status:** codified. The website's dark values are ramp step 400 and its light values are step 700. New steps extend the ramps. A pinned copy of the website's tokens and a test prove nothing drifted. `--pad`, `--card-radius`, the RGB triplets, glow and grain are all preserved under their website names.

## DL-003: Public ink-dim becomes the token

**Status:** codified. The website's token file has `--ink-dim` at `#787060` and `#8A7A60`, which fail text contrast, and its public pages override them with `#A49A87` and `#5D503B`. The overrides become the token, which also fixes the steward desk. The originals retire. `soil-600` (`#86765D`) serves as the control boundary in both themes, slightly darker than the light original so it holds 3:1 on tinted panels.

## DL-004: Follow the system theme, with explicit generated blocks

**Status:** codified. The default follows the operating system. `data-theme` pins a page or a section, and the website pins dark. Tokens use media and attribute blocks instead of `light-dark()`, because the website's RGB triplets and non-colour theme values cannot use it and these blocks work on older phones that `light-dark()` would leave unstyled. Generation removes the cost of repeating values. In the app the control lives in settings, not the header.

## DL-005: Eight capitals get eight colours within the palette

**Status:** proposed. The website uses six tokens in about three hue families, so Intellectual matches Living and Cultural matches Spiritual. This system moves Intellectual to circuit and Spiritual to signal, adding no new hue. Several pairs still look alike under colour blindness, so colour only groups, and the word and glyph identify. Links do not use signal. The website's map keeps its colours until it adopts this.

## DL-006: Capital glyphs are square tiles

**Status:** proposed. The website uses small circles. A square tile with a 2 px radius reads like a specimen label, holds two letters at the 14 px label size, and fits the small-corner language. Tiles have three states: filled, dashed and hollow.

## DL-007: Pencil and ink

**Status:** codified in the patterns. Dashed means an assistant suggested this and no person has confirmed it. Solid means confirmed. This applies to proposals, tiles and imported records. It carries the product rule that nothing derived is applied silently, using the field notebook metaphor.

## DL-008: Corners are 2, 4 and 8 px

**Status:** codified. 2 px for cards, tags and tiles, matching the website's `--card-radius`. 4 px for buttons and inputs. 8 px for sheets and dialogs. Full only for avatars and dots. *Refactoring UI* notes suggested 4 px for cards, but we kept the website's value. No pill buttons. Organic blob outlines stay on website marketing pages.

## DL-009: Add Latin Extended font subsets

**Status:** open. The self-hosted fonts are Latin only. Portuguese and Spanish are covered. Yoruba's dotted vowels and Vietnamese fall back to the system face. Add `latin-ext` subsets before launch in places that need them, and measure the added weight.

## DL-010: 12 px floor, sentence case, two weights

**Status:** codified. 12 px is the smallest text. Buttons and labels use sentence case. Task screens use weights 400 and 600. Weight 300 starts at 48 px. The website's 0.52 to 0.65 rem tracked capitals retire when it adopts the scale. Capitals survive in one small label, used only to say what kind of record something is.

## DL-011: Add madder for errors and destruction

**Status:** proposed. The website has no error hue, and uses copper plus thicker borders. Destructive confirmations and form errors need something distinct from the copper accent, so this system adds one red ramp named after a plant dye. It is always paired with an icon and words.

## DL-012: Class prefix, data attributes and cascade layers

**Status:** codified. Classes start with `rc-` to coexist with the website's global classes during migration. Variants use data attributes and ARIA state. Cascade layers follow the atomic levels, so larger patterns can specialize smaller ones without specificity tricks. No BEM and no utility framework. CSS nesting is avoided so older phones keep working.

## DL-013: The system lives here until a second consumer needs it

**Status:** proposed. `packages/design-system/` is self-contained, outside `dist/`, so deploys are unaffected and it can move to a shared `regen-commons` repository when the website or desk adopts it. Moving it is an [open decision](../../docs/platform/open-decisions.md).

## DL-014: Plain labels first, tested with people

**Status:** proposed. Domain terms stay in data and documents. People read plain labels, listed in [VOICE.md](brand/VOICE.md#plain-names). Each one is a hypothesis for [usability testing](principles/usability-testing.md). "Initiative" stays as the default because it is the community's word, with "project or group" as the test alternative.

## DL-015: One CSS source, thin React components

**Status:** proposed. React components in `packages/app/src/ui` render these classes and own no visual CSS. The *Atomic Design* notes proposed CSS modules per component. One global layered source keeps the library, app and website adoption simple. Revisit if class collisions appear.

## DL-016: Static pattern library for now

**Status:** proposed. Plain HTML pages show the patterns until React exists. They load the same CSS and need only a static server. Storybook stays deferred, and a live `/library` route replaces these pages in Phase 0.

## DL-017: Fit is a word, not a number

**Status:** proposed. Match strength shows as Strong, Good or Possible fit plus bar length. The PRD's scores stay internal. *Refactoring UI* treats a score as data worth showing, such as a percent. Here, people have not seen the rubric, and scores built from sparse data would imply more certainty than exists, so plain words win.

## DL-018: The save prompt is inline, once per seam

**Status:** proposed. Saving appears as a panel in the page flow, after a person has seen value, never as a modal or wall. The panel is the same pattern everywhere. A dismissed prompt stays dismissed. See [08-accounts-and-saving.md](../../docs/platform/08-accounts-and-saving.md).

## Prototype review placement, 4 November 2026

The entries below place the maker's two [prototype reviews](../../docs/platform/prototype/review-decisions.md) for Step 0. `locked` records a design choice confirmed by the maker on 3 or 4 November; it does not claim that a pattern or test exists. Product-wide choices remain `proposed` for council confirmation. Pattern guidance changes with its implementation from step 1 onward; technical contracts need the follow-ups tracked in the review decisions. Earlier entries remain as history.

## DL-019: Partners are for shared initiatives

**Status:** proposed. Review row 18; council confirmation is [D27](../../docs/platform/open-decisions.md#for-the-council), with usability evidence in T8. Drafts and private initiatives get funding and partner-match counts in a share card, including counts in team slots. Names, individual cards, reasons and introductions open after sharing, not saving or signing in. Private initiatives never appear as candidates for others. Public initiatives remain browsable. Supersedes the earlier teaser and veiled-card presentation in the [PRD R16](../../docs/platform/04-prd.md#7-functional-requirements) and [saving plan](../../docs/platform/08-accounts-and-saving.md#where-work-lives).

## DL-020: Two ways to be on Weave

**Status:** proposed. Review row 17; council confirmation is [D26](../../docs/platform/open-decisions.md#for-the-council). "Private, for finding funding" is the default; "Shared with the community" provides a public page and directory entry. This replaces the signed-in-only middle level, while onward network sharing stays separate and off by default. Withdrawn and steward-hidden remain lifecycle and moderation states. See [PRD R27](../../docs/platform/04-prd.md#7-functional-requirements) and [08](../../docs/platform/08-accounts-and-saving.md#where-work-lives). The technical specification and schema must be aligned after confirmation; open introductions when returning to private remain D31.

## DL-021: One email door, with saving where the reason is

**Status:** proposed. Review rows 19 and 20; council confirmation, including single-fund reminders in Phase 0, is [D28](../../docs/platform/open-decisions.md#for-the-council). Save, share, remind and introduce save the current initiative to the verified email and resume the action without asking again when signed in. Sharing and introductions retain their explicit confirmations. Finish and Partners before sharing keep the email field and code step in the share card that explains the benefit. Refines DL-018's inline offer: unsolicited prompts stay inline and declined prompts stay declined; explicitly opened small tasks follow DL-027. See [08's flow](../../docs/platform/08-accounts-and-saving.md#first-visit-and-first-save).

## DL-022: Describing is a conversation led by voice

**Status:** locked (maker, 4 November 2026). Review row 13. One short question at a time; a large Speak button first when available, typing below, and files or links available throughout. Words remain editable and the card fills in beside the conversation. Build my card reads the gathered input on the device, then opens the check step with derived details in pencil. Keyword and manual paths work without a downloaded model. Replaces the version 3 form and live preview. See [PRD 6.1 and 6.2](../../docs/platform/04-prd.md#61-principles) and the implemented [Describe and review contracts](COMPONENTS.md#describe-and-review-contracts). The fixed-script versus model-chosen question policy remains D36; Step 3 uses labelled guided questions.

## DL-023: Needs and offers carry every applicable kind, five of each at most

**Status:** locked (maker, 4 November 2026). Review rows 14 and 15. Need and offer cards appear beside the conversation with Keep, Change and Remove, a counter and a maximum of five of each. If extraction hears more, show the first five and say so. Every applicable kind is shown alike and selectable; there is no primary kind. See [PRD 6.2 and R3](../../docs/platform/04-prd.md#62-the-three-step-conversation). Step 4 implements [Ask card and Ask list guidance](COMPONENTS.md#needs-offers-and-finish-contracts), the conversation and Finish composition, and aligns the technical contracts to five active cards and all eight kinds. Kept corrections and removals survive rebuilding; unknown kinds need correction before Keep.

## DL-024: One filter bar and separate list pages

**Status:** locked (maker, 4 November 2026). Review rows 3 and 4. Navigation is Home, Partners, Funding and Initiatives; Partners and Funding are pages, never tabs. Every list has search, filter menus, sort and removable chips with a result count. Support searches needs, offers or both; Partners adds "Offers what you need" and "Needs what you offer" once a person has an initiative. See [PRD 6.3](../../docs/platform/04-prd.md#63-what-the-user-sees-after-finishing). Step 1 replaces Directory filters with the Filter bar pattern. Initiatives versus Directory remains the T9 naming test.

## DL-025: Team slots for several partners per fund

**Status:** locked (maker, 4 November 2026). Review row 21. A fund lists its partner requirements as slots, with candidates per ask, a team fit explaining the selections and one action requesting introductions to the picks. Funding cards say how many asks the list could cover. Counts only are shown for private initiatives, under DL-019; fit is never eligibility. Extends [PRD R14](../../docs/platform/04-prd.md#7-functional-requirements). Structured asks and the scoring contract remain [D29](../../docs/platform/open-decisions.md#for-the-builders); labelled fixtures stand in until decided. Step 5 implements the [Team slots contract](COMPONENTS.md#funding-and-team-slots-contracts) and its shared/private examples. Distinct requirement coverage and selected initiatives are explicit; the earlier two-partner scoring proposal is not used as a live multi-partner contract. D29 still owns that decision.

## DL-026: The eight kinds by their own names

**Status:** locked (maker, 4 November 2026). Review row 10. Titles use Living, Material, Intellectual, Experiential, Social, Financial, Cultural and Spiritual, with the plain meaning beneath and more in a tooltip. This supersedes DL-014 only for these eight titles; other plain-name guidance remains. Test framework names against plain labels in [T3](../../docs/platform/open-decisions.md#waiting-on-people). Step 2 updates VOICE.md with the home pattern; the current table is still pending that change.

## DL-027: Tooltips, pop-ups for small tasks and settings in place

**Status:** locked (maker, 4 November 2026). Review rows 11, 23 and 25. Compact signs have tooltip explanations on hover or focus, also available to screen readers; native hint popovers and `interestfor` need a fallback where unsupported. Sign in, save, share, delete, What we store and the assistant record open over the current page, as dialogs on wide screens and bottom sheets on phones. Finish's unsolicited save prompt stays inline. This supersedes DL-018's blanket modal exclusion only for explicitly opened tasks. Settings change in place, with sign-out and deletion under Leave at the bottom and membership in the footer. COMPONENTS.md's Code panel and Dialog limits, the app dialect and the related checklist rules are still pending their patterns in steps 1, 7 and 8.

## DL-028: No decorative labels and a footer on every page

**Status:** locked (maker, 4 November 2026). Review rows 6 and 8. A heading and one line replace decorative kickers or eyebrows; keep a sentence-case label only when it carries a fact the heading cannot. Every page has the Weave, Your data and Regen Commons footer links; focused steps use a slim row. Step 1 places this in DESIGN.md, VOICE.md, COMPONENTS.md and the footer pattern. This narrows the use of Eyebrow and DL-010's capital record label; it does not remove useful factual labels.

## DL-029: Layout and motion from the first review

**Status:** locked (maker, 3 November 2026; retained 4 November). Review rows 1, 2, 5, 26, 27 and 28. Wide lists use card grids with columns of at least 18 rem, equal card heights and bottom-aligned actions. Pages share the logo's left edge; only the home hero and empty states centre. Two-line title space aligns fit lines. Fields and buttons share the large control height, and steps keep a steady height. Token-based transitions explain changes; all animation stops under reduced motion, including the home woven-thread backdrop, which becomes still. New screens start at the top with the heading focused and a short phone hero. Step 1 places layout, motion and review rules; step 2 builds the backdrop.

## DL-030: Private account connection before further fixture steps

**Status:** prepared for maker review, 5 November 2026. The maker asked for real
sign-in, saving and reloading after Step 5. The narrow connection reuses native
forms, notices, action bars and lists on Settings, reached through Account in the
header and Save or load your card on Finish. Signing in reveals saved cards before
a person chooses to save the device card or load one. Loading requires a confirmed
device backup and offers restoration. No new CSS pattern or token is needed.
This interim page entry differs from DL-027's contextual dialog; the full contextual
flow remains later work. Sharing, introductions and data-control services stay
outside this connection. See the [private contract](../../docs/platform/08-accounts-and-saving.md#private-account-connection).

Step 7 replaces the interim page-only entry with the explicitly opened account task
and the same email/code panel inline on Finish. Verification still lists saved
cards before a person chooses Save or Load, preserving the approved private
connection's recovery rule. Sharing, reminders and introductions have a separate,
labelled in-memory adapter and no production transport. The council decisions
remain proposed.
