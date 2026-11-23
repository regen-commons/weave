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
| Heading | `rc-heading` | stable | Page and section titles. A page title carries a short bar in its section's accent (DL-051) | `data-size`: hero, page, section. Optional icon for the sign of what it lists, such as needs or offers | Three lines at most on a phone | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Eyebrow | `rc-eyebrow` | stable | Factual label only when no heading can carry the fact, such as the award on a funding card, or the kind of page above an initiative's name (DL-047); never decorative. It takes the section's accent, and funding gold on a funding card (DL-050) | Optional icon. `data-until="wide"` where a wide screen's breadcrumbs already say it (DL-080) | Sentence case, one short fact | funding, home, matches |
| Prose | `rc-prose` | stable | Reading text at a comfortable measure |  | Paragraphs of four lines or fewer | funding, home, initiatives, signed-out |
| Meta | `rc-meta` | stable | Small supporting text |  |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Icon | `rc-icon` | stable | Inline icon from `brand/icons.svg` | `data-size`: sm, lg | Never the only name of a control, except in an Icon button | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Logo | `rc-logo` | stable | Mark and product name. Returns home. The mark is the website's ring with a little mycelium that grows once and rests, fills under a mouse, and takes the section's accent on hover (DL-054). Part: `rc-logo-mark` | `data-from="wide"` beside a Back link, which has its place on a phone | On a phone a page that is not a section shows the Back link in its place; a wide screen keeps the logo (DL-080) | code, funding, home, initiatives, matches, matches-empty, saved, settings, signed-out, your-initiatives |
| Button | `rc-button` | stable | Starts an action. Pressed, it takes its hover look on every device and gives a little under the press; hover is asked for only where the device hovers (DL-087) | `data-variant`: primary, secondary, quiet, danger. `data-size`: sm, lg. `data-width`: full. `aria-busy`, `disabled`. `data-busy="keep"`: a busy button that must not move what is beside it keeps its label and width, and a Spinner takes the label's place (DL-085) | Label under five words. One primary per region | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Icon button | `rc-icon-button` | stable | An action or a link with an icon people read without a word: close, the header's switch between light and dark on a wide screen, which shows the theme it changes to (DL-079), or the header's Account button, a person that opens the account's Menu for a signed-in person on a wide screen (DL-070) | `aria-current` as a link. `aria-expanded` shows its menu is open. `data-variant="secondary"` outlines it with a secondary Button's line and corners and draws its glyph at the large size, and `data-size="sm"` gives it that button's small height, so the header's theme switch, Sign in and Account button are drawn as one set (DL-107, DL-116) | Requires `aria-label` | matches, opportunity-private, saved, settings, your-initiatives |
| Input | `rc-input` | stable | Text, select and text area | `data-kind`: code. `data-pencil`: dashed, filled in from the person's words and not changed by them yet (DL-110). `data-sizing`: fixed, a text area that keeps the height of its rows whatever it holds. `aria-invalid`: a thicker danger edge that comes out of the padding, so marking a field changes neither its size nor the place of anything under it (DL-127). `disabled` | Always inside a Field | check-card, code, describe, finish, funding, initiatives, intake-finish, needs, offers, settings, step-needs |
| Check | `rc-check` | stable | Native checkbox and radio |  |  | funding, initiatives, needs, offers, opportunity, saved, signed-out, your-initiatives |
| Status slot | `rc-status-slot` | candidate | One line of progress, result or problem that keeps its height, so the words come and go without moving anything under them (DL-085, DL-113). Beside a button in an Action bar it takes the rest of the row | `data-lines`: 2 | One or two short sentences. Use it wherever a press reports back | describe |
| Switch | `rc-switch` | stable | A setting that applies at once | `role="switch"` | Never pre-checked for email |  |
| Chip | `rc-chip` | stable | A choice you tap. Parts: `rc-chip-remove`, and `rc-chip-group` for one question answered with chips, under its fieldset's legend | Selectable, removable, `data-pencil` for a suggested value: a tap keeps it, and one left in pencil is not kept | 44 px high; the remove button is a 44 px target inside the chip's end (DL-088) | funding, initiatives, signed-out, your-initiatives |
| Tag | `rc-tag` | stable | A label you read | Plain, with an icon, `data-capital`, `data-kind`: work with `data-lens` for its type's hue (DL-065), `data-tone` for the icon's colour. `data-emphasis="strong"` for a tag that must not be missed in its row, such as a deadline: heavier words, and its tone along its start edge (DL-103) | Three words | funding, home, initiatives, needs, offers, step-needs |
| Tile | `rc-tile` | stable | Glyph for a form of capital | `data-state`: suggested, empty | Two letters | home, needs, offers, step-needs |
| Stage | `rc-stage` | stable | Stage of growth, with icon and plain word | `data-stage`: seed, sprout, flowering, tree |  | finish, matches, step-needs |
| Fit | `rc-fit` | stable | Strength of a match as a word and bar. Part: `rc-fit-bar` | `data-level`: strong, good, possible | Never a number. On a partner card it comes from what is known: stated and both ways, stated, or read from public work (DL-064) | finish, funding, initiatives, matches |
| Timestamp | `rc-time` | stable | When a record was shared or last confirmed | `data-stale` | Stale after 180 days | finish, home, matches |
| Spinner | `rc-spinner` | stable | Short waits, inside a button: a press being carried out, Voice input's action while it reads, and its button while the browser sets up speech (DL-127) or finishes the words after Stop (DL-133) |  |  |  |
| Skeleton | `rc-skeleton` | stable | Space held for content that is loading, in the shape of what arrives, so the layout holds (DL-081) | `data-shape`: title, line, short, media, panel. `hold` keeps the exact room of words by holding words about as long, unseen, in the type of the part it sits in; `room` keeps a block's by holding the block unseen (DL-104) | Drawn for the eye only; a status line, on the page or for assistive technology alone, says what is loading. Every page, list and sheet that waits for content holds its shape this way (DL-085) |  |
| Surface | `rc-surface` | stable | A plain raised or tinted panel | `data-level`: raised, tint |  |  |
| Skip link | `rc-skip-link` | stable | First stop for keyboard users |  | On every page | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Visually hidden | `rc-visually-hidden` | stable | Text only for assistive technology |  |  | step-needs |

| Media | `rc-media` | stable | Supplied image, or a placeholder that shows an icon only and is named for assistive technology where it stands for a picture; fixed aspect ratio | `data-size`: thumb, wide | No third-party app images until D30. Under 900 px a list card does not draw the placeholder, nor the loading shape that holds its place (DL-090) | funding, home, initiatives |

## Molecules

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Form | `rc-form` | stable | Stacks fields at the right rhythm | `data-width`: full, in a column that is already a reading measure, such as a step's: the form and its fields fill it, so the page has one left and one right edge (DL-127) | 28 rem wide unless full | check-card, code, describe, finish, needs, offers, saved |
| Field | `rc-field` | stable | Label, hint, control, error. Parts: `rc-hint`, `rc-error`. A problem that stops a step is written in the hint's line of the field it is about, as an alert, so nothing moves and the answer is beside the question (DL-127) |  | Label always visible | check-card, code, describe, finish, funding, initiatives, intake-finish, needs, offers, settings |
| Composer | `rc-composer` | stable | The box a person writes in. Part: `rc-composer-actions` | Speak and Attach when working |  | needs, offers, step-needs |
| Proposal | `rc-proposal` | stable | A suggested value awaiting confirmation. Parts: `rc-proposal-source`, `rc-proposal-value` | `data-state`: confirmed | Value under 12 words | check-card, needs, offers, step-needs |
| Choice group | `rc-choice-group` | candidate | Selectable cards for a short vocabulary. Parts: `rc-choice`, `rc-choice-text`, `rc-choice-title`, `rc-choice-note` | Radio or checkbox | Five options for radios | saved |
| Stepper | `rc-stepper` | stable | Where you are in a short sequence. A step already done is a link back to it (DL-113). Part: `rc-stepper-mark` | `aria-current`, `data-state`: done. `data-until="wide"`: the copy at the top of a page is a phone's where a wide screen shows the steps in the Step bar (DL-127) | Three to five steps, all on one row on a phone | check-card, describe, step-needs |
| Reason | `rc-reasons` | stable | Why something appears for you. Part: `rc-reason` |  | Three lines of one sentence | finish, matches |
| Card | `rc-card` | stable | One record, opened from its title: a link, or a button where opening changes what is on the device. Parts: `rc-card-header`, `rc-card-title`, `rc-card-meta`, `rc-card-summary`, `rc-draft-preview`, `rc-draft-status` | `data-stage`, `data-kind`: need, offer, funding, initiative (keeps its own colour wherever the card appears; a card that opens shows that colour, or else its section's, along its top on hover and focus, DL-050, DL-051). `data-pencil`, `data-layout`: listing. `data-rows="fixed"`: every part keeps a set number of lines (title two, summary three and two on a phone (DL-109), one each for the eyebrow, the line under the title and the foot, two rows of tags), so every card of its kind is one height and its skeleton is that height by construction (DL-108). In a fixed-row card an icon in the line under the title marks a second fact, such as a public project's place after who shared it (DL-120) | No button on a listing card. Listing titles clamp to two lines and reserve both only side by side; summaries three lines | check-card, describe, finish, funding, home, initiatives, intake-finish, matches, needs, offers, settings, step-needs, your-initiatives |
| Tag list | `rc-tag-list` | stable | A row of tags |  |  | funding, home, initiatives, needs, offers, step-needs |
| Tile list | `rc-tile-list` | candidate | A row of tiles with each state in words |  | Eight tiles | step-needs |
| Record | `rc-record` | candidate | What is known, with room for what is missing | `data-empty` on a value |  | step-needs |
| Stamp | `rc-stamp` | stable | Last confirmed, and a way to confirm again |  |  | finish, matches |
| Notice | `rc-notice` | candidate | A message in the flow of the page. Parts: `rc-notice-body`, `rc-notice-title` | `data-tone`: success, info, warning, danger | Two sentences. A notice that asks one question carries its own action bar, as the duplicate prompt does | saved |
| Message | `rc-message` | stable | One turn of conversation | `data-from`: assistant, person |  | needs, offers, step-needs |
| Tabs | `rc-tabs` | deprecated | Sibling views only; Partners and Funding use separate pages | `aria-current` | Three tabs on a phone, with counts |  |
| Action bar | `rc-action-bar` | stable | The things you can do with a record | `data-from="wide"` on a child: an action a phone offers somewhere else on the page, or in the Dock, waits for a wide screen (DL-086, DL-089). A bar left with nothing to show on a phone is not drawn there. `data-until="wide"` on the bar: its actions are in the Step bar on a wide screen, so the bar is a phone's (DL-127) | One primary | check-card, describe, finish, funding, home, matches, needs, offers, saved, settings, signed-out, step-needs, your-initiatives |
| Progress | `rc-progress` | candidate | A long task, with a way to stop. Without a value it only says the work is going on: Voice input shows it so while the browser downloads and sets up speech, which reports no amount (DL-127) |  |  |  |
| Save status | `rc-save-status` | stable | Says that the account holds the card, or that this browser could not store the latest changes. A card kept only in this browser gets no label (DL-112) | `data-state`: account, memory | In the app header only on the pages where the card is worked on (DL-059) | check-card, code, finish, funding, intake-finish, saved, settings, step-needs |
| Status line | `rc-status-line` | candidate | One plain sentence on where the work stands, beside the one thing to do about it next. The words carry the state, so the row has no icon. On Funding it says which initiative the fit is for, right above the cards, and its action opens a Menu of this browser's initiatives to change to (DL-118). Composes Save status and Action bar | On this device, saved, shared, published, withdrawal asked for | One sentence and one action a row; one primary across the rows | funding, settings |
| QR code | `rc-qr` | candidate | The way from a computer's screen to a phone's: a code to scan, with the address it opens in words under it (DL-067) |  | Dark on light in both themes. Only for an address the page itself is served from | library only |
| Search | `rc-search` | candidate | A box, a button and the word Search |  | No scope menu before results | funding, initiatives |
| Breadcrumbs | `rc-breadcrumbs` | candidate | A place inside its larger places: the pages above this one, then this page, above its title (DL-080) | `data-from="wide"` shows it from 900 px only, where a phone has the Back link | The trail follows the page structure, never the way the person came. The steps of describing an initiative have none: they are a sequence, and the Stepper says where the person is (DL-085) | settings |
| Back link | `rc-back` | stable | The one way back on a page that is not a section, at the start of a phone's app header in place of the product name. A wide screen keeps the product name there and shows Breadcrumbs above the page's title (DL-080). It names the page it returns to, and the link carries that whole name as its `aria-label`. Part: `rc-back-link` |  | One a page; a long name gives way to the header. On a phone, beside the save status and Sign in, it shows its arrow alone (DL-070) | check-card, describe, finish, intake-finish, needs, offers, opportunity, opportunity-private, settings, step-needs |
| Facts | `rc-facts` | stable | Plain terms for consent and privacy | `data-kind="terms"` for questions and their answers, where the question is what a person scans for |  | describe, opportunity, opportunity-private, settings |
| Empty state | `rc-empty` | candidate | A first screen with one thing to do. Part: `rc-empty-title` |  | One action, no filters | matches-empty |

| Tooltip | `rc-tooltip` | stable | Explains a compact sign. Parts: `rc-tooltip-wrap`, `rc-tooltip-trigger` | Native interest and hint, local fallback | Hoverable, dismissible with Escape, same words for screen readers | funding, home, initiatives, needs, offers, step-needs |
| Inline field | `rc-inline-field` | stable | A field and action at the same large height | Wraps on phones | Use inside a labelled Field | funding, initiatives |
| Link preview | `rc-link-preview` | stable | Supplied external link, title and preview. Part: `rc-link-preview-text` | Optional Media thumbnail | Never fetch from the browser; no preview service yet | funding, initiatives |

| Section | `rc-section` | stable | Groups a heading, an optional browse action, an optional note and content. On a phone the heading takes a row and the action the next, at the start edge (DL-086). Parts: `rc-section-head`, `rc-section-note` | `data-until="wide"`: a section a wide screen's header makes needless shows on a phone only, as the You tab's Settings does (DL-086) | Heading with one supporting line at most | home, intake-finish, signed-out, your-initiatives |
| Panel | `rc-panel` | candidate | A block of words and controls that have no card of their own, such as a form or a side panel. It keeps the block's rhythm and paints nothing: the words sit on the page (DL-099) | The same at every width | Not around a single Card, which is already a surface | describe |
| Tile card | `rc-tile-card` | candidate | Glyph, framework title and plain meaning. Parts: `rc-tile-card-title`, `rc-tile-card-meaning` | `data-capital` | One tooltip trigger; meaning stays visible | home |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Conversation | `rc-conversation` | stable | Ordered, editable turns. Parts: `rc-conversation-turn`, `rc-conversation-label` | `data-from`: assistant, person | One question at a time; fixed questions are the labelled D36 default | needs, offers |
| Attachment list | `rc-attachment-list` | candidate | Local file and link references. Part: `rc-attachment` | | State what the reading made of each file: read, read except some pages, or kept and not read. Never imply an unread PDF was parsed | describe |
| Voice input | `rc-voice-input` | stable | Talk it out (DL-110): one button, one box and one action. The button turns into Stop in place while the browser listens on the device, the words appear in the box, whose rows are always there, and a person who cannot or will not speak types in the same box. Stop answers the press at once: the button reads Finishing, with a Spinner, until the recognizer has handed over its last words (DL-133). The action then structures the words on the device. Leads the describe step and each ask list. Parts: `rc-voice-slot`, which keeps the button's place from Set up to Talk it out to Stop, `rc-voice-aside`, the one line about speech or the language choice beside it, and `rc-voice-transcript`, the box, which fills the width it is given. The box's hint says what to say. While speech is set up the button shows a Spinner and a Progress bar with no amount runs above the line, in room the line always keeps. More actions on the words' sources, such as Add Files, sit beside the action (DL-127) | Listening, finishing, working; speech setup: offer, under way, taking a while, could not set up (DL-076); the browser's own speech service, before and after the agreement, and each way it stops (DL-115); no speech recognition, and the keyboard's microphone key on a touch screen | Speech on the device comes first. The browser's own speech service starts only after the person agrees in a Task dialog, and its line beside the button says so before the agreement and while it listens. Where the browser has no speech recognition, one plain line says so in the button's place and typing works the same. Setup is secondary, keeps one button in place and shows once a page. Pressing anything here moves nothing below it | describe, needs, offers |

| Ask card | `rc-ask-card` | stable | One need or offer in pencil or ink. Parts: `rc-ask-title`, `rc-ask-terms`, `rc-ask-foot`, `rc-ask-editor`, `rc-ask-summary` | Card `data-kind`, `data-pencil`; removed with Undo | All eight kinds alike; kinds as chips, More details, Remove; the page's Continue keeps a suggestion; raw edits survive reload | initiatives, needs, offers |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Record list | `rc-record-list` | candidate | Rows of metadata: the assistant's runs, or this device's backups. Parts: `rc-record-row`, `rc-record-text`, `rc-record-title` | Empty and populated; local, failed and cancelled. `data-layout="actions"` on a row that has its own actions, such as Restore and Delete, kept at the row's end | Never source text or credentials. Two short actions a row at most | settings |

## Organisms

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Team slots | `rc-team-slots` | stable | Requirements with counts or candidates. Parts: `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate`, `rc-team-coverage`, `rc-team-line` | Private counts, shared examples, no requirement | Distinct asks and selected initiatives; never eligibility | opportunity, opportunity-private |
| Ask list | `rc-ask-list` | stable | Needs or offers, with one field to add to the list. Parts: `rc-ask-head`, `rc-ask-count` | Empty, working, overflow, offline, error | Five active cards; say when more were heard | initiatives, needs, offers |
| Share card | `rc-share-card` | candidate | The gate before partner suggestions: says what opens them and offers that step | Before a project is linked | One next step and one way to browse; on the initiative page the saving and sharing section carries the step, so the card keeps only the way to browse; never invent a production count | intake-finish |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| App header | `rc-app-header` | stable | The lead holds the product name, which goes home, and three sections at their own widths with equal space between them, all on one baseline. On a wide screen the state also holds the switch between light and dark (DL-079). The state, at the far end, holds the save status on the pages where the card is worked on, Sign in while signed out, and on a wide screen the Account button and its Menu for a signed-in person (DL-070). A phone's bar has no gear and no switch: its You tab holds the theme and the way to Settings (DL-086). Stays at the top as the page scrolls, and changes at once above the cross-fade between pages (DL-058); on a page that is not a section, the Back link takes the product name's place. Parts: `rc-app-header-lead`, `rc-app-nav`, `rc-app-header-state` | Form pages drop the sections. `data-from="wide"` on a child of the state shows it from the width where the sections appear | The same height at every width, signed in or out; two lines only when narrower than 20rem | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Bottom navigation | `rc-bottom-nav` | stable | Sections on phones. The bar is fixed to the bottom of the window, clear of the phone's home indicator and of a notch at either side, and the page keeps room for it under its footer (DL-086). The current tab's bar and icon take its section's accent, and the bar changes at once above the cross-fade between pages (DL-058) |  | Four equal items, icon and small word. Tapping the current one brings its page to the top. A tab is pressed, not held or dragged like a link: no link menu on a long press, and its word is not selected (DL-095) | finish, funding, home, initiatives, matches, matches-empty, saved, settings, signed-out, your-initiatives |
| Dock | `rc-dock` | stable | A focused step's way forward on a phone, where the tab bar would be: one action across the bottom of the window, on a bar fixed as the tab bar is and clear of the phone's home indicator. It is a child of the page shell, after the page body, and the page keeps room for it under its footer (DL-089). A wide screen does not draw it: the step shows the same action in the Step bar, marked `data-from="wide"` (DL-127) |  | One action, the step's way forward. An empty dock is not drawn. Up to a form's width | check-card, describe, step-needs |
| Step bar | `rc-step-bar` | candidate | On a wide screen, a step's map and its way forward in one bar under the app bar: the Stepper at the start and an Action bar at the far end. It sticks under the app bar, so both stay in view however far the page has scrolled, and spans the window as the app bar does. It is a child of the page shell and comes after the page body, so the keyboard reaches the way forward after the step's fields; the page's grid draws it in the row under the app bar and counts its height (`--step-bar-height`) wherever something sticks under the bars. A phone never draws it: its steps are at the top of the page and its way forward is in the Dock (DL-127). Composes Stepper and Action bar |  | One primary, the step's way forward, with a quiet way back before it. An empty bar is not drawn | describe, step-needs |
| Guide panel | `rc-guide` | stable | The conversation for one step. Parts: `rc-guide-log`, `rc-guide-status`, `rc-conversation-panel` |  |  | needs, offers, step-needs |
| Review sheet | `rc-review` | stable | Suggestions waiting for you. Part: `rc-review-list`, `rc-review-grid` |  |  | check-card, step-needs |
| Code panel | `rc-code-panel` | stable | Save or sign in by email code. Parts: `rc-code-panel-title`, `rc-code-panel-actions` | Email step, code step, error | One field per step; inline offer or explicitly opened task | code, finish |
| Card list | `rc-card-list` | stable | A counted list of cards. Parts: `rc-card-list-header`, `rc-card-list-items` |  |  | finish, initiatives, matches |
| Dialog | `rc-dialog` | stable | Information, one-decision tasks and record detail; a bottom sheet on phones. Parts: `rc-dialog-grip`, `rc-dialog-body`, `rc-dialog-head`, `rc-dialog-title`, and `rc-dialog-foot` for the way out of a set of choices, kept in view | `data-presentation`: information, task, detail | No unsolicited modal or wall. Reads from its start edge wherever its markup sits (DL-100). A press outside or Escape closes any dialog, a task included; one whose work is under way stays open and says why (DL-082). On wide screens: `--prose-width` (detail: `--list-width`), at most `--dialog-height` tall with room above and below, `--dialog-padding` inside; buttons keep their own width (DL-056). On phones a sheet stops at two thirds of the window (DL-060), pulls away from its grip, its title row or its content where that is at its top, and stands on the on-screen keyboard (DL-091) | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Data table | `rc-table` | candidate | Desk lists and the record of assistant use. Part: `rc-table-scroll` | `data-align`: end |  |  |

| Filter bar | `rc-filter-bar` | stable | Search, the filters, Sort, the choices in force as removable chips, and a count with a fact about the whole list. The list narrows as a person types, so the search has no button (DL-081). On a phone one Filters button opens every filter in a sheet, with Sort as its first group; a wider screen gives each filter a menu (DL-061). There Sort is one more button, reading only "Sort", that opens the same menu with one order to pick (DL-100, DL-122). An order other than the list's own shows as a removable chip with the filters. Parts: `rc-filter-controls`, `rc-active-filters` | `data-filter`: all, one. `data-menu` on a button that waits without a menu yet, so it keeps the mark. Shared by Funding and Initiatives, in the same place on both. Search alone where the list has nothing to filter on. Loading: the search works, the bar's own buttons wait in their row, and the count and the fact under it (`data-part="note"`) each keep a line, two for the fact on a phone (DL-104, DL-108) | Any chosen value within a filter; every filter at once. Only filters the list's data can answer | funding, initiatives |
| List end | `rc-list-end` | stable | The foot of a long list: a line that says how much of the list is on the page, announced politely, and Show More. The next batch arrives as a person scrolls near it (DL-101). Every list with cards ends in one, and a loading list holds its room; on a phone it is two rows of set height, with or without Show More (DL-108) |  | After three batches it waits for a press, so the footer can be reached. Nothing arrives unasked while the keyboard's focus is in the list; a press moves focus to the first card it added | funding, initiatives |
| Menu | `rc-menu` | stable | A popover of native controls to set, or of places to go and things to do, as the account's is (DL-070). Its name, its rows and Done share one inset, and it scrolls inside to its last row (DL-100). Parts: `rc-menu-group`, `rc-menu-options`, `rc-menu-option` for controls; `rc-menu-head`, which says whose menu it is, and `rc-menu-item`, a link or a button a row | `data-columns`: 2 on the options, for a list of nine or more. `data-align="end"` ends the menu at its button's end edge. `data-divide` on an item sets it apart with a line, as Sign out is. Local fallback without Popover API | Named fieldset and a visible close action for controls; an item closes the menu when chosen. A menu of one choice opens on its checked radio, others on their first control (DL-124). Escape and outside dismissal | funding, initiatives, matches, opportunity-private, saved, settings, your-initiatives |
| Footer | `rc-footer` | stable | Weave, Data & Privacy and Regen Commons links. It spans the window as the app bar does, and its contents keep the page's edges (DL-102). Parts: `rc-footer-grid`, `rc-footer-title`, `rc-footer-link` |  | Every page, the same; a page leaves out the link to itself; title case labels (DL-033); a row that is a button wraps from its start edge. `data-repeats="tabs"` on the list of Weave's pages: not drawn on a phone where the tab bar shows (DL-093). `data-from="wide"`: the whole footer is left out on a phone, on the steps of describing an initiative and the Your Initiatives tab (DL-128) | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |

| Numbered list | `rc-numbered-list` | stable | Two or three ordered cards that explain how something goes. A step can show the sign to look for beside its words. Parts: `rc-numbered-item`, `rc-numbered-number`, `rc-numbered-title` |  | No card is a link; the page's own action starts the sequence. A short last row is centred | home, settings |
| Tile grid | `rc-tile-grid` | candidate | Equal-size Tile cards with tooltips | | Eight forms of capital. A short last row is centred | home |

## Templates

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Page shell | `rc-page` | stable | Header, page body, footer and navigation. The page body spans the window, is at least as tall as the window under the app bar, or between the app bar and a phone's tab bar or Dock, and has the mycelium behind it on every page (DL-078, DL-086, DL-089). From 1600 px the page widens to `--page-width-wide` (DL-077). Parts: `rc-page-body`, `rc-main`, `rc-stack` (`data-gap="wide"` between a page's sections) | `data-section`: home, initiatives, funding, your-initiatives sets the section's accent; pages outside a section take Home's (DL-050). `data-move="return"` on `rc-main` when Back or Forward reached the page, which then shows as it was left without arriving again |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, signed-out, step-needs, your-initiatives |
| Site banner | `rc-site-banner` | candidate | A full-width site announcement above the header, at a known height (`--site-banner-height`) that the page body leaves out of the window it fills (DL-102) |  | One short message | home |
| Step layout | `rc-step-layout` | stable | One column, then a side panel that sits beside it and stays under the app bar for the length of the page; the wheel moves the page over it (DL-085). Parts: `rc-step-main`, `rc-step-aside` | `data-main="wide"`: a record page's column takes the rest of the width. A second `rc-step-main` after the panel follows it on a phone and sits under the first column on a wide screen. `data-from="wide"` on the panel keeps one that only mirrors the work for a wide screen | The panel never traps the wheel | check-card, describe, finish, initiatives, intake-finish, needs, offers, opportunity, opportunity-private, step-needs |
| List layout | `rc-list-layout` | stable | Full-width list with its own prose measure |  | Card grid columns at least 18 rem | funding, initiatives, matches, matches-empty, your-initiatives |
| Narrow layout | `rc-narrow` | stable | Focused single tasks |  | 28 rem | code, saved |
| Home hero | `rc-home-hero` | candidate | Fills the window under the app bar, and above the tab bar on a phone, in the dynamic viewport height (DL-128). Centred heading, one primary (start an initiative, or open the one on this device) and two signs of life: initiatives shared and funding closing soon, one per line on a phone (DL-063), with room kept for both from the start so nothing moves when the second arrives (DL-092). The italic word takes the section's accent and the website's faint copper ghost; `data-accent="initiatives"` and `data-accent="funding"` colour a word in those sections' text colours (DL-128). Parts: `rc-home-actions`, `rc-home-live`, `rc-mycelium` | Mycelium at rest under reduced motion | Short phone hero; the paper grain sits behind it, and the mycelium grows under the whole of Home, underneath its content: whole in the margins and quieter under the column of content (DL-071). A mouse or a finger grows new tufts where it moves, and one also grows on its own every few seconds, on a desk once the mouse has rested (DL-046, DL-048, DL-106, DL-128) | home |
| Doorway | `rc-doorway` | candidate | A page with nothing to fill in and no list, such as signing in to Your Initiatives with nothing on the device, or a missing page, opens like Home's hero, in the middle of the window. A Section can close its page, as Settings closes the You tab on a phone (DL-086). Parts: `rc-mycelium` | Mycelium at rest under reduced motion | Only where the page has no field or list; the paper grain sits behind it and the page's mycelium lies under the words, at the quieter strength there (DL-053, DL-071, DL-078) | signed-out |

| Card grid | `rc-card-grid` | stable | Equal-height record cards with aligned fit lines; a card that has actions keeps them at the bottom. Columns keep their width when a row is short (DL-077) | Responsive columns at least `--card-min-width`; four across on a large desktop. `data-preview`: row or rows shows whole rows only, one or two; on a phone a preview is one row that swipes sideways and rests on a card (DL-090). `data-layout="pair"`: two lists that belong together, such as needs and offers, share the row where both fit. Every card in a list answers the pointer, whether its name opens it or its buttons are the targets (DL-085) | Full width with one column on phones. A preview is one swipeable row there, running to both edges of the screen | finish, funding, home, initiatives, matches, your-initiatives |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Settings | `rc-settings` | candidate | Choices in place, one Card a group, with Leave last. A group's name and a line about it sit beside its controls on a wide screen and above them on a phone (DL-084). The list keeps a prose column and a form column's width on a large desktop, so a name stays near its controls (DL-085). Parts: `rc-settings-group`, `rc-settings-head`, `rc-settings-body` | Device and account; example deletion | No inert production controls | settings |

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

Use `rc-card-grid` for Funding, Initiatives, Your Initiatives, partner results and Home's previews. Columns fill the page with a minimum of `--card-min-width` (18 rem) and collapse to one column on phones; a large desktop holds four across (DL-077). A short row keeps its columns' width, so one card is never stretched. A preview (`data-preview`) shows whole rows only. On a phone it is one row instead: it swipes sideways, rests on a card and shows the next card at the screen's edge, and it holds every card it was given. Only the row scrolls sideways, never the page, and its loading shapes hold the same row (DL-090). Cards in a row have equal heights. A listing card has no action row, because it opens from its title; a card that has actions keeps them at the bottom. Prose keeps its own measure. See the [initiative](patterns/pages/initiatives.html) and [funding](patterns/pages/funding.html) examples.

### Card

A listing card opens from its title: a link, or a button where opening changes what is on the device, as on Your Initiatives. The title's hit area covers the whole card, so the card carries no button of its own. Nothing lifts on hover: the pointer changes and the title underlines. The focus ring goes round the whole card. A press tints the card and, unless motion is reduced, shrinks it slightly. Titles clamp to two lines and reserve both only where cards sit side by side, so the next fit line aligns across a row. A funding card leads with an Eyebrow that carries the award beside the funding icon, and shows its deadline as a clock Tag. Full award terms and dates belong in the detail. Full names stay in the accessible link and the readable detail. Independent tooltip controls remain above the card's stretched link. On a phone a list card holds only what it has (DL-090): it draws no picture placeholder, and a tag in a card that opens is a label under that link, with its explanation on the record and still reachable by keyboard. A fit line keeps its button, and so does a tag in a card that does not open.

### Filter bar

One bar holds a visibly labelled search field, the filters, then Sort, and it is the same on every list (DL-061). On a phone one Filters button, counting the choices in force, opens every filter in a sheet: each filter is a question with chips to tap, and the sheet's foot holds Clear all, an outlined button, and Show results. Wider than 37.5rem each filter has its own button, which opens a small menu of native controls. Menu buttons and Sort show the same mark at the same inset. On a wider screen Sort is one more button, reading only "Sort", that opens the same menu with one order to pick (DL-100); on a phone it is the sheet's first group, and an order other than the list's own shows as a chip that Clear filters also takes off (DL-122). Choices take effect as they are made, so Show results only closes the sheet. The choices in force show as removable chips beside Clear filters, with a live count; one value of a single choice carries its filter's name. Any chosen value within a filter keeps a record, and every filter applies at once. Support looks in needs, offers or both. An empty source shows its first-use action without filters; zero filtered results keep the controls and offer Clear filters. A long list ends in a List end and fills in as a person scrolls near it (DL-101). While a list loads, its skeleton is built from the loaded page's own parts, so nothing moves when the list arrives (DL-104). Funding cards and public project cards keep fixed rows, a skeleton holds as many cards as the view loads, and the list end has its room from the start (DL-108).

### Tooltip

Compact tiles, kind tags, work tags and fit lines use `rc-tooltip-trigger` and `rc-tooltip`. The `./overlays` module uses native `interestfor` and hint popovers where supported. Its dependency-free fallback preserves hover, focus, touch, Escape dismissal and pointer movement over the explanation. The native association supplies screen-reader text; the fallback adds `aria-describedby` and a tooltip role. Dispose the connection on unmount. Geometry is measured in the behaviour module; appearance remains in layered CSS. No polyfill is required.

### Footer

Every page has the same footer, with three short lists: Weave's pages, Data & Privacy and Regen Commons. It spans the window, with its lists inside the page's edges, and the page ends a short step above its line (DL-102). A page leaves out the link to itself, and nothing else changes on focused steps. On a phone the list of Weave's pages is not drawn where the tab bar shows, because the bar right under it says the same; a focused step has no tab bar and keeps the list (DL-093). Footer labels use title case, the one place the product does (DL-033). Data & Privacy holds three buttons that open over the current page, as a dialog on wide screens and a bottom sheet on phones, and the link to Settings. In development the example world's one label sits under the links. Until the data services and full policy exist, the frame's working information dialogs say what this version actually stores. They are not a substitute for Step 8's full record and controls.

### Work tag and media

Work tags use an icon and the hue of their type of work, as a pale tint with a same-hue word (DL-065); capital tags carry a glyph tile instead. The five types of work are Place-based, Research, Art and culture, Technology, and Learning and education. The research, culture and learning icons follow the existing sprite grid and stroke. Initiative media uses a fixed ratio; Funding has no image. Until uploads are settled (D30), Media is a placeholder that shows an icon only, is named for assistive technology where it stands for a picture, and requests no remote image. Link preview renders supplied content and a destination; it performs no external request. Step 6 adds the public-page composition and approved preview service boundary.

### App header and navigation

The logo, main content and footer share a left edge. The four sections are Home, Initiatives, Funding and Your Initiatives. The Bottom navigation on phones holds all four; on wide screens the header holds the last three, because the logo goes home, and on Home the logo is the current page (DL-049). Partners is not a section; it is reached from Your initiative. On phones every tab is a quarter of the bar. In the header each section is as wide as its words, with equal space between sections and from the logo (DL-049). On phones the fourth tab reads You, because the full name does not fit a quarter of the bar; the header keeps Your Initiatives (DL-045). The current tab has a bar in the section's accent and a stronger colour at the same weight, so no tab changes width (DL-043, DL-050). Between pages the header changes at once, so the bar never fades or slides (DL-049). Focused steps omit the section navigation. A truthful save status stays visible in three words at most, so the header never wraps on a phone, and nothing shows when nothing is saved. Signed out, the header offers Sign in, an outlined button that opens the account task. Signed in, Your Initiatives holds the account and Settings; on a phone the You tab leads there, and on a wide screen the Account button opens a small menu with Your Initiatives, Settings and Sign out (DL-070, which brings back the button DL-034 retired). The header stays at the top as the page scrolls, as a native app bar does. On a page that is not a section, the Back link takes the product name's place, on phones and wide screens alike. It names the page it returns to and steps back through history, falling back to the page's parent when the page was opened directly, and Back and Forward bring a page back where the person left it. Tapping the section you are on brings its page to the top (DL-041). The header's far end holds Sign in while signed out; the save status joins it only on the pages where the card is worked on (DL-059). A phone's bar holds nothing more: the You tab has a Settings section, with the theme, in every state of the page (DL-086), and the Bottom navigation is fixed to the bottom of the window. On a wide screen a signed-in person has the Account button, which holds Settings, and signed out Settings is in the footer (DL-070). The product name and the sections share a baseline, because they are one line of words in two sizes; the buttons and icons at the far end sit on the bar's centre line, and the last of them meets the page's edge, the gear by its glyph. The bar is the same height at every width, signed in or out. The one exception is a screen narrower than 20rem, which is a phone's page zoomed to about twice its size: there the two ends take a line each, so nothing is drawn over anything else. Section names are written as names wherever they appear, so the header, the page's title and the footer all say Your Initiatives (DL-072).

### Inline field

Pair a labelled field and button at `--control-lg-height`, allowing wrapping when needed. New pages start at the top with the heading focused after in-app navigation. Durations and easing come from tokens, with all motion stopped under reduced motion. Flow-height refinements continue with the conversation and save patterns in later steps.

## Home composition

Home has six parts, in this order: the hero, three numbered steps, eight kinds of support with a short note and a link to the eight forms of capital, the three upcoming funding deadlines that close first, recently shared initiatives, and Built by Regen Commons with one way to learn more, one way to join and the builder's name (review decisions 7 and 10, DL-037). The numbered steps explain how it goes and none is a link: the hero's action starts it. Do not promise working speech, attachments or saving before those features exist. The hero keeps one primary. With a card on this device it is the resume action, nothing sits beside it, and the hero's words give the card's name and where it stands. With no card it is Start an initiative, with opening a saved one beside it; the two swap emphasis for a signed-in person who keeps initiatives elsewhere. No Status line sits above the hero, which replaces that part of DL-032.

The mycelium is a decorative canvas behind every page, drawn as the website draws it (DL-071, DL-078, DL-106). Behind a page it is fixed to the window (`data-extent="page"`) and the page scrolls over it; the page body clips it, so no thread lies behind the banner, the bars or the footer. It holds one canvas pixel for each CSS pixel, so a phone's or a sharp screen's own scaling softens and widens its lines. A card, a field or a button covers the threads that pass under it; an outlined button on the page takes the page's fill there, so none shows through it. Words set on the page itself have threads behind them, so the light resting network shows whole only in the page's margins and at 45 percent of that strength beneath the column of content, the element after the canvas. New growth leaves trails that are bright wherever they grow and linger, fading out over several seconds, slower than the website's: a mouse or a finger grows them where it moves, and one also grows on its own every few seconds, on a desk once the mouse has rested (DL-128). The resting network is as close together on a desk as on a phone. It uses the website's depth 1 on Home and depth 2 on every other page. Under reduced motion the resting network is drawn once and nothing more grows; forced colours hide it. It is hidden from assistive technology and takes no pointer, and it stops drawing once the last trail has faded, while the page is hidden and while it is off screen.

Support cards use Living, Material, Intellectual, Experiential, Social, Financial, Cultural and Spiritual as titles, with the plain meaning beneath and examples in a tooltip. Compact tags keep the same title and explain the meaning in help (DL-026, revisiting DL-014).

Recently shared uses the supplied sharing date, not last confirmation. Upcoming funding excludes past, unknown and rolling deadlines, shows days left and the full date, and keeps the earliest three. A closing date alone is not eligibility. Fixtures name their reference date; no sample count or sample record appears in production. Loading, empty, partial, offline and error states keep the hero, steps and kinds usable.

## Describe and review contracts

Describe is one page (DL-110). Voice input, as Talk It Out, leads: its button becomes Stop in place while the browser listens on the device, the words appear in its box, and Stop fills the fields under it in place: the name, where they work and what they do. The page says those three things are what to say, and the box's hint shows one example in that shape (DL-127). Typing a few sentences in the same box and pressing Fill In The Fields does the same, and the line under it names the fields it filled and asks by name for a name or a place the words did not give. The four fields stay visible and editable throughout, and fill the step's column. A field Weave filled is an Input in pencil with the hint "From what you said." until the person changes it, and a fill never writes over a field the person typed or changed. One Continue keeps the card and goes on to needs and offers; there is no separate page to check the card. On a phone each step's way forward is in the Dock (DL-089); on a wide screen it is in the Step bar, beside the steps (DL-127). A problem it raises about a field is written at that field, which takes the focus.

The describe step shows no suggested details (DL-127). What the words give goes into the three fields, and a card that kept a stage, a type of work, themes, who it serves or languages earlier keeps them.

Where the browser can set up speech on the device first, Set Up Speech On This Device sits in the button's place, as a secondary action, and asks the browser, from the tap, to install its own speech pack; Weave downloads nothing itself (DL-076). Where the browser has no speech on the device but has its own speech service, Talk It Out uses that service once the person agrees to a notice that the browser sends their voice to it (DL-115); the line beside the button says so before the agreement and while it listens, and Settings withdraws the agreement. Where the browser has no speech recognition at all, one plain line says so in the button's place, or on a touch screen points to the keyboard's microphone key, and the typed path is unchanged. The speaking language is chosen in a dialog.

Nothing on the step moves when it is pressed (DL-113). The box and About it keep the height of their rows. The result of a fill and the note about added files are written in a Status slot, and a problem with a field in that field's own hint line. Add Files sits beside Fill In The Fields and opens the file picker directly. A file is read on the device as soon as it is added, for the same three fields, and each file's line says what the reading made of it; name files that were retained but not read. No remote link fetch is implied, and a link is filled in only when the person gave one.

Structuring runs on the device: the keyword rules, then the browser's built-in model where it is already there. Use the Card preview beside the fields on a wide screen; it shows the fields as they read and the details the person kept. Start new routes at the heading and stop all motion under reduced motion. Cloud consent is a native dialog. Production hides unavailable service actions. App-managed download and cloud states may be shown only as labelled, in-memory fixtures until D32 and D35 permit adapters. The browser's own speech setup is not one of them. The example page for Check your card stays in the library for the Proposal and Review sheet patterns it shows; the app no longer has that page.

## Needs, offers and finish contracts

Needs and offers are one page with two Ask lists, side by side on wide screens and stacked on a phone (DL-032). Each list starts with Voice input: Talk It Out, one box for words said or typed, and Add To List, which reads them into up to four cards on the device (DL-110, DL-111). A card's title is the person's words, and kinds of support are suggested from them. Ask card shows the kinds as chips, each with its remove, and has Change Details and Remove. Change Details opens the editor in a dialog, where all eight kinds are offered and a description takes up to 200 characters, so nothing opens inside the list (DL-113). Every applicable kind has the same treatment. A dashed card or chip is a suggestion until the page's one Continue keeps it, so the card has no Keep of its own. A removed card has Undo, which restores its previous state and cannot exceed the four-card limit. Names and raw unfinished fields remain editable and survive reload.

Ask list shows the active count out of four, and the list's Status slot says when more were heard than fit. A list saved with five under the earlier limit shows all five and takes no more. Full source words and file bytes remain available. Kept corrections and removed source chunks are pinned across reading again. An entry can have no kind of support on the device. Sharing, publishing and the live private save each need one, and say so before the tap. Currency is never guessed. Place scope and terms start as reviewable Anywhere and Open to anything defaults. Open to anything is exclusive of the other terms.

Needs carry timeframe, urgency and purpose; offers carry capacity and audience. Both carry status. These are local draft cards, not published commitments. Continue keeps both lists together or changes neither. It stops on an open editor or on words still in a box, and says where in that list's Status slot. An empty list can continue. Where speech needs setting up, the page offers it once, in the list the route opened unless that list is full, and both lists get Talk It Out when it is ready. Where the browser can only use its own speech service, both lists get Talk It Out, and the agreement asked for in one counts for both. Where the browser has no speech recognition, the same list says so once. Words whose reading fails go back into the box. After this step the last page keeps the Stepper until the card is saved, and has Back To Needs And Offers (DL-113).

Finish became Your initiative, the page a person comes back to (see the contracts below). The card comes first: the checked initiative with its kept needs and offers. Each action then has its own row, and first funding and partners follow. Partner suggestions wait for a linked Certified project. Unknown live counts stay unknown. Funding feeds, partner matching and the live sharing adapter follow in later steps; development examples are labelled and excluded from production.

## Funding and team slots contracts

Funding uses the existing catalog's thematic fit, readiness, research-priority groups and sourced reasons without changing its rubric. Fit is a word and bar, never a numeric promise. Unknown fit remains unassessed. Visitors can browse the whole catalog without invented ranking. Program links preserve the fund and program identities. Closed cycles, unverified offers and funding resources stay distinct and searchable. Source dates, unknowns and official links remain visible.

An opportunity opens as a detail sheet over the list. It has one link out, Open the funder's page, and one primary that follows the person's state: Describe your initiative until a card is described, then the funder's page. A change to the filters rewrites the address without adding a history entry, and it moves neither focus nor scroll. Suggest a fund is a development example: it keeps the suggestion in page memory, asks for no contact details and sends nothing. Production needs an endpoint that validates the link, and a review queue (DL-036).

Team slots is an organism for a fund's partner requirements. Parts are `rc-team-slots`, `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate` and `rc-team-coverage`. Card summaries use `rc-team-line`. Private initiatives see counts only. Shared examples expose labelled native checkboxes and reasons. Coverage counts distinct requirements and distinct selected initiatives; one initiative can meet several asks and is requested once. Coverage never changes the solo rubric or approves eligibility. D29 keeps requirements and team fit as labelled development examples; production does not invent requirements or counts. Email reminders and introductions wait for Step 7.

## Contextual account and email tasks

Dialog has three presentations: information explains, a task asks for one decision, and
detail holds a whole record over its list. Each is a native modal, centred on wide
screens. On phones it is a full-width bottom sheet that rises from the bottom edge and
follows a drag on its handle, or on its content where that is at its top; content that is
scrolled, a finger going up or sideways and a finger on a field keep their own gesture, and
a press that wobbles is still a press. Where the on-screen keyboard covers the bottom of
the window the sheet stands on it and fits in what is left, with the field being typed in
kept in view (DL-091). A press outside closes every dialog, a task included; a task whose
work is under way stays open and says why (DL-082). Leaving reverses the motion with a
bounded wait, and with reduced motion the sheet
appears and leaves at once. The `./sheet` module supplies this behaviour, and a
component disposes its connection when it unmounts. Close is visible at the top; Escape
closes the dialog and the browser returns focus. Forms remain native. Dialog scroll
stays contained where the platform supports it. Unsolicited save offers remain inline,
as the Status line's own action.

An opportunity and a public initiative open as a detail sheet over their list. The
address changes with the sheet, so Back closes it and Forward reopens it. The list keeps
its scroll, and focus returns to the card that opened the sheet. An address opened
directly shows the record over its list (DL-035).

The live private flow reuses the same account panel in the sheet, Your initiative and
Settings. Each instance has unique labels. Signing in alone never overwrites or uploads
a device draft; saved cards are listed before Save or Load is chosen. The
development-only example in `src/social` demonstrates the Certified door, the project
link, the team workspace, sharing for matching, publishing, a specific fund reminder and
saved leads. Its actions send nothing and change no production permissions. No live
sharing or delivery is implied.

## Your initiative, Keep card and Certified contracts

The card is the object people come back to. Your initiative shows the card first, then
one Status line row per action: where the card is kept and who can open it there, with
Save; the team workspace of a linked group project; sharing for matching; and
publishing. One row carries the primary at a time: save first, then the workspace
request, then sharing. A row has no icon: the words carry the state. Settings shows the
same sentence with a way to open the card, and Home's hero says it in its own words for
anyone with a card. A row for a service that is not built does not appear.

Check your card, a page that left the app with DL-110 and stays in the library as an
example, is one form: the four public fields in ink, then the derived details as
chips. A dashed chip is pencil. Tapping a chip opens one Proposal editor with Keep
changes, Remove and Cancel, and a detail without a value is an Add chip. One Keep card
confirms every pencil detail that holds a value (T5); removed details stay removed and
keep Undo on their chip.

Signing in only identifies the person, and saves nothing (DL-032). Save is its own tap,
and its note says where the card goes and who can see it there before the tap: private
saves, or the team workspace of a linked group project once that workspace is open. In
development the door is the Certified example in `src/social`: an offer, one trip to an
example of Certified's sign-in page, straight back. The live account section signs in
with Certified too, and keeps the optional email as a closed disclosure.

A Certified project is linked or created as its own step, in the task dialog, and the
step shows what changes first. Linking brings the name, place, description and links
from Certified. Creating a project reuses the checked card and starts it in a group with
one owner. Linking a project whose workspace is open, or creating one, moves an existing
private save into that team workspace, and the step says so before the tap. A workspace
that opens later waits for Save to team workspace. A group project without a workspace
lets a verified member ask for setup and keep working privately until a Certified admin
or owner approves.

Share for matching and Publish on Certified are two reviews in the same task dialog. A
row that waits on an earlier step names that step and offers it. Each review lists the
needs and offers as checkboxes, ticked to begin with so a person can untick any to keep
private, says who will see them, and opens the exact fields under See exactly what they
see. A first publish starts from what is already shared. Sharing reaches people signed
in for 90 days, with the end date shown. Publishing puts listings under the project, for
anyone to read. A failure changes nothing and says so. Withdrawal is asked for, and its
row says so until Certified confirms. A change never goes out on its own: the earlier
shared version leaves matching, an earlier listing is withdrawn, and the changes stay
private until the person shares or publishes again. While a share waits on its changes,
partner suggestions come from public sources only.

Your Initiatives is the fourth section and holds the account. Signed out, it offers Sign
in with Certified and says what Certified is. Signed in, it shows the handle, Sign out
and Settings, and lists what the person can open: the card on this device, private saves
and Certified projects with their group, role and workspace state. Each card opens from
its name. The project list is a development example until Weave can read projects.
Opening a project with a team workspace opens that workspace. Opening one without brings
its four details from Certified and goes on to needs and offers. Opening another
initiative backs up the device card first.

## Your initiative, Keep card and Certified contracts

The card is the object people come back to, and its state reads in one line: not saved
yet, saved (only you), shared with people signed in, or on Certified (anyone). The
Status line molecule carries that sentence and the one thing to do about it next: Keep
it, Who can see it, Add to Certified or Update on Certified. It appears on Your
initiative, as a strip above the Home hero for anyone with a card, and in Settings.
Partners open only after sharing.

Check your card, a page that left the app with DL-110 and stays in the library as an
example, is one form: the four public fields in ink, then the derived details as
chips. A dashed chip is pencil. Tapping a chip opens one Proposal editor with Keep
changes, Remove and Cancel, and a detail without a value is an Add chip. One Keep card
confirms every pencil detail that holds a value (T5); removed details stay removed and
keep Undo on their chip.

Keep it opens the one account door. In development the door is the Certified example in
`src/social`: an offer, one trip to an example of Certified's sign-in page, straight
back, and the card saves on return because the person asked to keep it. Signing in
alone saves nothing, and no email is asked for. Production keeps the email code door
until its replacement is confirmed (DL-031).

Who can see it is one ladder: Only you, People signed in (chosen needs and offers in
their partner matches, for 90 days, with the end date shown) and Anyone. Anyone opens
the Add to Certified sheet in the same task dialog: the four fields exactly as the card
has them with one Change, needs and offers as opt-in checkboxes with none chosen, a line
on what stays in Weave, Continue on Certified, Not now, and the sentence "You confirm on
Certified. Nothing is published until you do." The example Certified page confirms or
refuses; a refusal reads "Certified did not confirm the record. Nothing was published."
and changes nothing. Lowering the audience from Anyone removes the record and says so
first; Remove from Certified also sits in Settings under Leave.

Your Initiatives lists what a signed-in person can open: the card on this device, saved
Weave cards and Certified records. Opening a record brings its four fields in ink under
a source line, with the derived details still to add, and the card reads "On Certified"
from then on. Opening another initiative backs up the device card first.

## Public initiatives and partner contracts

The [Initiatives example](patterns/pages/initiatives.html#public-example) composes
Media, Step layout, Card list, read-only Ask cards, Work tags and supplied Link
previews. Public asks show all applicable kinds equally and carry no editing or
commitment controls. A missing link or ask has a plain empty state. Previews never
fetch a destination or imply that its owner supplied a photo.

Partners is not a section. It is reached from Your initiative, and its Back link returns
there. With no card, Partners and Funding show the same single prompt to describe an
initiative: a Notice with one primary. Partners uses the Share card as the gate until a
Certified project is linked: it says what opens partner suggestions and offers that
step. Signing in alone never opens partner cards. A linked initiative sees fits from
public sources, matched on the device, while its entries stay private. Searching what
other teams shared also needs one shared, open need or offer. Results come in two
groups: direct fits, where they have said they offer or need this, and possible fits,
where their public work suggests a fit and they have not offered or asked. Each result
leads with how strong the fit is, as a word and a bar, then says why in one-sentence reasons:
which way it runs with the person's own need or offer named, that it goes both ways where it
does, and the words both sides share. The other side's own words follow, then what still
needs checking and what the result rests on (DL-064). There are no introductions; a
person can save a lead and open its source. Unknown counts stay unknown. The independent
public directory remains browsable. Live sharing, matching and publishing require their
service contracts and D26, D28, D30 and D31 decisions. Development examples never
publish a private initiative.

## Settings and data contracts

Settings groups Your initiative, Account, Assistant, Appearance, Install Weave on your
phone and Your data in place. The install guide shows only what the device in hand needs
(DL-067): one Install button where the browser offers it, two numbered steps with the
signs to look for on an iPhone or an Android phone, a way out of an app's own browser,
and on a computer a code to scan, because Weave installs on a phone. Leave comes last, with sign-out and deletion set apart;
the example world hides it while nobody is signed in. Settings is reached from the
Settings section of the You tab on a phone (DL-086), from the account's menu on a wide screen, from Your Initiatives and from the footer, and its Back link returns to Your Initiatives. Membership
stays in the footer. Unconnected server controls appear only as labelled development
examples; production explains what service is missing.

Record list is a molecule for the assistant's metadata: step, local engine, model,
date, status and counts read or sent. It never includes the person's words. Its
metadata download uses an explicit field list. What we store opens as five concise
facts, with a separate full policy in the same native pop-up. Both work offline.

Download device data captures the current visible draft, source words, unfinished
edits, original file bytes and local backups. It names its device scope and never
claims to export unrequested server cards. A failed file read rejects the download
without changing the draft. Account deletion and a complete account export require
their own authorized server adapters; the example deletion never calls them.

Device backups sit under Your data, so they stay in reach after the draft is removed.
Each backup restores, or is deleted after a confirmation that names it, its shown
time and its attached files. Remove this draft from this device keeps the draft as a
backup first. Both compare the stored draft before removing it, and the result line
says what was removed and how many backups stayed. Your Initiatives deletes one
private save at a time through a dialog, because a listing card carries no button.
