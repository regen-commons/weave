# Component inventory

Every pattern in the system, with its status, limits and lineage. The [pattern library](patterns/index.html) shows them running. Tests hold this file to the CSS and to the example pages, so the "Used in" column stays true.

Names describe structure, not content. The product's words live in variants and pages.

## Status

| Status | Meaning |
|---|---|
| `stable` | A foundation atom, or used in at least two pages. Documented, shown in the library and tested. |
| `candidate` | Used in one page or only in the library. Can still change freely. |
| `deprecated` | Still works, and names a replacement and a removal phase in the changelog. |
| `retired` | Removed, with a changelog entry. |

Status words are separate from the stage names (Seed, Sprout) used for initiatives and build phases.

## Atoms

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Heading | `rc-heading` | stable | Page and section titles | `data-size`: hero, page, section | Three lines at most on a phone | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Eyebrow | `rc-eyebrow` | stable | Factual label only when no heading can carry the fact; never decorative | Optional icon | Sentence case, three words | matches |
| Prose | `rc-prose` | stable | Reading text at a comfortable measure |  | Paragraphs of four lines or fewer | funding, home, initiatives |
| Meta | `rc-meta` | stable | Small supporting text |  |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Icon | `rc-icon` | stable | Inline icon from `brand/icons.svg` | `data-size`: sm, lg | Never the only name of a control | code, finish, funding, home, initiatives, matches, matches-empty, saved, step-needs |
| Logo | `rc-logo` | stable | Mark and product name. Returns home. Part: `rc-logo-mark` |  |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Button | `rc-button` | stable | Starts an action | `data-variant`: primary, secondary, quiet, danger. `data-size`: sm, lg. `data-width`: full. `aria-busy`, `disabled` | Label under five words. One primary per region | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Icon button | `rc-icon-button` | stable | An action with a widely known icon, such as close |  | Requires `aria-label` |  |
| Input | `rc-input` | stable | Text, select and text area | `data-kind`: code. `aria-invalid`, `disabled` | Always inside a Field | check-card, code, describe, finish, funding, home, initiatives, intake-finish, needs, offers, settings, step-needs |
| Check | `rc-check` | stable | Native checkbox and radio |  |  | funding, initiatives, needs, offers, opportunity, saved, settings |
| Switch | `rc-switch` | stable | A setting that applies at once | `role="switch"` | Never pre-checked for email |  |
| Chip | `rc-chip` | stable | A choice you tap. Part: `rc-chip-remove` | Selectable, removable | 44 px high |  |
| Tag | `rc-tag` | stable | A label you read | Plain, with an icon, `data-capital` | Three words | funding, initiatives, needs, offers, step-needs |
| Tile | `rc-tile` | stable | Glyph for a form of capital | `data-state`: suggested, empty | Two letters | home, needs, offers, step-needs |
| Stage | `rc-stage` | stable | Stage of growth, with icon and plain word | `data-stage`: seed, sprout, flowering, tree |  | finish, matches, step-needs |
| Fit | `rc-fit` | stable | Strength of a match as a word and bar. Part: `rc-fit-bar` | `data-level`: strong, good, possible | Never a number | finish, funding, initiatives, matches |
| Timestamp | `rc-time` | stable | When a record was last confirmed | `data-stale` | Stale after 180 days | finish, matches |
| Spinner | `rc-spinner` | stable | Short waits, inside a button |  |  |  |
| Skeleton | `rc-skeleton` | stable | Space held for content that is loading |  |  |  |
| Surface | `rc-surface` | stable | A plain raised or tinted panel | `data-level`: raised, tint |  |  |
| Skip link | `rc-skip-link` | stable | First stop for keyboard users |  | On every page | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Visually hidden | `rc-visually-hidden` | stable | Text only for assistive technology |  |  | step-needs |

| Media | `rc-media` | stable | Supplied image or labelled synthetic placeholder; fixed aspect ratio | `data-size`: thumb, wide | No third-party app images until D30 | funding, home, initiatives |
| Account button | `rc-account` | stable | Opens Settings from the header |  | Accessible name required; live state needs sign-in adapter | funding, initiatives |

## Molecules

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Form | `rc-form` | stable | Stacks fields at the right rhythm |  | 28 rem wide | check-card, code, finish, needs, offers, saved |
| Field | `rc-field` | stable | Label, hint, control, error. Parts: `rc-hint`, `rc-error` |  | Label always visible | check-card, code, describe, finish, funding, home, initiatives, intake-finish, needs, offers, settings |
| Composer | `rc-composer` | stable | The box a person writes in. Part: `rc-composer-actions` | Speak and Attach when working |  | describe, needs, offers, step-needs |
| Proposal | `rc-proposal` | stable | A suggested value awaiting confirmation. Parts: `rc-proposal-source`, `rc-proposal-value` | `data-state`: confirmed | Value under 12 words | check-card, needs, offers, step-needs |
| Choice group | `rc-choice-group` | candidate | Selectable cards for a short vocabulary. Parts: `rc-choice`, `rc-choice-text`, `rc-choice-title`, `rc-choice-note` | Radio or checkbox | Five options for radios | saved, settings |
| Stepper | `rc-stepper` | stable | Where you are in a short sequence. Part: `rc-stepper-mark` | `aria-current`, `data-state`: done | Three to five steps | check-card, describe, step-needs |
| Reason | `rc-reasons` | stable | Why something appears for you. Part: `rc-reason` |  | Three lines of one sentence | finish, matches |
| Card | `rc-card` | stable | One record. Parts: `rc-card-header`, `rc-card-title`, `rc-card-meta`, `rc-card-summary`, `rc-draft-preview`, `rc-draft-status` | `data-stage`, `data-kind`: need, offer. `data-pencil`, `data-layout`: listing | Listing titles reserve two lines; summaries three lines | check-card, describe, finish, funding, home, initiatives, intake-finish, matches, needs, offers, step-needs |
| Tag list | `rc-tag-list` | stable | A row of tags |  |  | funding, initiatives, needs, offers, step-needs |
| Tile list | `rc-tile-list` | candidate | A row of tiles with each state in words |  | Eight tiles | step-needs |
| Record | `rc-record` | candidate | What is known, with room for what is missing | `data-empty` on a value |  | step-needs |
| Stamp | `rc-stamp` | stable | Last confirmed, and a way to confirm again |  |  | finish, matches |
| Notice | `rc-notice` | candidate | A message in the flow of the page. Parts: `rc-notice-body`, `rc-notice-title` | `data-tone`: success, info, warning, danger | Two sentences | opportunity, opportunity-private, saved |
| Message | `rc-message` | stable | One turn of conversation | `data-from`: assistant, person |  | describe, needs, offers, step-needs |
| Tabs | `rc-tabs` | deprecated | Sibling views only; Partners and Funding use separate pages | `aria-current` | Three tabs on a phone, with counts |  |
| Action bar | `rc-action-bar` | stable | The things you can do with a record |  | One primary | check-card, describe, finish, funding, home, initiatives, matches, needs, offers, saved, step-needs |
| Progress | `rc-progress` | candidate | A long task, with a way to stop |  |  |  |
| Save status | `rc-save-status` | stable | Says where the work lives | `data-state`: device, account | Visible through the intake | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Search | `rc-search` | candidate | A box, a button and the word Search |  | No scope menu before results | home |
| Breadcrumbs | `rc-breadcrumbs` | candidate | A place inside its larger places |  |  |  |
| Facts | `rc-facts` | stable | Plain terms for consent and privacy |  |  | describe, intake-finish, needs, offers, opportunity, opportunity-private, settings |
| Empty state | `rc-empty` | candidate | A first screen with one thing to do. Part: `rc-empty-title` |  | One action, no filters | matches-empty |

| Tooltip | `rc-tooltip` | stable | Explains a compact sign. Parts: `rc-tooltip-wrap`, `rc-tooltip-trigger` | Native interest and hint, local fallback | Hoverable, dismissible with Escape, same words for screen readers | funding, home, initiatives, needs, offers, step-needs |
| Inline field | `rc-inline-field` | stable | A field and action at the same large height | Wraps on phones | Use inside a labelled Field | funding, home, initiatives |
| Link preview | `rc-link-preview` | stable | Supplied external link, title and preview. Part: `rc-link-preview-text` | Optional Media thumbnail | Never fetch from the browser; no preview service yet | funding, initiatives |

| Section | `rc-section` | stable | Groups a heading, content and optional browse action. Part: `rc-section-head` | | Heading with one supporting line at most | home, intake-finish |
| Tile card | `rc-tile-card` | candidate | Glyph, framework title and plain meaning. Parts: `rc-tile-card-title`, `rc-tile-card-meaning` | `data-capital` | One tooltip trigger; meaning stays visible | home |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Conversation | `rc-conversation` | stable | Ordered, editable turns. Parts: `rc-conversation-turn`, `rc-conversation-label` | `data-from`: assistant, person | One question at a time; fixed questions are the labelled D36 default | describe, needs, offers |
| Attachment list | `rc-attachment-list` | candidate | Local file and link references. Part: `rc-attachment` | | State what was read; never imply an unread PDF was parsed | describe |
| Voice input | `rc-voice-input` | stable | Large local-speech action and editable result. Part: `rc-voice-transcript` | Listening, unavailable, error | Only show Speak when local processing is available | describe, needs, offers |

| Ask card | `rc-ask-card` | stable | One need or offer in pencil or ink. Parts: `rc-ask-title`, `rc-ask-terms`, `rc-ask-foot`, `rc-ask-editor`, `rc-ask-summary` | Card `data-kind`, `data-pencil`; removed with Undo | All eight kinds alike; Keep, Change, Remove; raw edits survive reload | initiatives, needs, offers |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Record list | `rc-record-list` | candidate | Assistant metadata only. Parts: `rc-record-row`, `rc-record-text`, `rc-record-title` | Empty and populated; local, failed and cancelled | Never source text or credentials | settings |

## Organisms

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Team slots | `rc-team-slots` | stable | Requirements with counts or candidates. Parts: `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate`, `rc-team-coverage`, `rc-team-line` | Private counts, shared examples, no requirement | Distinct asks and selected initiatives; never eligibility | opportunity, opportunity-private |
| Ask list | `rc-ask-list` | stable | Needs or offers beside a conversation. Parts: `rc-ask-head`, `rc-ask-count` | Empty, working, overflow, offline, error | Five active cards; say when more were heard | initiatives, needs, offers |
| Share card | `rc-share-card` | candidate | Explains partner counts and sharing before showing names | Unconnected, count-only example | Inline email and code; never invent a production count | intake-finish |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| App header | `rc-app-header` | stable | Product name, sections, honest save status and account link. Parts: `rc-app-nav`, `rc-app-header-state` | Form pages drop the sections |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Bottom navigation | `rc-bottom-nav` | stable | Sections on phones |  | Four items, icon and word | finish, funding, home, initiatives, matches, matches-empty, saved |
| Guide panel | `rc-guide` | stable | The conversation for one step. Parts: `rc-guide-log`, `rc-guide-status`, `rc-conversation-panel` |  |  | describe, needs, offers, step-needs |
| Review sheet | `rc-review` | stable | Suggestions waiting for you. Part: `rc-review-list`, `rc-review-grid` |  |  | check-card, step-needs |
| Code panel | `rc-code-panel` | stable | Save or sign in by email code. Parts: `rc-code-panel-title`, `rc-code-panel-actions` | Email step, code step, error | One field per step; inline offer or explicitly opened task | code, finish |
| Card list | `rc-card-list` | stable | A counted list of cards. Parts: `rc-card-list-header`, `rc-card-list-items` |  |  | finish, initiatives, matches |
| Dialog | `rc-dialog` | stable | Consent, confirming steps and short information. Parts: `rc-dialog-body`, `rc-dialog-title`, `rc-dialog-head` |  | No unsolicited modal or wall | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Data table | `rc-table` | candidate | Desk lists and the record of assistant use. Part: `rc-table-scroll` | `data-align`: end |  |  |

| Filter bar | `rc-filter-bar` | stable | Search, filter menus, sort, removable chips and count. Parts: `rc-filter-controls`, `rc-active-filters` | Shared by Partners, Funding, Initiatives | OR within a filter; AND between filters | funding, initiatives |
| Menu | `rc-menu` | stable | Native controls in a popover. Parts: `rc-menu-group`, `rc-menu-option` | Local fallback without Popover API | Named fieldset, visible close action, Escape and outside dismissal | funding, initiatives |
| Footer | `rc-footer` | stable | Weave, Your data and Regen Commons links. Parts: `rc-footer-grid`, `rc-footer-title`, `rc-footer-row`, `rc-footer-link` | `data-slim`: true | Every page; slim row on focused steps | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |

| Numbered list | `rc-numbered-list` | candidate | Three ordered cards. Parts: `rc-numbered-item`, `rc-numbered-number`, `rc-numbered-title` | First card links to the start | One linked entry; remaining cards explain later steps | home |
| Tile grid | `rc-tile-grid` | candidate | Equal-size Tile cards with tooltips | | Eight forms of capital | home |

## Templates

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Page shell | `rc-page` | stable | Header, main, footer and navigation. Parts: `rc-main`, `rc-stack` |  |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs |
| Site banner | `rc-site-banner` | candidate | A full-width site announcement above the header |  | One short message | home |
| Step layout | `rc-step-layout` | stable | One column, then a sticky side panel. Parts: `rc-step-main`, `rc-step-aside` |  |  | check-card, describe, finish, initiatives, intake-finish, needs, offers, opportunity, opportunity-private, step-needs |
| List layout | `rc-list-layout` | stable | Full-width list with its own prose measure |  | Card grid columns at least 18 rem | funding, initiatives, matches, matches-empty |
| Narrow layout | `rc-narrow` | stable | Focused single tasks |  | 28 rem | code, saved, settings |
| Home hero | `rc-home-hero` | candidate | Centred heading, start action, search and one sign of life. Parts: `rc-home-actions`, `rc-home-live`, `rc-woven-backdrop` | Still backdrop under reduced motion | Short phone hero with a full-width woven backdrop | home |

| Card grid | `rc-card-grid` | stable | Equal-height record cards, bottom actions and aligned fit lines | Responsive columns at least `--card-min-width` | Full width with one column on phones | finish, funding, home, initiatives, matches |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Settings | `rc-settings` | candidate | Choices in place, with Leave last. Part: `rc-settings-leave` | Device and account; example deletion | No inert production controls | settings |

## Planned

These have no code yet. They come with the phase that first needs them, and stay with that feature until a second use, following the rule below.

| Pattern | Level | Phase | Job |
|---|---|---|---|
| Place summary | Organism | 2 | A place's own name, counts, and needs with cited sources, under breadcrumbs |
| Partnership board | Organism | 2 | Purpose, who is in, roles needed, how to join and leave |
| Revision history | Organism | 1 | Who changed what and why, on the desk and on an initiative |
| Weekly update email | Template | 1 | The card and reason patterns in email-safe markup |

## Add or change a pattern

1. **Look first.** Search this file and the library for an existing pattern or variant, and reuse it.
2. **Build it with the feature.** If nothing fits, build a candidate where it is used, from existing atoms and tokens only.
3. **Name it.** Blur the content and describe what remains, without product nouns. `Card`, not NeedCard.
4. **Compose.** Include smaller patterns. Never copy their markup.
5. **Take content as input.** Show empty, one, many, long, stale, error, no-assistant, dark and light.
6. **Check it.** Resize continuously from 320 to 1440 px, use the keyboard, then run the [review](../../DESIGN.md#how-we-follow-them).
7. **Record it.** Add a row here, show it in the library, and re-check every listed use if you changed a stable pattern.
8. **Promote it.** On its second real use, mark it `stable` and add a changelog line. When changing a stable pattern, say whether it modifies, adds or removes. Deprecate instead of deleting.

A pull request lists the patterns it touched, every use it re-checked, screenshots at stated widths in both themes, and whether the count of patterns went up or down.

## In React

Phase 0 adds thin React components in `packages/app/src/ui`, one per pattern, that render this markup and these classes. CSS stays here, so the static library and the app share one source. A live `/library` route then replaces the static pages, and lineage comes from the import graph instead of this table.

## Frame and list contracts

### Card grid

Use `rc-card-grid` for Partners, Funding and Initiatives. Columns fill the page with a minimum of `--card-min-width` (18 rem) and collapse to one column on phones. Cards in a row have equal heights and bottom actions. Prose keeps its own measure. See the [initiative](patterns/pages/initiatives.html) and [funding](patterns/pages/funding.html) examples.

### Card

The listing variant reserves two title lines so the next fit line aligns across a row. Funding uses one compact amount and deadline line before the title, marked with `data-slot="comparison"`. Keep full award terms and dates in the body below the fit line. Full names stay in the accessible link and readable detail destination. Independent tooltip and action controls remain above the card's stretched link.

### Filter bar

One bar contains a visibly labelled search field and Search button, filter buttons opening small native-control menus, then sort. Menu triggers show a chevron. Funding uses `data-layout="inline"` to keep the sort label and native select together as the controls wrap. Active selections have individually removable chips and a live result count. Multiple choices within a filter use OR; different filters use AND. Support searches needs, offers or both. Partners can add the two relationship directions once an initiative exists. An empty source shows its first-use action without filters; zero filtered results retain the controls and offer Clear filters.

### Tooltip

Compact tiles, kind tags, work tags and fit lines use `rc-tooltip-trigger` and `rc-tooltip`. The `./overlays` module uses native `interestfor` and hint popovers where supported. Its dependency-free fallback preserves hover, focus, touch, Escape dismissal and pointer movement over the explanation. The native association supplies screen-reader text; the fallback adds `aria-describedby` and a tooltip role. Dispose the connection on unmount. Geometry is measured in the behaviour module; appearance remains in layered CSS. No polyfill is required.

### Footer

Every page has Weave, Your data and Regen Commons destinations. Focused steps use a slim row. Information opens over the current page, with a dialog on wide screens and a bottom sheet on phones. Until the data services and full policy exist, the frame's working information dialogs say what this version actually stores. They are not a substitute for Step 8's full record and controls.

### Work tag and media

Work tags use an icon and outline, apart from filled theme tags and capital tiles. Research and culture icons follow the existing sprite grid and stroke. Initiative media uses a fixed ratio; Funding has no image. Current examples use explicitly labelled synthetic placeholders, pending D30. Link preview renders supplied content and a destination; it performs no external request. Step 6 adds the public-page composition and approved preview service boundary.

### App header and navigation

The logo, main content and footer share a left edge. Main sections are Home, Partners, Funding and Initiatives. Active state has a border and a weight change. Focused steps omit the section navigation. A truthful save status remains visible; Saved and the account button require actual saved state, or an explicitly labelled development fixture. The account button opens Settings. Sign-in stays out of production until its adapter exists.

### Inline field

Pair a labelled field and button at `--control-lg-height`, allowing wrapping when needed. New pages start at the top with the heading focused after in-app navigation. Durations and easing come from tokens, with all motion stopped under reduced motion. Flow-height refinements continue with the conversation and save patterns in later steps.

## Home composition

Home has five parts: the hero, three numbered steps, eight kinds of support, recently shared initiatives and the three upcoming funding deadlines that close first (review decisions 7 and 10). The first numbered card is the way into describing. Steps 2 and 3 explain what follows. Do not promise working speech, attachments or saving before those features exist.

The hero's decorative SVG threads inherit capital colour tokens and move slowly using duration and easing tokens. Under reduced motion the same weave stays still; forced colours hide it. It is hidden from assistive technology and cannot intercept a tap. There is no canvas loop or animation script.

Support cards use Living, Material, Intellectual, Experiential, Social, Financial, Cultural and Spiritual as titles, with the plain meaning beneath and examples in a tooltip. Compact tags keep the same title and explain the meaning in help (DL-026, revisiting DL-014).

Recently shared uses the supplied sharing date, not last confirmation. Upcoming funding excludes past, unknown and rolling deadlines, shows days left and the full date, and keeps the earliest three. A closing date alone is not eligibility. Fixtures name their reference date; no sample count or sample record appears in production. Loading, empty, partial, offline and error states keep the hero, steps and kinds usable.

## Describe and review contracts

Conversation uses the fixed short script as the labelled D36 default, accepts edits and keeps answers, composer text, file bytes and links on the device. Speak appears only after the browser confirms local speech for the selected language. Files and links remain available while talking; name files that were retained but not read. No remote link fetch is implied.

Build my card reads the current input revision. A newer edit cancels or invalidates old output. Derived details remain in Proposal pencil until Keep, Change or Remove; removing a guess prevents later builds from reintroducing it, and Undo restores it. Public fields stay editable. Confirming a local card does not save to an account or share it.

Use the Card preview beside the conversation and review. Keep a steady working area, start new routes at the heading and stop all motion under reduced motion. The assistant prompt and cloud consent are native dialogs or notices. Production hides unavailable service actions. Download and cloud states may be shown only as labelled, in-memory fixtures until D32 and D35 permit adapters.

## Needs, offers and finish contracts

Ask card is one need or offer with Keep, Change and Remove. Every applicable kind has the same treatment; the editor offers all eight. A kept card is ink. A removed card has Undo, which restores its previous pencil or kept state and cannot exceed the five-card limit. Names and raw unfinished fields remain editable and survive reload.

Ask list shows the active count out of five, with a notice when more were heard. Full source words and file bytes remain available. Kept corrections and removed source chunks are pinned across rebuilding; use a new answer or a manual card for a new ask. Unknown kinds require a person to choose before keeping. Currency is never guessed. Place scope and terms start as reviewable Anywhere and Open to anything defaults. Open to anything is exclusive of the other terms.

Needs carry timeframe, urgency and purpose; offers carry capacity and audience. Both carry status. These are local draft cards, not published commitments. Continuing requires every pencil card to be kept, changed or removed and no unfinished editor or source input. An empty step can continue. Manual mode keeps notes and files without reading them.

Finish shows first funding, the Share card and the checked initiative with its kept needs and offers. Copy as text contains checked card data, with a selectable fallback, not source file bytes. A private initiative sees no individual partner names. Unknown live counts stay unknown. Funding feeds, partner matching and the email/share adapter follow in Steps 5 to 7; development examples are labelled and excluded from production.

## Funding and team slots contracts

Funding uses the existing catalog's thematic fit, readiness, research-priority groups and sourced reasons without changing its rubric. Fit is a word and bar, never a numeric promise. Unknown fit remains unassessed. Visitors can browse the whole catalog without invented ranking. Program links preserve the fund and program identities. Closed cycles, unverified offers and funding resources stay distinct and searchable. Source dates, unknowns and official links remain visible.

Team slots is an organism for a fund's partner requirements. Parts are `rc-team-slots`, `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate` and `rc-team-coverage`. Card summaries use `rc-team-line`. Private initiatives see counts only. Shared examples expose labelled native checkboxes and reasons. Coverage counts distinct requirements and distinct selected initiatives; one initiative can meet several asks and is requested once. Coverage never changes the solo rubric or approves eligibility. D29 keeps requirements, team fit and introductions as labelled development examples; production does not invent requirements or counts. Email reminders and live introductions wait for Step 7.

## Contextual account and email tasks

An explicitly opened task uses native Dialog with `data-presentation="task"`: a
centred dialog on wide screens and a full-width bottom sheet on phones. Close is
visible at its top; Escape closes it and the browser returns focus. Forms remain
native. Dialog scroll stays contained where the platform supports it. Unsolicited
save offers remain inline, with the email and code in the Share card.

The live private flow reuses the same account panel in the sheet, Finish and
Settings. Each instance has unique labels. Verification alone never overwrites or
uploads a device draft; saved cards are listed before Save or Load is chosen.
The development-only email-door adapter demonstrates two visibility choices,
separate default-off onward sharing, a specific fund reminder and confirmed
introductions. Its actions use the same code door without sending mail or changing
production permissions. No live sharing or delivery is implied.

## Public initiatives and partner contracts

The [Initiatives example](patterns/pages/initiatives.html#public-example) composes
Media, Step layout, Card list, read-only Ask cards, Work tags and supplied Link
previews. Public asks show all applicable kinds equally and carry no editing or
commitment controls. A missing link or ask has a plain empty state. Previews never
fetch a destination or imply that its owner supplied a photo.

Partners uses the Share card before sharing, with counts only and no individual
names or reasons. Unknown counts stay unknown. The shared example uses the same
listing Card with a fit band and concrete reasons; Not a fit asks why and has Undo.
Account access alone never opens partner cards. The independent public directory
remains browsable. Live public sharing, matching and introductions require their
service contracts and D26, D28, D30 and D31 decisions. Development examples never
publish a private initiative.

## Settings and data contracts

Settings groups Your initiative, Email, Assistant, Appearance and Your data in place.
Leave comes last, with sign-out and deletion set apart. Membership stays in the
footer. Unconnected server controls appear only as labelled development examples;
production explains what service is missing.

Record list is a molecule for the assistant's metadata: step, local engine, model,
date, status and counts read or sent. It never includes the person's words. Its
metadata download uses an explicit field list. What we store opens as five concise
facts, with a separate full policy in the same native pop-up. Both work offline.

Download device data captures the current visible draft, source words, unfinished
edits, original file bytes and local backups. It names its device scope and never
claims to export unrequested server cards. A failed file read rejects the download
without changing the draft. Account deletion and a complete account export require
their own authorized server adapters; a fictional deletion never calls them.
