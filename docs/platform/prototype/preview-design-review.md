# Weave preview design review

9 November 2026. A walk through the preview as the design handoff asked, with findings
from the code and the running app, a proposed structure, a comparison of the two
starting paths and the returning visit, and a prototype sketch for adding an
initiative to Certified. Companion documents: [Saving and accounts](../08-accounts-and-saving.md),
[technical specification](../05-technical-spec.md#5-identity-and-access),
[review decisions](review-decisions.md), [DESIGN.md](../../../DESIGN.md) and
[VOICE.md](../../../packages/design-system/brand/VOICE.md).

The short version. The preview is honest and complete, and that is what makes it
heavy: every service explains itself in full sentences, every derived value asks for
its own decision, and the one thing a person makes, their card, has no page of its own
to come back to. The fix is less about cutting words than about organising the
screens around the card and its three states (on this device, saved privately,
shared), and moving explanations behind the places where the hard question is asked.

## What I looked at

- Code on `main` at `42c084b`: [routes](../../../packages/app/src/routes.ts),
  the pages in `packages/app/src/pages`, `src/account`, `src/social` and `src/ui`.
- The Certified work. It is not on `main` and not on any branch on `origin`; the
  `codex/weave-design-handoff` branch the handoff names does not exist there either.
  It lives as uncommitted changes in the `codex/certified-auth-bridge` worktree:
  Certified sign-in through `/api/sign-in`, a `partners/` folder with public-source
  suggestions and per-entry sharing, and the `WEAVE_ACCOUNT_FIXTURE=1` fixture the
  handoff mentions. I read that code; I did not run it. Everything below that says
  "Certified branch" refers to it.
- Rendered proof, class `fixture`, Chromium in the Claude desktop app's built-in
  browser, light theme, at 360 by 780 and 1280 by 900. The app ran from this
  worktree with `WEAVE_ACCOUNT_FIXTURE=1` (added to `.claude/launch.json` as
  `app-fixture`), so sign-in used the local example account. The private and shared
  scenarios used the `?fixture=` URL examples. Not checked this pass: dark theme, the
  keyboard, 200 percent zoom, and the Certified sign-in and partner screens.

## The experience in numbers

Interface copy only, not the person's own words. Controls are everything tappable in
the main content, including quiet links.

| Screen, as seen | Words | Controls | Decisions before you can continue |
|---|---|---|---|
| Home, first phone screen | 90 | 10, three of them doors to Initiatives | None |
| Describe, fresh | 125 | 10 before the card preview | None; any input unlocks Build my card |
| Check your card | 157 | 22 | Keep, change or remove each pencil detail that has a value. Five rows show the same three buttons; in this run three had values and two said "Not stated" |
| Needs, after one answer | about 150 | 12 before the first card on a phone | Keep, change or remove every card in pencil, and close any open editor |
| Finish, signed out | 330 with the card; the share card alone is 115 words before the email field | 11 | None, but saving takes email, code, then a separate Save |
| Account dialog, signed in | 108 | 5 | Save again, or load the card already on this device |
| Settings, signed out | 199 in seven sections | 9 | None |

The sign-in form appears in four places: Finish, Partners, Settings and the header
dialog. Starting a new initiative and saving it privately took 16 taps and six typed
entries across six screens plus the dialog. The tap count is not the problem. The
reading load and the number of things on screen are.

## Where the interface works against itself

### It asks for the same decision more than once

1. **Check your card asks five times.** Each derived detail is a pencil row with Keep,
   Change and Remove and its own "Suggested from your words. Check this." label.
   `confirmDraft` in [describe/contracts.ts](../../../packages/app/src/describe/contracts.ts)
   only requires a decision for details that have a value, but the screen gives no
   sign of which rows those are, so people decide all five. Keep remaining details is
   the shortcut, placed as a quiet link above the list, where the first plausible tap
   is the first Keep button instead.
2. **Needs and offers ask again on the next screen.** Every card needs Keep before
   Next (`reviewStep` in [intake/state.ts](../../../packages/app/src/intake/state.ts)).
   On a phone the cards render below the Next and Back buttons and the file and link
   fields, so the natural first tap is Next, which fails with a notice. Then Finish
   offers three ways to change what was just confirmed: Change your card, Change your
   needs and Change your offers, beside a full copy of the card.
3. **Saving asks three times.** Email, then code, then "Save checked card privately",
   and the same dialog then offers "Load Orchard learning circle" for the card already
   on the device. [08](../08-accounts-and-saving.md#first-visit-and-first-save) says "Save, then resume";
   the live slice made Save a separate step on purpose
   ([DL-030](../../../packages/design-system/decision-log.md#dl-030-private-account-connection-before-further-fixture-steps)).
   From the person's side it is the same decision asked again.
4. **Two header controls open one dialog.** "Nothing saved yet" and "Account" sit side
   by side and both open the account dialog
   ([AppHeader.tsx](../../../packages/app/src/ui/AppHeader.tsx)).
5. **Saving and sharing are explained together, three times.** The share card on Finish
   says partners come from sharing, that a private initiative sees counts, that
   sharing will ask first, that the card stays private, that a copy can be saved, and
   that sharing is not available yet. Then Keep this initiative explains saving again.

### It asks for information it already has

1. **Where you work is asked three times** on one journey: as the second question in
   the conversation, as a field with a hint about semicolons on Check your card, and
   on the preview card beside both. In this run the keyword draft put the whole
   answer sentence into the field ("Most of the work happens in the upper valley...")
   so the person has to retype the place anyway.
2. **The returning person is a stranger on Home.** With a draft on the device or a
   card saved to the account, Home is unchanged: the primary button is still Describe
   your initiative and it reopens step one with the old conversation. The only cue is
   the word Saved in the header. Settings has the card's name, and its Change your
   card link also goes to step one
   ([Settings.tsx](../../../packages/app/src/pages/Settings.tsx)).
3. **Controls that do nothing yet.** The Speaking language select is shown on every
   step with the hint "Local speech is not available for this language. You can type
   below." DESIGN.md says not to show controls that do not work yet. The Certified
   branch adds an optional "Email for Certified" field to the sign-in step, with a
   two-line warning about browser history and request logs; 08 says never to ask for an
   email at arrival, and Certified can ask for it itself.

### It makes people read before they can act

1. A status line on every step ("Assistant on this device. Guided questions, keyword
   draft."), two sentences of hint under Add files, two under Add a link, and a
   footnote about places and themes under the review. Krug's rule is to cut half the
   words and then half again, and to put help where the hard question is.
2. The share card: 115 words before the email field.
3. The signed-in state: 108 words about what is saved, how long the session lasts and
   shared devices before the Save button.
4. Settings: 199 words, most of them statements that a service is not connected yet.
   Honest, but a paragraph per missing service is not the honest empty state the
   design system asks for.
5. In development, the fixture notices stack on top: "Fictional examples", "Fictional
   matching example", "Example email door". They are not in production, but they are
   part of what the preview felt like.

## What belongs together

Organise the screens around the card and its state, not around our services. One
object, three states a person can read in one line: on this device, saved privately,
shared. Everything else hangs off that.

**Describe.** Speak when it is available ([DL-022](../../../packages/design-system/decision-log.md#dl-022-describing-is-a-conversation-led-by-voice)),
the answer box, and Build my card. Files and links go behind one disclosure, "Add a
file or link", with a single line of hint inside it. The language choice lives inside
the speech control and appears only when speech works. "Use the four fields" stays as
the quiet link at the bottom. The preview card stays beside the conversation.

**Check.** The card is the form: the four public fields are edited on the card itself,
not in a second copy below a heading. The derived details appear on the card as pencil
chips with one action for the group, Keep card, which confirms them all. Tapping a
chip opens change or remove for that one detail. Empty details show "Add" instead of
Keep and Remove, since there is nothing to confirm. This keeps the rule that nothing
derived is applied without a person confirming it, with one confirmation instead of
five. It is exactly what T5 asks to test, so it should go to people before it is
locked.

**Needs and offers.** The answer box, then the cards directly under it on a phone,
then Next at the bottom. Cards accept with one tap. The editor opens with title and
kinds only; amount, when, terms and status sit under "More details". Make cards is
already triggered by Add your answer, so the separate button can live in the overflow
with Use plain cards.

**Your initiative.** Finish becomes a page the person comes back to, with a name:
Your initiative. It holds the one status line and its one action, the card with needs
and offers editable in place, then Funding that fits, then Partners. The three "Change
your" links become edit affordances on the card. This page is the destination for a
returning visit and for the Certified step below.

**Account.** One door, the header's Account, and one place, Settings. The inline
sign-in forms on Finish and Partners become a single button on the status line, "Keep
it", that opens the door. The Certified branch already moves Partners this way, with a
"Save or load a card" button instead of a form.

**Sharing.** Three audiences, in the words VOICE.md already has for them: Only you
(on this device or saved to your account), People signed in (chosen needs and offers,
for a set time, as the Certified branch's per-entry sharing does), Anyone (a published
record on Certified). Show them as one control on the status line, "Who can see it",
with Only you selected. Note that these three differ from the two ways in
[D26](../open-decisions.md#for-the-council): the Certified branch reintroduces a
signed-in middle level, per entry and time-boxed, and publication adds a public one.
The council proposal and the words should move together.

## Shorter, or on demand

| Today | Proposal | Where it goes |
|---|---|---|
| "Assistant on this device. Guided questions, keyword draft." on every step | An Assistant label with a tooltip: "Runs on this device. Nothing is sent." | Tooltip |
| Two-sentence hints under Add files and Add a link | "Up to 25 MB. Text and PDF text are read here." | Inside the disclosure |
| "Suggested from your words. Check this." five times | Once, above the group; the pencil style carries the rest | Once |
| "Places are the words you gave, without a map lookup. Themes are keyword or model suggestions..." | Into What we store | On demand |
| The share card's five sentences | "Partners appear once you share. Until then, funding fits and a count when there is one." | Card |
| "Sign in to save a private copy of your checked card, needs, offers and kept funding details. Conversations, files..." | "Keep this initiative on your account. Only you can see it." with a What is saved link | One line and the facts dialog |
| "Signing in creates an account if needed. It does not make you a Regen Commons member or share your card." | Drop. The Certified branch's "You will not need another sign-in in Weave" covers it | Dropped |
| Session length and shared-device paragraph | Settings, under Leave | Moved |
| Settings' "not connected yet" paragraphs | One disclosure, "Not ready yet", listing them | Details element |
| Timestamps such as "Saved 11/9/2026, 1:20:22 AM" | "Saved 9 November 2026" | VOICE.md date form |

## The two starting paths and the returning visit

### Already on Certified

Today, on the Certified branch, Sign in with Certified establishes identity only: a
stable subject from the issuer and DID, with no email, no profile and no project
records. The bridge deletes its Certified session after sign-in and requests no
persistent write permission (that worktree's `packages/api/CERTIFIED.md`). The project index reads `org.hypercerts.collection` records from an
operator-held permission list for partner evidence, not from the signed-in person. So
the person signs in and still starts at step one with an empty conversation. Bringing
over verifiable details is not possible yet.

Proposed: the return from Certified lands on Your initiatives, a list of the person's
Certified project records (name, one line, when it was published) and their saved
Weave cards. Picking a record opens Your initiative with the four public fields filled
in ink, under a source line "From your Certified record, 2 November 2026", with Edit
beside it. These are the person's own published words, not the assistant's guess, so
ink is right; the derived details stay in pencil as today. Keep card leads straight to
Needs. Reaching Needs takes four taps and no typing.

Needs: integration to list the signed-in DID's records in that collection and map
their fields to the four public fields; a product decision on what "verified" means
(owner signed in, record unchanged since import, or both) and how an edited import is
labelled.

### Starting an initiative

Today: six screens, sign-in at the end on Finish, Partners or Settings, then an
explicit Save. Nothing can be published to Certified.

Proposed: Describe, the card check on the same screen, Needs, Offers, then Your
initiative with one status line, "On this device", and one action, Keep it. Keep it
signs in with Certified and, because the person asked to keep it, saves on return.
Sign-in already carries the return path (`returnTask` in the branch's `/api/sign-in`);
it would also carry the intent. Who can see it stays at Only you until the person
changes it. Publication is a separate review, below. Fourteen taps and four typed
entries, with no code to copy from an email.

The handoff suggests signing in first ("Sign in with Certified, enter the minimum
details once"). 08 and DL-018 say never at arrival, and that rule was written for an
email code. A Certified sign-in is one redirect with nothing to type, so the cost it
guards against is lower, but the reason stands: people should see the card fill in
before they are asked for anything. I would keep draft first and make Keep it one tap
away on every screen through the status line. This is the maker's call.

Needs: a product decision on draft first or sign-in first, and on saving on return
(DL-030 chose an explicit Save); integration for publishing, see below.

### Coming back

Today: Home does not change. The way back to a card is Account, then Settings, then
Change your card, which reopens step one; or the Partners tab, which shows the share
card and another sign-in form. The session lasts an hour, so most returns are signed
out. On the same browser the device draft is still there. On a new device the saved
card can be loaded from the account dialog after sign-in, which backs up whatever
draft is on that device first.

Proposed: Home shows a strip above the hero for anyone with a card: its name, its
state and one button, Open, to Your initiative. The signed-out return on a new device
is Sign in with Certified, then Your initiatives, then Open. Settings' Change your card
goes to Your initiative, not step one.

Needs: a small change to the Home composition for the strip; no new service. The list
of saved cards already exists through `/api/account`.

### What works today and what needs work

| Moment | Works today | Needs product or integration work |
|---|---|---|
| Describe, check, needs, offers on the device | Yes, keyword draft, files, links, local speech where available | The regrouping above is interface work only |
| Save privately | Yes, live with email codes on `main`; Certified sign-in on the branch, with explicit Save and Load | Save on return from Keep it (product); Certified branch to land on a branch |
| Share chosen needs and offers with signed-in Weave users | Fixture and local Supabase on the branch, per entry, time-boxed, with a review dialog | The audience and expiry words; alignment with D26 and D27 |
| Partner suggestions from public sources | Starter catalog on the branch, matched on the device | Coverage and the project index's permission list |
| Select a Certified initiative on sign-in | No | Read the person's records, map fields, define verified |
| Publish an initiative to Certified | No; the bridge has no write permission by design | A handoff to Certified with prefilled fields, or a write scope with a new consent step |
| Return to your card | Same browser: the draft is there. New device: load from the account dialog | Home strip, Your initiative page, Your initiatives list |

## Prototype: reviewing and adding an initiative to Certified

Where it sits: on Your initiative, as the Anyone rung of Who can see it, and as a
secondary button, Add to Certified, once the person is signed in. Saving privately in
Weave is not a prerequisite, and neither is sharing with signed-in users; the three are
independent choices on one line.

What opens, as a bottom sheet on phones and a dialog on wide screens, using the
existing task dialog pattern:

```text
Add Orchard learning circle to Certified?

This publishes a project record under your Certified account.
Anyone can read it. Your Weave card stays private unless you
change Who can see it.

Goes on Certified                                      Change
  Orchard learning circle
  Upper valley, near Belo Horizonte, Brazil
  Families restore an old orchard and share what they
  learn about soil, water and seed saving with schools.
  orchardcircle.org

Also publish as requests and offers          none chosen
  [ ] Need: R$ 60,000 to fence the orchard
  [ ] Need: volunteers with grafting experience
  [ ] Offer: seedlings and a seed-saving workshop

Stays in Weave only
  Type of work, themes, who it serves, your conversation
  and files.

[ Continue on Certified ]        Not now
You confirm on Certified. Nothing is published until you do.
```

Rules the sketch follows. The four public fields are shown exactly as the card has
them, with one Change that returns to the card. Needs and offers are opt-in, unchecked,
because the project index already distinguishes published requests and offers in
those records and each is a separate public statement. Not now leaves everything as it
was, including a private save. The primary button says what happens next, and the
line beneath it says where the decision is actually made. After publication the status
line reads "On Certified" with a link to the record, "Update on Certified" appears
when the card changes, and "Remove from Certified" sits in Settings under Leave. A
failure reads "Certified did not confirm the record. Nothing was published. Your card
is saved."

Two ways to connect it, for the maker and the technical specification owner:

1. **A handoff to Certified.** Continue on Certified opens Certified's own create or
   edit flow with the fields prefilled through a signed, short-lived token, the same
   shape as the membership handoff in the technical specification. Certified writes
   the record under the person's account and returns the record address, which Weave
   stores on the initiative. The bridge stays identity-only, publication consent
   happens where the record lives, and Weave never signs records. It needs Certified to
   accept a prefilled create flow. This is the shape the sketch assumes.
2. **A Weave-side write.** Weave asks Certified for write permission with a new scope
   and a reviewed consent step, and writes the record itself. The bridge was built
   against this, and it would be a critical-tier change to auth and the consent ledger.

Importing from Certified, the first starting path, is the same sheet in reverse: the
record's fields arrive in ink with a source line, and the person keeps the card.

## Small things seen on the way

- A tooltip stays open under a resting pointer while the page scrolls past a kind tag.
- Partners, shared example, shows seven filter controls on a phone before the first
  card.
- The header's save status and Account button both open the dialog.
- "Load Orchard learning circle" is offered for the card already on the device.
- On the Certified branch, "Email for Certified (optional)" sits in the first-use path.

## Decisions taken

The maker took the seven decisions on 9 November 2026, as recommended. They are recorded
as [DL-031](../../../packages/design-system/decision-log.md#dl-031-your-initiative-one-keep-card-and-certified-as-the-one-door-in-the-prototype).

1. Draft first. Sign-in appears at the first action that needs it, through the status
   line, and Home offers "Already on Certified? Sign in" as a quiet link.
2. Keep it saves on return from Certified. Signing in alone saves nothing.
3. One Keep card confirms every pencil detail that holds a value; tapping a chip opens
   change or remove. T5 still tests whether people notice the pencil.
4. Finish becomes Your initiative, the page a person comes back to, with one status
   line. Settings and the Home strip open it.
5. The optional email field at Certified sign-in goes. An address is asked for only
   when something will be sent to it.
6. Publication goes through a handoff. The sheet shows what goes on Certified and the
   person confirms there; Weave takes no write scope.
7. Certified is the one door in the prototype. The production email code door stays
   until the usability round counts how many people get through Certified sign-in;
   D26, D28, DL-021, 08 and VOICE.md move together when that is confirmed.

Sharing has three rungs in the prototype, Only you, People signed in and Anyone, with
the Certified branch's 90-day period on the middle one. D26 still says two; the council
decides.

## The prototype

The prototype is the app itself in fixture mode, on this branch. Start the `app` server
from `.claude/launch.json` (`bun run --filter @weave/app dev`) and open these addresses.
The example controls at the top of each page switch scenario and state.

| Moment | Address |
|---|---|
| Home with a card on the device | `/?fixture=draft` |
| Check your card with one Keep card | `/start/initiative/check?fixture=draft&view=review` |
| Your initiative: Keep it, then Who can see it and Add to Certified | `/your-initiative?fixture=draft` |
| Certified refuses the record | `/your-initiative?fixture=private&certified=fail` |
| Already on Certified: sign in, open a record | `/your-initiatives?fixture=returning` |
| On Certified, with Remove from Certified under Leave | `/settings?fixture=published` |
| Partners before and after sharing | `/partners?fixture=private`, `/partners?fixture=shared` |

Everything is in memory. Nothing is sent, and a reload restores the scenario. The
example Certified pages are labelled as examples, and the app's production test checks
that production bundles exclude them.

A clickable copy is published as an artifact at
https://claude.ai/artifact/KrVcXKRNCHaQDA2iP17Zdt, private to the maker until shared: the
same app in a review page that picks a starting point, switches between a phone frame and
the full width, sets the theme and steps back. `#check-card` and the other starting-point
names open one directly. The [prototype README](README.md#run-it) says how
to rebuild and republish it.

Rendered proof, class `fixture`, Chromium in the Claude desktop app's built-in browser,
9 November 2026: the whole path above at 360 by 780 in the dark theme, Your initiative
and Check your card at 1280 by 900 in both themes, and keyboard focus through the
header to the status line. Not yet checked: 200 percent zoom, reduced motion by eye,
and a session with people.

Left for the next pass: the needs and offers cards still render below Next and Back on
phones; the header wraps to two rows at 360 px when the status text is long; the
returning example lists the same initiative once on Certified and once as a Weave card,
which is possible but reads oddly; and the import path does not yet match a draft
against existing records ("Is this one of yours?").
