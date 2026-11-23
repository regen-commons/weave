# Accessibility audit, 22 November 2026

After the fixes listed here, Weave meets 53 of the 55 level A and AA criteria of WCAG
2.2, counting those with nothing to apply to. Two still have an open item: text spacing
after a page has loaded, which needs a change to the global layout tokens, and the
language of text from Certified and the catalog, which neither source records. Automated checks found nothing (Lighthouse accessibility 100, axe-core
no violations), so every finding below came from walking each flow with the keyboard
and reading the accessibility tree and the live-region traffic.

The most serious problems were about where focus goes and what a screen reader hears:
the phone Filters sheet said nothing when a filter changed the count, removing a
filter chip dropped the focus on the page, and long dialogs scrolled the focused
field under their own sticky title row or Save button. Those are fixed, and so is the
background mycelium, which kept growing on its own with no way to pause it from the
page.

## How it was checked

| | |
|---|---|
| When | 22 November 2026, Pacific time |
| Build | `develop` at `4bc4784` plus the fixes below, `vite` dev server with `WEAVE_ACCOUNT_FIXTURE=1` and `WEAVE_PRODUCTION_PROJECTS=1`, class `fixture` (example account, real public initiatives from Certified) |
| Browser | Chrome for Testing 149, headless, through the Chrome DevTools protocol |
| Sizes | 360 by 740 (touch), 320 by 256 (400% zoom), 320 by 568 with text spacing, 1280 by 800, light and dark |
| Automated | Lighthouse accessibility on Home (mobile, 100). axe-core 4.14.0 with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice` tags on Home, Funding, a fund sheet, Describe and Needs, in both themes: no violations. axe was loaded into the page from Lighthouse's own copy for the audit; it is not a dependency |
| Manual | Keyboard only through every flow; a script that focuses each control in tab order, forwards and backwards, and reports any that end up behind a sticky bar, the dock, the step bar, the pinned filter row or a dialog's own title row and foot; a mutation log of every `role="status"`, `role="alert"` and `aria-live` change; the WCAG text-spacing override; border contrast of fields, checkboxes, radios and buttons |

Routes: Home, Initiatives (list, sheet, and an initiative opened from its link),
Funding (list, Filters sheet, desktop filter menus, a fund's sheet and full page,
Details For Funding), the describe steps (Initiative, Needs, Offers, Your Initiative
as Matches, with Talk It Out, Add To List, Change Details, Remove and Undo, files),
sign-in and the Save door, Your Initiatives, Settings and the footer's information
dialogs.

## Findings

Severity: **serious** blocks or misleads a keyboard or screen reader user on a main
task, **moderate** makes a task harder or noisier, **minor** is a small gap. Ticked items
are fixed in the pull requests named.

### Lists and filters ([#173](https://github.com/regen-commons/weave/pull/173))

- [x] **A-01. The phone Filters sheet does not say the new count.** 4.1.3 Status
  Messages (AA). Funding and Initiatives at phone width. Serious. The count line under
  the filter bar is a status region, but it sits behind the open modal sheet, which
  makes it inert, so ticking a filter said nothing. Fix: the sheet's foot holds its own
  status that says the count after a change made in the sheet; the page's line stays
  silent while the sheet is open, so each change is announced once
  ([capture](fixture-chrome149-filters-sheet-360-light.jpeg)).
- [x] **A-02. Removing a filter drops the focus on the page.** 2.4.3 Focus Order (A).
  Funding and Initiatives. Serious. A chosen filter's chip, Clear Filters and the empty
  list's Clear Filters remove themselves when pressed, and focus fell to `body`. Fix:
  focus moves to the chip that took the pressed one's place, or to the search field once
  no chip is left. A page load still leaves the focus alone.
- [x] **A-11. A cut award or date gives no sign it was cut.** 1.4.12 Text Spacing (AA).
  List cards. Minor. With the text-spacing override at 320 px, the award line ("Grant,
  GBP 200,000 to 1,000,000") and "Sources checked" lines were clipped mid-number with
  no ellipsis, so an amount could read as a smaller one. The full text is in the record.
  Fix: both lines end in an ellipsis when cut, as the funder line already did.

### Dialogs, sheets and tooltips ([#172](https://github.com/regen-commons/weave/pull/172))

- [x] **A-03. A focused control can sit under a dialog's own title row or foot.** 2.4.11
  Focus Not Obscured (AA). Every dialog that scrolls. Serious. The title row and a foot
  such as Save Details stay put while the dialog scrolls, and the dialog had no scroll
  padding. In Details For Funding, Tab put four fields entirely under the foot and
  Shift+Tab put two under the title row; in a fund sheet, Shift+Tab put Open The
  Funder's Page entirely under the title. Fix: the sheet behaviour measures how far the
  title row and foot reach and the dialog's scroll padding keeps that clear, plus room
  for the focus ring. After the fix no control ends up under either, forwards or
  backwards ([360 dark](fixture-chrome149-funding-details-dialog-360-dark.jpeg),
  [1280 dark](fixture-chrome149-fund-sheet-shift-tab-1280-dark.jpeg)).
- [x] **A-04. A dialog that should stay open closes and opens again.** 2.4.3 Focus Order
  (A). Delete A Saved Card while deleting, Needs And Offers in a team workspace while an
  entry is being edited, device backups and account deletion. Moderate. The page refused
  Escape, but the sheet behaviour ignored the refusal, played the closing motion and
  closed; the page then reopened the dialog, focus jumped to Close and the reason was
  set twice. Close went the same way. Fix: the sheet behaviour leaves a refused close
  alone, and while a close is blocked Close says why instead of submitting. Proof: a
  unit test in `packages/design-system/test/sheet.test.mjs` that fails on the old
  behaviour. Not reproduced in a browser, since these states need the account service.
- [x] **A-05. Read The Data Policy drops the focus.** 2.4.3 Focus Order (A). The
  footer's What We Store. Moderate. The button replaces the dialog's content with the
  data policy and removes itself, so focus fell to `body` and the new title was never
  read. Fix: the new title takes the focus, only for that moment, so the next opening
  still starts on Close.
- [x] **A-06. A tap does not open a tooltip.** The repository's own rule that every
  action works by tap and by keyboard (related to 1.4.13). The eight kinds on Home and
  the kind and fit signs elsewhere. Minor. Chrome's `interestfor` shows the
  explanation on hover, on focus and on a long press; a tap did nothing. Fix: a press
  opens it too. Focus, Escape and hover behave as before (1.4.13 passes).

### Describing an initiative ([#174](https://github.com/regen-commons/weave/pull/174))

- [x] **A-07. Each change to a list is announced twice, once without its noun.** 4.1.3
  Status Messages (AA). Needs and Offers. Moderate. The "2 of 4" count was its own live
  region beside the status line, so Add To List said "2 of 4" and "2 needs added..."
  and Remove said "1 of 4" and "Removed. Undo is on the card." Undo said only the count.
  Fix: the count is no longer live; Undo says "Back on the list."
  ([capture](fixture-chrome149-needs-undo-1280-light.jpeg)).
- [x] **A-08. Removing a file drops the focus.** 2.4.3 Focus Order (A). Initiative,
  Needs and Offers. Moderate. Remove takes its own row away. Fix: focus moves to the
  Remove that took its place, or the one before it, or to Add Files once the list is
  empty.
- [x] **A-09. The storage notice reads its buttons and the whole draft.** 4.1.3 Status
  Messages (AA). Initiative, Needs, Offers and Your Initiative when the browser cannot
  store a change. Moderate. The whole notice was one atomic status region, so Show Text
  Copy or Copy Draft Text re-read the notice, its buttons and the draft's full text.
  Fix: the problem is an alert, the copy's outcome has its own status, and the notice is
  a labelled region.
- [x] **A-10. Your Initiative skips a heading level.** 1.3.1 Info and Relationships (A).
  Your Initiative and Team Workspace. Minor. The page's `h1` is the initiative's name,
  and Needs and Offers followed as `h3` with their cards as `h4`. Fix: they are `h2`
  and `h3` wherever the page heading is the name.

### Background motion

- [x] **A-12. The background keeps moving with no way to pause it.** 2.2.2 Pause, Stop,
  Hide (A). Every page. Serious. The mycelium grew a new strand on its own every 1.8 to
  3.6 seconds for as long as a page was open (DL-128), and only the system's
  reduced-motion setting stopped it. Fix, by the user's decision of 23 November: strands
  grow on their own for the first five seconds of a page; one still growing then goes
  at once, and a mouse or a finger still leaves trails. On Home, animation frames
  stopped 4.5 seconds after the first and none followed in the next seven.

### Follow-ups ([#176](https://github.com/regen-commons/weave/pull/176), [#177](https://github.com/regen-commons/weave/pull/177), [#182](https://github.com/regen-commons/weave/pull/182))

- [x] **A-13. Talk It Out said "Stop, pressed".** 4.1.2 Name, Role, Value (A). Every
  describe step. Minor. The button was a toggle (`aria-pressed`) whose label also
  changed to Stop, and its status line switched its role between status and alert on
  the same element. Fixed by the speech session in #177: no `aria-pressed`, and one
  role per element.
- [x] **A-14. Busy buttons lost the focus.** 2.4.3 Focus Order (A). Delete A Saved Card,
  account deletion, device backups and team workspace access. Moderate, from code; not
  run, since most need the account service. The pressed button became `disabled` while
  its request ran, and Chrome then dropped the focus. Fixed with `busyProps` in
  `account/busy.ts`: the account's buttons in #176, device backups and team access in
  [#182](https://github.com/regen-commons/weave/pull/182). The pressed button stays focusable and says it is busy.
- [x] **A-15. The need and offer editor's error named no field.** 3.3.1 Error
  Identification (A) and 3.3.3 Error Suggestion (AA). Change Details, and needs and
  offers in a team workspace. Moderate. Any invalid value showed "Add a title. Check
  amounts, currency and terms." at the foot of the form, with nothing marked. Fixed in
  [#182](https://github.com/regen-commons/weave/pull/182): the message names what to do (the schema's own sentences where it has
  them), sits at the field it is about, which is `aria-invalid` and described by it, and
  takes the focus ([capture](fixture-chrome149-need-editor-error-360-light.jpeg)).

### Open

- [ ] **A-16. Wider text spacing slides the pinned filter row under the header.**
  1.4.12 Text Spacing (AA). Funding and Initiatives at phone width. Minor. The pinned
  row is placed at `--app-header-height`, a fixed token; with line height 1.5 applied
  the header grows past it and covers the top of Search and Filters. Owner: quality
  (global CSS and tokens).
- [ ] **A-17. Text in other languages is not marked.** 3.1.2 Language of Parts (AA).
  Initiatives and Funding. Cannot pass yet. Certified initiatives and some catalog
  summaries are in Portuguese, Spanish or Italian, and a screen reader reads them with
  English rules. Program and organisation names are covered by the proper-name
  exception. Neither source records a language, so a fix needs a language field from
  Certified and the catalog.

### Checked and not changed

- **Add To List focuses its live status line.** DL-032 gives the focus to the line that
  says the outcome when the pressed button goes away, and that line is also a live
  region, so some screen readers may read the outcome twice. Kept as decided; worth a
  VoiceOver check.
- **Close in What Is Certified? inside the Save door.** A static review suggested its
  Close would submit the sign-in form around it. Pressing it sent no sign-in request
  and left the door open. Not reproduced.
- **Change Details opens on its first field.** Confirmed in the browser; the static
  review's concern did not hold.
- **A catalog name lacks a space.** "Sustaining Grants2026–27" reads as "Grants2026".
  Catalog data, passed to funding-research.

## Criteria

Pass means checked on the routes above with the method in the first table. N/A means
Weave has nothing the criterion covers.

| Criterion | Result | Evidence |
|---|---|---|
| 1.1.1 Non-text Content | Pass | Icons are `aria-hidden`; icon-only buttons are named; the canvas is decorative; images have alt text |
| 1.2.1 to 1.2.5 Time-based media | N/A | No audio or video. Talk It Out records nothing |
| 1.3.1 Info and Relationships | Fixed | A-10. Fieldsets and legends in filters and the editor; labels and hints tied to fields; lists are lists |
| 1.3.2 Meaningful Sequence | Pass | DOM order matches reading order at both widths |
| 1.3.3 Sensory Characteristics | Pass | Instructions name controls by label, not shape or place |
| 1.3.4 Orientation | Pass | No orientation lock in the page or the installed app's manifest |
| 1.3.5 Identify Input Purpose | Pass | The initiative name has `autocomplete="organization"`, the optional email `autocomplete="email"` |
| 1.4.1 Use of Color | Pass | Fit, state and kind always have words beside the colour |
| 1.4.2 Audio Control | N/A | No sound |
| 1.4.3 Contrast (Minimum) | Pass | axe in both themes; quality's text contrast sweep of 22 November |
| 1.4.4 Resize Text | Pass | 200% zoom (640 by 400) reflows without loss |
| 1.4.5 Images of Text | Pass | None |
| 1.4.10 Reflow | Pass | No sideways scrolling at 320 by 256; card rows scroll inside their own list |
| 1.4.11 Non-text Contrast | Pass | Field and button borders 3.52:1 light, 4.35:1 dark; chips 11:1; focus ring 5.9:1 and 8.1:1 |
| 1.4.12 Text Spacing | Fixed, one open | A-11 fixed; A-16 open |
| 1.4.13 Content on Hover or Focus | Pass | Tooltips open on focus, stay while hovered, close with Escape |
| 2.1.1 Keyboard | Pass | Every flow done by keyboard; card rows scroll as their links take focus |
| 2.1.2 No Keyboard Trap | Pass | Native modal dialogs; Escape and Close always leave |
| 2.1.4 Character Key Shortcuts | Pass | None. Enter moves to the next field only inside a form |
| 2.2.1 Timing Adjustable | Pass | No time limits; drafts stay on the device |
| 2.2.2 Pause, Stop, Hide | Fixed | A-12. No carousel moves on its own |
| 2.3.1 Three Flashes | Pass | Nothing flashes |
| 2.4.1 Bypass Blocks | Pass | Skip to content is the first stop and focuses `main` |
| 2.4.2 Page Titled | Pass | Each route and each open record sets the tab title |
| 2.4.3 Focus Order | Fixed | A-02, A-04, A-05, A-08, A-14. Sheets return focus to the card that opened them on Escape and on Back; Show More focuses the first new card |
| 2.4.4 Link Purpose (In Context) | Pass | Links name their place; new-tab links say so |
| 2.4.5 Multiple Ways | Pass | Navigation, search and filters on every list, links between records |
| 2.4.6 Headings and Labels | Pass | Card actions such as Change Details and Remove repeat per card, with the card heading as context |
| 2.4.7 Focus Visible | Pass | 3 px ring on every stop; cards draw it round the whole card |
| 2.4.11 Focus Not Obscured (Minimum) | Fixed | A-03. Page bars, dock, step bar and pinned filter row clear forwards and backwards |
| 2.5.1 Pointer Gestures | Pass | Swipe and drag have buttons: Close, scroll and tab |
| 2.5.2 Pointer Cancellation | Pass | Actions run on release; a sheet's drag settles back unless released past the line |
| 2.5.3 Label in Name | Pass | Accessible names start with the visible words ("Remove field-notes.txt") |
| 2.5.4 Motion Actuation | N/A | No motion input |
| 2.5.7 Dragging Movements | Pass | Dragging a sheet down has Close and Escape |
| 2.5.8 Target Size (Minimum) | Pass | No control under 24 by 24 px apart from links in sentences (quality, 22 November) |
| 3.1.1 Language of Page | Pass | `lang="en"` |
| 3.1.2 Language of Parts | Open | A-17 |
| 3.2.1 On Focus | Pass | Focus changes nothing; tooltips only show |
| 3.2.2 On Input | Pass | A filter rewrites the address without moving focus or scroll (DL-036) |
| 3.2.3 Consistent Navigation | Pass | The same header, tab bar and footer order on every page |
| 3.2.4 Consistent Identification | Pass | The same actions keep the same names |
| 3.2.6 Consistent Help | Pass | The footer's Data & Privacy links keep one order wherever the footer shows |
| 3.3.1 Error Identification | Fixed | A-15. Describe's own errors name the field, are tied to it and take the focus |
| 3.3.2 Labels or Instructions | Pass | Every field has a visible label and its hint above it |
| 3.3.3 Error Suggestion | Fixed | A-15 |
| 3.3.4 Error Prevention | Pass | Deleting a saved card or the account asks first; sharing and publishing show what leaves first (DL-032) |
| 3.3.7 Redundant Entry | Pass | Words said once fill the fields; later steps never ask for them again |
| 3.3.8 Accessible Authentication (Minimum) | Pass for Weave | Weave asks for no password or puzzle. Certified's own sign-in page was not audited |
| 4.1.2 Name, Role, Value | Fixed | A-13 |
| 4.1.3 Status Messages | Fixed | A-01, A-07, A-09. Show More, Copy Link, Need Details Kept, the fund count on desktop and the describe step's reading and filling each speak once |

## Not covered

- **Screen readers.** VoiceOver and NVDA were not run, because turning one on changes a
  system setting. The accessibility tree and a log of every live-region change stood in
  for them; A-07, A-09 and the Add To List note deserve a VoiceOver pass.
- **Other browsers and devices.** Safari and Firefox, and phones in the hand. Tooltips
  use Chrome's `interestfor`; other browsers take the design system's fallback.
- **The account service.** Team workspaces, deleting a saved card and the busy states
  behind A-04 and A-14 need it; A-04 is proved by a unit test, and A-14 follows the
  pattern #176 tested for the account's buttons.
- **Certified.** Its sign-in and consent pages are its own.
- **An initiative opened from its link.** In this local setup it showed "Initiative Not
  Available" over the list; the record pages are changing in #168.
