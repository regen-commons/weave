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
| Heading | `rc-heading` | stable | Page and section titles | `data-size`: hero, page, section | Three lines at most on a phone | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Eyebrow | `rc-eyebrow` | stable | Factual label only when no heading can carry the fact, such as the award on a funding card; never decorative | Optional icon | Sentence case, one short fact | funding, home, matches |
| Prose | `rc-prose` | stable | Reading text at a comfortable measure |  | Paragraphs of four lines or fewer | funding, home, initiatives |
| Meta | `rc-meta` | stable | Small supporting text |  |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Icon | `rc-icon` | stable | Inline icon from `brand/icons.svg` | `data-size`: sm, lg | Never the only name of a control | code, finish, funding, home, initiatives, matches, matches-empty, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Logo | `rc-logo` | stable | Mark and product name. Returns home. Part: `rc-logo-mark` |  | A page that is not a section shows the Back link in its place | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, saved, step-needs, your-initiatives |
| Button | `rc-button` | stable | Starts an action | `data-variant`: primary, secondary, quiet, danger. `data-size`: sm, lg. `data-width`: full. `aria-busy`, `disabled` | Label under five words. One primary per region | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Icon button | `rc-icon-button` | stable | An action with a widely known icon, such as close |  | Requires `aria-label` |  |
| Input | `rc-input` | stable | Text, select and text area | `data-kind`: code. `aria-invalid`, `disabled` | Always inside a Field | check-card, code, describe, finish, funding, home, initiatives, intake-finish, needs, offers, settings, step-needs |
| Check | `rc-check` | stable | Native checkbox and radio |  |  | funding, initiatives, needs, offers, opportunity, saved |
| Switch | `rc-switch` | stable | A setting that applies at once | `role="switch"` | Never pre-checked for email |  |
| Chip | `rc-chip` | stable | A choice you tap. Part: `rc-chip-remove` | Selectable, removable, `data-pencil` for a suggested value that opens change or remove | 44 px high |  |
| Tag | `rc-tag` | stable | A label you read | Plain, with an icon, `data-capital`, `data-kind`: work, `data-tone` for the icon's colour | Three words | funding, home, initiatives, needs, offers, step-needs |
| Tile | `rc-tile` | stable | Glyph for a form of capital | `data-state`: suggested, empty | Two letters | home, needs, offers, step-needs |
| Stage | `rc-stage` | stable | Stage of growth, with icon and plain word | `data-stage`: seed, sprout, flowering, tree |  | finish, matches, step-needs |
| Fit | `rc-fit` | stable | Strength of a match as a word and bar. Part: `rc-fit-bar` | `data-level`: strong, good, possible | Never a number | finish, funding, initiatives, matches |
| Timestamp | `rc-time` | stable | When a record was shared or last confirmed | `data-stale` | Stale after 180 days | finish, home, matches |
| Spinner | `rc-spinner` | stable | Short waits, inside a button |  |  |  |
| Skeleton | `rc-skeleton` | stable | Space held for content that is loading |  |  |  |
| Surface | `rc-surface` | stable | A plain raised or tinted panel | `data-level`: raised, tint |  |  |
| Skip link | `rc-skip-link` | stable | First stop for keyboard users |  | On every page | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Visually hidden | `rc-visually-hidden` | stable | Text only for assistive technology |  |  | opportunity, opportunity-private, settings, step-needs |

| Media | `rc-media` | stable | Supplied image, or a placeholder that shows an icon only and is named for assistive technology where it stands for a picture; fixed aspect ratio | `data-size`: thumb, wide | No third-party app images until D30 | funding, home, initiatives |
| Account button | `rc-account` | deprecated | Opened Settings from the header. Your initiatives holds the account now, so the header has no account button (DL-034) |  | Use the Your initiatives section instead; leaves after one build phase | library only |

## Molecules

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Form | `rc-form` | stable | Stacks fields at the right rhythm |  | 28 rem wide | check-card, code, finish, needs, offers, saved |
| Field | `rc-field` | stable | Label, hint, control, error. Parts: `rc-hint`, `rc-error` |  | Label always visible | check-card, code, describe, finish, funding, home, initiatives, intake-finish, needs, offers, settings |
| Composer | `rc-composer` | stable | The box a person writes in. Part: `rc-composer-actions` | Speak and Attach when working |  | describe, needs, offers, step-needs |
| Proposal | `rc-proposal` | stable | A suggested value awaiting confirmation. Parts: `rc-proposal-source`, `rc-proposal-value` | `data-state`: confirmed | Value under 12 words | check-card, needs, offers, step-needs |
| Choice group | `rc-choice-group` | candidate | Selectable cards for a short vocabulary. Parts: `rc-choice`, `rc-choice-text`, `rc-choice-title`, `rc-choice-note` | Radio or checkbox | Five options for radios | saved |
| Stepper | `rc-stepper` | stable | Where you are in a short sequence. Part: `rc-stepper-mark` | `aria-current`, `data-state`: done | Three to five steps, all on one row on a phone | check-card, describe, step-needs |
| Reason | `rc-reasons` | stable | Why something appears for you. Part: `rc-reason` |  | Three lines of one sentence | finish, matches |
| Card | `rc-card` | stable | One record, opened from its title: a link, or a button where opening changes what is on the device. Parts: `rc-card-header`, `rc-card-title`, `rc-card-meta`, `rc-card-summary`, `rc-draft-preview`, `rc-draft-status` | `data-stage`, `data-kind`: need, offer. `data-pencil`, `data-layout`: listing | No button on a listing card. Listing titles clamp to two lines and reserve both only side by side; summaries three lines | check-card, describe, finish, funding, home, initiatives, intake-finish, matches, needs, offers, step-needs, your-initiatives |
| Tag list | `rc-tag-list` | stable | A row of tags |  |  | funding, home, initiatives, needs, offers, step-needs |
| Tile list | `rc-tile-list` | candidate | A row of tiles with each state in words |  | Eight tiles | step-needs |
| Record | `rc-record` | candidate | What is known, with room for what is missing | `data-empty` on a value |  | step-needs |
| Stamp | `rc-stamp` | stable | Last confirmed, and a way to confirm again |  |  | finish, matches |
| Notice | `rc-notice` | candidate | A message in the flow of the page. Parts: `rc-notice-body`, `rc-notice-title` | `data-tone`: success, info, warning, danger | Two sentences. A notice that asks one question carries its own action bar, as the duplicate prompt does | saved |
| Message | `rc-message` | stable | One turn of conversation | `data-from`: assistant, person |  | describe, needs, offers, step-needs |
| Tabs | `rc-tabs` | deprecated | Sibling views only; Partners and Funding use separate pages | `aria-current` | Three tabs on a phone, with counts |  |
| Action bar | `rc-action-bar` | stable | The things you can do with a record |  | One primary | check-card, describe, finish, home, matches, needs, offers, saved, settings, step-needs, your-initiatives |
| Progress | `rc-progress` | candidate | A long task, with a way to stop |  |  |  |
| Save status | `rc-save-status` | stable | Says where the work lives | `data-state`: device, account | Visible through the intake | check-card, code, describe, finish, funding, initiatives, intake-finish, matches, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Status line | `rc-status-line` | candidate | One plain sentence on where the work stands, beside the one thing to do about it next. The words carry the state, so the row has no icon. Composes Save status and Action bar | On this device, saved, shared, published, withdrawal asked for | One sentence and one action a row; one primary across the rows | settings |
| Search | `rc-search` | candidate | A box, a button and the word Search |  | No scope menu before results | home |
| Breadcrumbs | `rc-breadcrumbs` | candidate | A place inside its larger places |  |  |  |
| Back link | `rc-back` | stable | The one way back on a page that is not a section, at the start of the app header in place of the product name. It names the page it returns to. Part: `rc-back-link` |  | One a page; a long name gives way to the header | opportunity, opportunity-private, settings |
| Facts | `rc-facts` | stable | Plain terms for consent and privacy |  |  | describe, opportunity, opportunity-private, settings |
| Empty state | `rc-empty` | candidate | A first screen with one thing to do. Part: `rc-empty-title` |  | One action, no filters | matches-empty |

| Tooltip | `rc-tooltip` | stable | Explains a compact sign. Parts: `rc-tooltip-wrap`, `rc-tooltip-trigger` | Native interest and hint, local fallback | Hoverable, dismissible with Escape, same words for screen readers | funding, home, initiatives, needs, offers, step-needs |
| Inline field | `rc-inline-field` | stable | A field and action at the same large height | Wraps on phones | Use inside a labelled Field | funding, home, initiatives |
| Link preview | `rc-link-preview` | stable | Supplied external link, title and preview. Part: `rc-link-preview-text` | Optional Media thumbnail | Never fetch from the browser; no preview service yet | funding, initiatives |

| Section | `rc-section` | stable | Groups a heading, an optional browse action, an optional note and content. Parts: `rc-section-head`, `rc-section-note` | | Heading with one supporting line at most | home, intake-finish, your-initiatives |
| Tile card | `rc-tile-card` | candidate | Glyph, framework title and plain meaning. Parts: `rc-tile-card-title`, `rc-tile-card-meaning` | `data-capital` | One tooltip trigger; meaning stays visible | home |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Conversation | `rc-conversation` | stable | Ordered, editable turns. Parts: `rc-conversation-turn`, `rc-conversation-label` | `data-from`: assistant, person | One question at a time; fixed questions are the labelled D36 default | describe, needs, offers |
| Attachment list | `rc-attachment-list` | candidate | Local file and link references. Part: `rc-attachment` | | State what was read; never imply an unread PDF was parsed | describe |
| Voice input | `rc-voice-input` | stable | Large local-speech action and editable result. Leads the describe step and each ask list where the device can transcribe speech. Part: `rc-voice-transcript` | Listening, unavailable, error | Only show Speak when local processing is available | describe, needs, offers |

| Ask card | `rc-ask-card` | stable | One need or offer in pencil or ink. Parts: `rc-ask-title`, `rc-ask-terms`, `rc-ask-foot`, `rc-ask-editor`, `rc-ask-summary` | Card `data-kind`, `data-pencil`; removed with Undo | All eight kinds alike; kinds as chips, More details, Remove; the page's Continue keeps a suggestion; raw edits survive reload | initiatives, needs, offers |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Record list | `rc-record-list` | candidate | Assistant metadata only. Parts: `rc-record-row`, `rc-record-text`, `rc-record-title` | Empty and populated; local, failed and cancelled | Never source text or credentials | settings |

## Organisms

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Team slots | `rc-team-slots` | stable | Requirements with counts or candidates. Parts: `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate`, `rc-team-coverage`, `rc-team-line` | Private counts, shared examples, no requirement | Distinct asks and selected initiatives; never eligibility | opportunity, opportunity-private |
| Ask list | `rc-ask-list` | stable | Needs or offers, with one field to add to the list. Parts: `rc-ask-head`, `rc-ask-count` | Empty, working, overflow, offline, error | Five active cards; say when more were heard | initiatives, needs, offers |
| Share card | `rc-share-card` | candidate | The gate before partner suggestions: says what opens them and offers that step | Before a project is linked | One next step and one way to browse; on the initiative page the saving and sharing section carries the step, so the card keeps only the way to browse; never invent a production count | intake-finish |

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| App header | `rc-app-header` | stable | Product name, four sections, honest save status, and Sign in while signed out. Stays at the top as the page scrolls; on a page that is not a section, the Back link takes the product name's place. Parts: `rc-app-nav`, `rc-app-header-state` | Form pages drop the sections |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Bottom navigation | `rc-bottom-nav` | stable | Sections on phones |  | Four equal items, icon and small word. Tapping the current one brings its page to the top | finish, funding, home, initiatives, matches, matches-empty, saved, settings, your-initiatives |
| Guide panel | `rc-guide` | stable | The conversation for one step. Parts: `rc-guide-log`, `rc-guide-status`, `rc-conversation-panel` |  |  | describe, needs, offers, step-needs |
| Review sheet | `rc-review` | stable | Suggestions waiting for you. Part: `rc-review-list`, `rc-review-grid` |  |  | check-card, step-needs |
| Code panel | `rc-code-panel` | stable | Save or sign in by email code. Parts: `rc-code-panel-title`, `rc-code-panel-actions` | Email step, code step, error | One field per step; inline offer or explicitly opened task | code, finish |
| Card list | `rc-card-list` | stable | A counted list of cards. Parts: `rc-card-list-header`, `rc-card-list-items` |  |  | finish, initiatives, matches |
| Dialog | `rc-dialog` | stable | Information, one-decision tasks and record detail; a bottom sheet on phones. Parts: `rc-dialog-grip`, `rc-dialog-body`, `rc-dialog-head`, `rc-dialog-title` | `data-presentation`: information, task, detail | No unsolicited modal or wall. A press outside never closes a task | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Data table | `rc-table` | candidate | Desk lists and the record of assistant use. Part: `rc-table-scroll` | `data-align`: end |  |  |

| Filter bar | `rc-filter-bar` | stable | Search, filter menus, sort, removable chips and count. Parts: `rc-filter-controls`, `rc-active-filters` | Shared by Partners, Funding, Initiatives | OR within a filter; AND between filters | funding, initiatives |
| Menu | `rc-menu` | stable | Native controls in a popover. Parts: `rc-menu-group`, `rc-menu-option` | Local fallback without Popover API | Named fieldset, visible close action, Escape and outside dismissal | funding, initiatives |
| Footer | `rc-footer` | stable | Weave, Data & Privacy and Regen Commons links. Parts: `rc-footer-grid`, `rc-footer-title`, `rc-footer-link` |  | Every page, the same; a page leaves out the link to itself; title case labels (DL-033) | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |

| Numbered list | `rc-numbered-list` | candidate | Three ordered cards that explain how something goes. Parts: `rc-numbered-item`, `rc-numbered-number`, `rc-numbered-title` |  | No card is a link; the page's own action starts the sequence | home |
| Tile grid | `rc-tile-grid` | candidate | Equal-size Tile cards with tooltips | | Eight forms of capital | home |

## Templates

| Pattern | Class | Status | Job and parts | Variants | Limits | Used in |
|---|---|---|---|---|---|---|
| Page shell | `rc-page` | stable | Header, main, footer and navigation. Parts: `rc-main`, `rc-stack` | `data-move="return"` on `rc-main` when Back or Forward reached the page, which then shows as it was left without arriving again |  | check-card, code, describe, finish, funding, home, initiatives, intake-finish, matches, matches-empty, needs, offers, opportunity, opportunity-private, saved, settings, step-needs, your-initiatives |
| Site banner | `rc-site-banner` | candidate | A full-width site announcement above the header |  | One short message | home |
| Step layout | `rc-step-layout` | stable | One column, then a sticky side panel. Parts: `rc-step-main`, `rc-step-aside` |  |  | check-card, describe, finish, initiatives, intake-finish, needs, offers, opportunity, opportunity-private, step-needs |
| List layout | `rc-list-layout` | stable | Full-width list with its own prose measure |  | Card grid columns at least 18 rem | funding, initiatives, matches, matches-empty, your-initiatives |
| Narrow layout | `rc-narrow` | stable | Focused single tasks |  | 28 rem | code, saved, settings |
| Home hero | `rc-home-hero` | candidate | Centred heading, one primary (start an initiative, or open the one on this device), search and one sign of life. Parts: `rc-home-actions`, `rc-home-live`, `rc-woven-backdrop` | Still backdrop under reduced motion | Short phone hero with a full-width woven backdrop | home |

| Card grid | `rc-card-grid` | stable | Equal-height record cards with aligned fit lines; a card that has actions keeps them at the bottom | Responsive columns at least `--card-min-width` | Full width with one column on phones | finish, funding, home, initiatives, matches, your-initiatives |

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

Use `rc-card-grid` for Funding, Initiatives, Your initiatives, partner results and Home's previews. Columns fill the page with a minimum of `--card-min-width` (18 rem) and collapse to one column on phones. Cards in a row have equal heights. A listing card has no action row, because it opens from its title; a card that has actions keeps them at the bottom. Prose keeps its own measure. See the [initiative](patterns/pages/initiatives.html) and [funding](patterns/pages/funding.html) examples.

### Card

A listing card opens from its title: a link, or a button where opening changes what is on the device, as on Your initiatives. The title's hit area covers the whole card, so the card carries no button of its own. Nothing lifts on hover: the pointer changes and the title underlines. The focus ring goes round the whole card. A press tints the card and, unless motion is reduced, shrinks it slightly. Titles clamp to two lines and reserve both only where cards sit side by side, so the next fit line aligns across a row. A funding card leads with an Eyebrow that carries the award beside the funding icon, and shows its deadline as a clock Tag. Full award terms and dates belong in the detail. Full names stay in the accessible link and the readable detail. Independent tooltip controls remain above the card's stretched link.

### Filter bar

One bar contains a visibly labelled search field and Search button, filter buttons opening small native-control menus, then sort. Menu triggers show a chevron. Funding uses `data-layout="inline"` to keep the sort label and native select together as the controls wrap. Active selections have individually removable chips and a live result count. Multiple choices within a filter use OR; different filters use AND. Support searches needs, offers or both. Partners can add the two relationship directions once an initiative exists. An empty source shows its first-use action without filters; zero filtered results retain the controls and offer Clear filters.

### Tooltip

Compact tiles, kind tags, work tags and fit lines use `rc-tooltip-trigger` and `rc-tooltip`. The `./overlays` module uses native `interestfor` and hint popovers where supported. Its dependency-free fallback preserves hover, focus, touch, Escape dismissal and pointer movement over the explanation. The native association supplies screen-reader text; the fallback adds `aria-describedby` and a tooltip role. Dispose the connection on unmount. Geometry is measured in the behaviour module; appearance remains in layered CSS. No polyfill is required.

### Footer

Every page has the same footer, with three short lists: Weave's pages, Data & Privacy and Regen Commons. A page leaves out the link to itself, and nothing else changes on focused steps. Footer labels use title case, the one place the product does (DL-033). Data & Privacy holds three buttons that open over the current page, as a dialog on wide screens and a bottom sheet on phones, and the link to Settings. In development the example world's one label sits under the links. Until the data services and full policy exist, the frame's working information dialogs say what this version actually stores. They are not a substitute for Step 8's full record and controls.

### Work tag and media

Work tags use an icon and outline, apart from filled theme tags and capital tiles. The five types of work are Place-based, Research, Art and culture, Technology, and Learning and education. The research, culture and learning icons follow the existing sprite grid and stroke. Initiative media uses a fixed ratio; Funding has no image. Until uploads are settled (D30), Media is a placeholder that shows an icon only, is named for assistive technology where it stands for a picture, and requests no remote image. Link preview renders supplied content and a destination; it performs no external request. Step 6 adds the public-page composition and approved preview service boundary.

### App header and navigation

The logo, main content and footer share a left edge. The four sections are Home, Initiatives, Funding and Your initiatives: in the header on wide screens and in the Bottom navigation on phones. Partners is not a section; it is reached from Your initiative. Every tab is the same width: a quarter of the bar on phones, and as wide as the widest in the header. The current tab has a bar and a stronger colour at the same weight, so no tab changes width (DL-043). Focused steps omit the section navigation. A truthful save status stays visible in three words at most, so the header never wraps on a phone, and nothing shows when nothing is saved. Signed out, the header offers Sign in, which opens the account task. Signed in, Your initiatives holds the account and Settings, so the header has no account button (DL-034). The header stays at the top as the page scrolls, as a native app bar does. On a page that is not a section, the Back link takes the product name's place, on phones and wide screens alike. It names the page it returns to and steps back through history, falling back to the page's parent when the page was opened directly, and Back and Forward bring a page back where the person left it. Tapping the section you are on brings its page to the top (DL-041).

### Inline field

Pair a labelled field and button at `--control-lg-height`, allowing wrapping when needed. New pages start at the top with the heading focused after in-app navigation. Durations and easing come from tokens, with all motion stopped under reduced motion. Flow-height refinements continue with the conversation and save patterns in later steps.

## Home composition

Home has six parts, in this order: the hero, three numbered steps, eight kinds of support with a short note and a link to the eight forms of capital, the three upcoming funding deadlines that close first, recently shared initiatives, and Built by Regen Commons with one way to learn more, one way to join and the builder's name (review decisions 7 and 10, DL-037). The numbered steps explain how it goes and none is a link: the hero's action starts it. Do not promise working speech, attachments or saving before those features exist. The hero keeps one primary. With a card on this device it is the resume action, nothing sits beside it, and the hero's words give the card's name and where it stands. With no card it is Start an initiative, with opening a saved one beside it; the two swap emphasis for a signed-in person who keeps initiatives elsewhere. No Status line sits above the hero, which replaces that part of DL-032.

The hero's decorative SVG threads inherit capital colour tokens and move slowly using duration and easing tokens. Under reduced motion the same weave stays still; forced colours hide it. It is hidden from assistive technology and cannot intercept a tap. There is no canvas loop or animation script.

Support cards use Living, Material, Intellectual, Experiential, Social, Financial, Cultural and Spiritual as titles, with the plain meaning beneath and examples in a tooltip. Compact tags keep the same title and explain the meaning in help (DL-026, revisiting DL-014).

Recently shared uses the supplied sharing date, not last confirmation. Upcoming funding excludes past, unknown and rolling deadlines, shows days left and the full date, and keeps the earliest three. A closing date alone is not eligibility. Fixtures name their reference date; no sample count or sample record appears in production. Loading, empty, partial, offline and error states keep the hero, steps and kinds usable.

## Describe and review contracts

Describe opens on the four public fields with one Continue, which keeps the card and goes on to needs and offers (DL-032). Where the device can transcribe speech, Voice input sits above the fields for a new initiative and takes the primary until something is typed. Speaking opens the conversation already listening. Otherwise Talk it through instead opens the same conversation. A card built from a conversation still goes through Check your card.

Conversation uses the fixed short script as the labelled D36 default, accepts edits and keeps answers, composer text, file bytes and links on the device. Speak appears only after the browser confirms local speech for the selected language. Files and links remain available while talking; name files that were retained but not read. No remote link fetch is implied.

Build my card reads the current input revision. A newer edit cancels or invalidates old output. Derived details remain in Proposal pencil until Keep, Change or Remove; removing a guess prevents later builds from reintroducing it, and Undo restores it. Public fields stay editable. Confirming a local card does not save to an account or share it.

Use the Card preview beside the conversation and review. Keep a steady working area, start new routes at the heading and stop all motion under reduced motion. The assistant prompt and cloud consent are native dialogs or notices. Production hides unavailable service actions. Download and cloud states may be shown only as labelled, in-memory fixtures until D32 and D35 permit adapters.

## Needs, offers and finish contracts

Needs and offers are one page with two Ask lists, side by side on wide screens and stacked on a phone (DL-032). Each list has one labelled field and Add. The title is the person's words, and kinds of support are suggested from them. Ask card shows the kinds as chips with Add a kind of support, More details and Remove. Every applicable kind has the same treatment; the editor offers all eight. A dashed card or chip is a suggestion until the page's one Continue keeps it, so the card has no Keep of its own. A removed card has Undo, which restores its previous state and cannot exceed the five-card limit. Names and raw unfinished fields remain editable and survive reload.

Ask list shows the active count out of five, with a notice when more were heard. Full source words and file bytes remain available. Kept corrections and removed source chunks are pinned across rebuilding. An entry can have no kind of support on the device. Sharing, publishing and the live private save each need one, and say so before the tap. Currency is never guessed. Place scope and terms start as reviewable Anywhere and Open to anything defaults. Open to anything is exclusive of the other terms.

Needs carry timeframe, urgency and purpose; offers carry capacity and audience. Both carry status. These are local draft cards, not published commitments. Continue keeps both lists together or changes neither. It stops on an open editor, unfinished source input or typed words not yet added, and says where. An empty list can continue. Where the device can transcribe speech, Voice input leads each list until the list is full. The conversation sits behind Talk it through instead only where speech cannot lead, and Add by hand only keeps notes and files without reading them.

Finish became Your initiative, the page a person comes back to (see the contracts below). The card comes first: the checked initiative with its kept needs and offers. Each action then has its own row, and first funding and partners follow. Partner suggestions wait for a linked Certified project. Unknown live counts stay unknown. Funding feeds, partner matching and the live sharing adapter follow in later steps; development examples are labelled and excluded from production.

## Funding and team slots contracts

Funding uses the existing catalog's thematic fit, readiness, research-priority groups and sourced reasons without changing its rubric. Fit is a word and bar, never a numeric promise. Unknown fit remains unassessed. Visitors can browse the whole catalog without invented ranking. Program links preserve the fund and program identities. Closed cycles, unverified offers and funding resources stay distinct and searchable. Source dates, unknowns and official links remain visible.

An opportunity opens as a detail sheet over the list. It has one link out, Open the funder's page, and one primary that follows the person's state: Describe your initiative until a card is described, then the funder's page. A change to the filters rewrites the address without adding a history entry, and it moves neither focus nor scroll. Suggest a fund is a development example: it keeps the suggestion in page memory, asks for no contact details and sends nothing. Production needs an endpoint that validates the link, and a review queue (DL-036).

Team slots is an organism for a fund's partner requirements. Parts are `rc-team-slots`, `rc-team-slot`, `rc-team-candidates`, `rc-team-candidate` and `rc-team-coverage`. Card summaries use `rc-team-line`. Private initiatives see counts only. Shared examples expose labelled native checkboxes and reasons. Coverage counts distinct requirements and distinct selected initiatives; one initiative can meet several asks and is requested once. Coverage never changes the solo rubric or approves eligibility. D29 keeps requirements and team fit as labelled development examples; production does not invent requirements or counts. Email reminders and introductions wait for Step 7.

## Contextual account and email tasks

Dialog has three presentations: information explains, a task asks for one decision, and
detail holds a whole record over its list. Each is a native modal, centred on wide
screens. On phones it is a full-width bottom sheet that rises from the bottom edge and
follows a drag on its handle. A press outside closes information and detail, never a
task. Leaving reverses the motion with a bounded wait, and with reduced motion the sheet
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

Check your card is one form: the four public fields in ink, then the derived details as
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

Your initiatives is the fourth section and holds the account. Signed out, it offers Sign
in with Certified and says what Certified is. Signed in, it shows the handle, Sign out
and Settings, and lists what the person can open: the card on this device, private saves
and Certified projects with their group, role and workspace state. Each card opens from
its name. The project list is a development example until Weave can read projects.
Opening a project with a team workspace opens that workspace. Opening one without brings
its four details from Certified and goes on to needs and offers. Opening another
initiative backs up the device card first.

## Your initiative, Keep card and Certified contracts

The card is the object people come back to, and its state reads in one line: on this
device, saved (only you), shared with people signed in, or on Certified (anyone). The
Status line molecule carries that sentence and the one thing to do about it next: Keep
it, Who can see it, Add to Certified or Update on Certified. It appears on Your
initiative, as a strip above the Home hero for anyone with a card, and in Settings.
Partners open only after sharing.

Check your card is one form: the four public fields in ink, then the derived details as
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

Your initiatives lists what a signed-in person can open: the card on this device, saved
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
says what supports it and what still needs checking. There are no introductions; a
person can save a lead and open its source. Unknown counts stay unknown. The independent
public directory remains browsable. Live sharing, matching and publishing require their
service contracts and D26, D28, D30 and D31 decisions. Development examples never
publish a private initiative.

## Settings and data contracts

Settings groups Your initiative, Account, Assistant, Appearance, Install Weave on your
phone and Your data in place. Leave comes last, with sign-out and deletion set apart;
the example world hides it while nobody is signed in. Settings is reached from Your
initiatives and the footer, and its Back link returns to Your initiatives. Membership
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
