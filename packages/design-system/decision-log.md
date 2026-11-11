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

## DL-031: Your initiative, one Keep card and Certified as the one door in the prototype

**Status:** maker's call, 9 November 2026, from the [preview design review](../../docs/platform/prototype/preview-design-review.md); the council items it touches stay open. Seven decisions. Draft first: sign-in appears at the first action that needs it, never at arrival, so DL-018 holds. Keep it saves on return from Certified, which is what 08 and D28 already say; DL-030's explicit Save moves one step earlier rather than away. One Keep card confirms every pencil detail that holds a value, with change and remove on tap; T5 still tests whether people notice the pencil. Finish becomes Your initiative, the page a person returns to, with one status line. The optional email field at Certified sign-in goes; an address is asked for only when something will be sent to it. Publication to Certified goes through a handoff with prefilled fields and the person confirming on Certified, not a Weave write scope. The prototype shows Certified as the one door and keeps the production email code path until the usability round counts how many people get through Certified sign-in; D26, D28, DL-021, 08 and the "Saving and signing in" words in VOICE.md move together once that is confirmed. New patterns: the pencil chip variant and the Status line molecule.

## DL-032: Sign-in only identifies, and saving, sharing and publishing are separate taps

**Status:** maker's call, 10 November 2026, applying the agreed first-release architecture to the interface; the council items it touches stay open. It replaces four parts of DL-031: saving on the way back from sign-in, the one status line, the audience ladder and the hand-off to a Certified page for publishing. Signing in with Certified only identifies the person. Save is its own tap and says where the initiative goes: private saves, or the team workspace of a linked group project once that workspace is open. A Certified project is linked or created as its own step, and linking brings the name, place, description and links from Certified. Sharing needs and offers for matching and publishing them on Certified are separate actions in Weave, each with a review of the exact entries, fields and audience before anything leaves. The entries open ticked and any can be unticked, and a first publish starts from what is already shared. Withdrawing a listing is asked for and confirmed later, and its row says so until Certified confirms. Your initiative carries one row per action. The optional email stays, as a closed disclosure in the live account section. Describe is one screen with one Continue, and needs and offers are one page with two lists. Home has two doors: start an initiative, or open a saved one. Partner suggestions start with a linked project, come as direct fits and possible fits, and offer no introductions; searching what other teams shared also needs one shared need or offer. When a finished step removes the control that held the focus, the line that states the outcome takes it, else the page heading. The Certified side stays a labelled development example until its service contracts exist. No new classes: the one page reuses Card grid, Ask list and Ask card.

## DL-033: One footer on every page, with title case links

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. Every page carries the same footer: three short lists named Weave, Data & Privacy and Regen Commons. The slim row that focused steps used is gone, because a footer that changes between pages reads as a different place; a page only leaves out the link to itself. Data & Privacy replaces Your data and holds What We Store, What the Assistant Did, Data Policy and Settings; Data Policy moved there from the Regen Commons list. Regen Commons lists the website, membership, the YouTube channel and the forum space on the Regen Coordination hub. Who runs the YouTube channel is still to be confirmed, because the website does not link to it yet. Footer labels use title case: the one exception to sentence case in VOICE.md, for footer links only. In development the example world's one label sits under the links (DL-039). Removed: the slim variant and the footer row part.

## DL-034: Four sections, the account on Your initiatives, and one Back link

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. The sections are Home, Initiatives, Funding and Your initiatives, in the header on wide screens and in the Bottom navigation on phones. Partners is no longer a section: partner suggestions belong to one initiative, so they are reached from Your initiative. Your initiatives holds the account: signed out it offers Sign in with Certified, and signed in it shows the handle, Sign out, Settings and what the person can open. The header offers Sign in while signed out and has no account button, so Account button is deprecated. The Initiatives section uses the people icon, because the search icon promised a search. A page that is not a section has one Back link above its heading; it names the page it returns to and steps back through history, falling back to the page's parent when the page was opened directly. Sheets close with the browser's Back (DL-035). Back navigation is still to be agreed, for iPhones in particular, so Back link stays a candidate. DL-041 settles it. Whether "initiatives" becomes "projects" in people-facing labels is open and not applied. New class: Back link. No tokens changed.

## DL-035: Records open as sheets over their list

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. Dialog gains a third presentation, detail, beside information and task. An opportunity and a public initiative open as a detail sheet over their list, so reading one does not leave the list: the address changes with the sheet, Back closes it, Forward reopens it, the list keeps its scroll, and focus returns to the card that opened it. An address opened directly shows the record over its list. On phones every presented dialog is a full-width bottom sheet that rises from the bottom edge, with a handle that follows a drag: a release past three tenths of the sheet's height, or a quick flick down, dismisses it, and anything less settles back. Leaving reverses the motion and never holds a close longer than 600 milliseconds. With reduced motion the sheet appears and leaves at once. A press outside closes information and detail, never a task, because a task holds a decision. The behaviour lives in one module, exported as `./sheet`, which the app's Dialog component and the pattern library both use. The Green Goods bottom sheet was the reference for the feel. New part: the dialog grip. No tokens changed.

## DL-036: Cards open from their title, and the funding views

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. A listing card opens from its title, whose hit area covers the whole card, so no card carries an Open button. Nothing lifts on hover: the pointer changes and the title underlines; a press tints the card and, unless motion is reduced, shrinks it slightly; the focus ring goes round the whole card. A funding card reads faster with accents in place of default text: an Eyebrow carries the award beside the funding icon, and the deadline is a clock Tag; the comparison slot is removed. The opportunity detail has one link out, Open the funder's page, in place of two that went to nearly the same place, and one primary that follows the person's state: Describe your initiative until a card is described, then the funder's page. Changing a filter rewrites the address without adding a history entry and moves neither focus nor scroll. Suggest a fund lets a person tell Regen Commons about a fund the catalog lacks; it is a development example that keeps the suggestion in page memory, asks for no contact details and sends nothing. Production needs an endpoint that validates the link, and a review queue. With no card, Funding and Partners show the same single prompt to describe an initiative.

## DL-037: Home's order, one primary and plain status rows

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. Home runs in this order: the hero, three numbered steps, eight kinds of support with a short note and a link to the eight forms of capital, funding closing soon, recently shared initiatives, and Built by Regen Commons. Funding closing soon moved above recently shared. The numbered steps explain how it goes and none is a link, so none is highlighted. The hero keeps one primary; with a card on this device it is the resume action, and the hero's words give the card's name and where it stands. No Status line sits above the hero, which supersedes that part of DL-032. A status row has no icon: the words carry the state. Built by Regen Commons has one way to learn more, one way to join, and names Afolabi Aiyeloja as the builder with a link to afolabi.info. Your initiative shows the card first, then one row per action. Copy as text is removed, because it had no clear use.

## DL-038: Voice leads where the device can transcribe

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. Speaking is the easiest way to say what an initiative is, needs and can offer. Where the device can transcribe speech, Voice input sits above the four fields of a new initiative and takes the primary until something is typed, and it leads each of the needs and offers lists until the list is full. Speaking opens the conversation already listening. Otherwise the typed path stays first and Talk it through instead opens the conversation. The stepper keeps its three steps on one row on a phone. What Certified is has one explanation, a short disclosure with a link to Certified's own page, wherever sign-in is offered: the sign-in task, Your initiatives and Settings. Settings gains Install Weave on your phone, with steps for iPhone or iPad and Android, and says that an installed app on an iPhone or iPad starts empty. No new classes.

## DL-039: One label for the example world, no funders among initiatives, four types of work

**Status:** maker's call, 10 November 2026, from the maker's second design review; the council items it touches stay open. The development example world used to label itself on cards and in messages, which cluttered the design; it now says so once, in the footer under the links, and production never shows it. Funders are listed under Funding only: the initiatives list shows no funder and its filter has four options. PRD R19 asks for five-lens curation on every list, so the funders lens stays in the card contract and the question goes to the PRD's owners. The types of work are Place-based, Research, Art and culture and Technology; Place-based community was shortened and keeps its hyphen. No type was added: four keeps the vocabulary small, and more waits for evidence from real initiatives. DL-040 adds Learning and education.

## DL-040: Learning and education joins the types of work

**Status:** maker's call, 10 November 2026, answering the question DL-039 left open; the council items it touches stay open. Learning and education is the fifth type of work: the lens `learning`, for schools, courses, workshops and learning together, with its own learning icon. It runs through the card contract, the account check in `packages/api`, the keyword rules in English and Portuguese, the initiatives filter and the work tags. The PRD's lens list includes it. R19 and the launch metric no longer state a count, so the metric now asks for every lens, this one included, which the council should confirm. Learning stays a theme as well: a theme says what the work is about, and a lens says what kind of work it is. No tokens changed.

## DL-041: Back navigation works like a native app

**Status:** maker's call, 10 November 2026, the maker's answer to the question DL-034 left open. The app header stays at the top as the page scrolls. On a page that is not a section, the Back link sits at its start in place of the product name, on phones and wide screens alike, where a native app bar keeps it. It names the page it returns to, steps back through history and falls back to the page's parent. Back and Forward bring a page back where the person left it, without the arrival motion. Tapping the section you are on brings its page to the top; on a page inside the section, it opens the section's first page. Sheets still close with Back, Escape and a drag. Two native habits are not copied. Sections do not keep a history each, because the browser keeps one. Weave adds no swipe of its own: Safari and Android already go back with one, and whether the installed iPhone app needs one has to be tried on a device, because a second gesture could go back twice. Back link becomes stable. No tokens changed.

## DL-042: Ask before a second copy of a Certified project

**Status:** maker's call, 10 November 2026, agreeing the approach proposed after the second design review. Weave never links a card to a project on its own. Signed out, the first describe step offers to start from a Certified project. Signed in, when the card looks like one of the person's projects, a notice at the top of the needs step, which every way through the first step reaches, and again beside Save offers Use this project, which links the card and takes the project's four details while needs and offers stay as they are, or It's a different initiative, which puts the question away for the visit. A card looks like a project when they share a link, when their names have the same words, or when every word of a shorter name of two words or more is in the longer one, ignoring case, accents and plurals. Catching a duplicate before sign-in needs a public project search on Certified, which is not a contract yet, and production needs Weave to read a person's projects; until then the example world shows it. Notice may carry one question with its own action bar. No new class. No tokens changed.

## DL-043: Tabs are all the same width

**Status:** maker's call, 10 November 2026. The four tabs share their row equally, as a native tab bar does. On phones each tab is a quarter of the bar and its label uses the small label size, so "Your initiatives" fits a quarter of a 320 px screen on one line; tabs meet edge to edge with no side padding. In the header each tab is as wide as the widest. The current tab keeps the same weight as the others and is marked by its bar and a stronger colour, so no tab changes width as the person moves between them. This replaces the weight change in the earlier contract. With very large text a label wraps inside its own tab. No tokens changed.

## DL-044: A short last row sits in the middle

**Status:** maker's call, 10 November 2026. When the three steps run two across, the third sits centred on the second row; when the eight kinds of support run three across, the last two sit centred on the third row. Numbered list and Tile grid set their columns by their section's width, at the same widths their minimum card sizes gave before, and centre any short last row. Full rows still fill the width, so the page keeps its left edge. No tokens changed.

## DL-045: The phone tab reads You, and Home links to funding closing soon

**Status:** maker's call, 10 November 2026. "Your initiatives" is 86 px wide at the tab bar's 12 px label size, so it touched the edges of a 90 px tab and wrapped at 320 px. Smaller text was weighed and left out: 10 px still left only 9 px each side and is hard to read. On phones the fourth tab reads You, as personal hubs do in Google Maps and YouTube, with the person icon; the header on wide screens keeps Your initiatives, and the page heading stays Your initiatives. Under Home's search, a second link beside the initiatives shared counts the funds that close within 30 days and opens Funding filtered and sorted that way, so the number matches the list. No tokens changed.

## DL-046: The home hero grows the website's mycelium

**Status:** maker's call, 11 November 2026, from the brief to strengthen the Regen Commons identity. The woven-threads backdrop is replaced by the mycelium from the website's `canvas.js`: sparse branching threads that wobble, now and then turn a right angle, fork, and leave small junction pads and tip bulbs, in four thread colours taken from the theme (circuit, sage, sprout and the accent). It grows once from the hero's sides and rests; on phones it grows less, from the hero's corners only, because the words fill the hero. A mouse grows a small tuft that fades back to the resting picture; touch never does, so scrolling a phone draws nothing. Under reduced motion the resting picture is drawn at once. The canvas takes no pointer, is hidden from assistive technology and in forced colours, stops drawing when the page is hidden or the hero is off screen, and caps its pixel density on phones. A mask keeps the middle clear, where the heading, actions and search sit, and both the canvas and the website's paper grain fade in and out at the hero's top and bottom edges. The grain lies under the whole hero, as on the website; the search field's own fill covers it, so no texture shows behind what people type. `behaviors/mycelium.js` holds it for the app and the pattern library. One extended token, `mycelium-opacity` (0.55 light, 0.9 dark), keeps the threads equally present on paper and on dark loam. DESIGN.md's rule stands: decoration sits behind one hero region at most. Its motion sentence now names the mycelium as the only decorative motion.

**Proposed, not adopted:** let the mycelium and grain also sit behind the hero-like top of a page that has no inputs or rows, such as an empty state on Your initiatives or the moment an initiative is first saved, at the same strength and with the same mask. This would carry the identity past Home without putting decoration behind anything people read closely or fill in. It needs the maker's or the council's call before DESIGN.md changes, because it widens the hero-only rule.

## DL-047: An initiative page names the initiative, and the account closes the list

**Status:** maker's call, 11 November 2026. Your initiative and a team workspace now show the initiative's name as the page heading, with a short eyebrow above it (Your initiative, Team workspace) that echoes the label that led there; the card below drops its own copy of the name. Until the card is loaded the heading stays Your initiative or Team workspace. In a team workspace the header's save status is hidden, because the page's own status rows say where things are saved and who can see them. Manage teammates leads with the default: choose what they can do, then Create invitation link; the link's hint sits above it, and adding someone by their Certified handle is behind a disclosure. Pending invitations say whether a link is unused or someone has asked to join, when it expires, and offer Approve and Revoke. On Your initiatives the signed-in line and Sign out move to the end of the page, after Start a new initiative and Settings. No tokens changed.

## DL-048: The hero's mycelium matches the website, and grows on its own on phones

**Status:** maker's call, 11 November 2026, after comparing the hero with regencommons.com (`main` at `3cd9722`). Supersedes DL-046's thread colours, its `mycelium-opacity` token and its phone corners. The paper grain now uses the website's strength: its noise is drawn at 4 percent inside each tile before the theme's blend and opacity, so the hero shows no band against the rest of the page. The threads use the website's six colours (forest, moss, copper, teal, gold and signal) and its step, thickness, length, two or three branches per tuft, fork rate, junction pads and tip bulbs, with no taper along a branch. At rest the hero holds a handful of small tufts on each side, drawn as the website's growth looks part way through fading. New tufts start bright and fade away over about three seconds while they grow, as the website's do: a moving mouse grows one every 45 px. On a phone, where there is no mouse, one grows on its own every one and a half to three seconds, but only while the hero is on screen and the page is shown. Touch never grows one, and under reduced motion the resting picture is drawn at once and nothing more grows. A phone's tufts come only from the hero's top corners, beside the heading, because its links sit along the bottom. Growth that follows scrolling, as the website's does under a finger, was the alternative: growing on its own shows the identity without any input. The `mycelium-opacity` token is removed.

## DL-049: The header holds three sections at their own widths, and the logo goes home

**Status:** maker's call, 11 November 2026. Supersedes the header half of DL-043. On wide screens each section in the header is as wide as its words, with equal space between sections and from the logo. Home leaves the header, because the logo goes home, and on Home the logo is marked as the current page. Between pages the header changes at once instead of cross-fading with the page, so the current section's bar never fades or slides. The phone's Bottom navigation keeps DL-043: four equal tabs, Home included. No tokens changed.

## DL-050: Accents say where you are and what a thing is

**Status:** maker's call, 11 November 2026, choosing section plus meaning over the website's page-only accents. Green stays the colour of doing: buttons, links, checked choices and switches keep `--action` on every page, so an action never changes colour. Each section gets an accent for where you are, as each page of the website has one: Home forest, Initiatives teal, Funding gold and Your initiatives signal blue. Copper was weighed for Your initiatives and left out because in the light theme it sits within a few degrees of Funding's gold. The accent colours the current tab's bar in the header and the bottom bar, a page's eyebrow, the home hero's italic word, as the website's is, and step numbers. `rc-page[data-section]` sets `--section-accent` and `--section-accent-text` from the new `--accent-*` and `--text-*` roles; pages outside a section, such as the steps that start a card, take Home's. A record keeps the colour of what it is wherever it appears: a funding card (`data-kind="funding"`) has a funding-gold eyebrow on Home and in Partners as on Funding, and kinds of support and stages keep their own colours. Light-theme steps were chosen for contrast: teal and gold text use the 800 steps, and every accent meets 4.5:1 as text and 3:1 as a mark on every surface in both themes, which the tests now check. Focus stays gold everywhere; on Funding the ring's offset keeps it apart from the gold bar. Eight tokens are added.

## DL-051: The website's hero ghost, and accents in a few more places

**Status:** maker's call, 11 November 2026, a second pass on DL-050. The home hero's italic word carries the website's faint copper ghost, offset up and to the right as on regencommons.com, like a print slightly out of register (`--print-ghost`, copper at 10 percent; the offset is in em, so it scales with the heading). The section's accent now also tints the current tab's icon in the bottom bar, as native tab bars do, draws a short bar under each page's title, and colours the logo's mark on hover, as the website's logo takes its page accent. A card that opens its record shows a 3 px edge along its top on hover and keyboard focus, beside the gold focus ring: funding gold for a funding card and initiative teal for an initiative card (`data-kind="initiative"`) wherever they appear, otherwise the section's accent. Buttons, links and controls stay green. One derived token is added.
