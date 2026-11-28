# App package

Use the [root guide](../../AGENTS.md) for shared workflow and the
[design skill](../../.claude/skills/design/SKILL.md) for anything people see.
`@weave/app` is Weave: a React 19 PWA built with Vite, in TypeScript, with no CSS
framework. It is the root directory of the Weave Vercel project. Read the
[app dialect](../design-system/dialects/app.md) before changing a screen.

The route table in [src/routes.ts](src/routes.ts) owns pages and their section cues.
Home, frame, lists, the four-step intake through Your initiative, Your Initiatives,
Funding and opportunity detail are built. Initiative details follow in later steps.
Settings provides the private account connection. Development fixtures require an
explicit `?fixture=draft` (or visitor, private, workspace, shared, published,
returning); `view` selects Describe states; `intake` selects needs, offers and Your
initiative examples; `projects=none` gives the example person no Certified project;
`speech` makes the example browser offer speech setup (`setup`), stall in it (`slow`),
fail it (`fail`), have no speech recognition (`none`, or `keyboard` on a touch screen), or
have only its own speech service, before the agreement (`browser`), after it (`agreed`) and
stopping each way it can (`denied`, `no-mic`, `network`, `blocked`, `pause`,
`unsupported`), or have no speech recognition with cloud speech on offer, before the
agreement (`cloud`), after it (`cloud-agreed`) and ending at the day's limit
(`cloud-limit`) or offline (`cloud-offline`); `drafts=several` gives the
example browser two more initiatives beside the one on screen; and
`certified=fail` makes the example Certified refuse to create a project or publish.
With `WEAVE_ACCOUNT_FIXTURE=1` the dev server also publishes support listings for the personal fixture
projects in memory (`dev/matching-fixture.ts`; `/__fixture` with `action=publish-permission` holds them back
for Certified's permission or gives it) and answers the public list and `/api/public-initiative` from
them (`dev/public-fixture.ts`), so a signed-out browser can open Garden commons (fixture) from the list.
`bun run --filter @weave/app prototype` builds the same app with its examples for the review page in
`docs/platform/prototype/preview`; that build alone sets `__WEAVE_PROTOTYPE__`, keeps routes in
the URL fragment and talks to the review page through `src/prototype.ts`. With a fixture the
one account door is the Certified example in `src/social`; without one, the real Certified
sign-in in `src/account` runs. Without that parameter, development uses the real
device draft too.
`import.meta.env.DEV` removes invented records and service simulations from
production. Sign-in uses the same-origin API and stays unavailable until its server configuration is enabled.

## Structure

| Path | Holds |
|---|---|
| `src/routes.ts` | Every page: path, title, whether it is a form page |
| `src/router.tsx` | The small history router and `Link` |
| `src/ui/` | Thin components, one per design-system pattern, named by structure |
| `src/pages/` | Pages composed from `src/ui` |
| `src/describe/` | Validated device drafts, the IndexedDB store of several drafts and its tab sync, the fill that puts words into the four fields, and local extraction adapters |
| `src/intake/` | Need/offer contracts, review rules, local extraction and checked-card text |
| `src/initiative/` | The card's status, one line for where it is kept and one row per action, where it opens, a card started from a Certified project, and the public finish to the intake (`publish-plan.ts`, `publish-run.ts`, `PublishInitiative.tsx`, DL-148), published from the draft with no private save, and Public Listings, beside a card linked to the project, for checking and withdrawing them by the project alone (`ProjectListings.tsx`, DL-155) |
| `src/social/` | Shared initiative/project screens, the live account and project adapter, sharing/publication dialogs, and development-only example services. Reminders and account deletion remain examples. |
| `src/partners/` | Partner suggestions: public evidence matched on the device, shown as direct fits and possible fits, with example teams in development; and the public Certified project list on Initiatives and Home, with the starter sources as its fallback |
| `src/feedback/` | The Feedback tab and sheet on every page, and what it sends to `/api/feedback` (DL-145) |
| `src/funding/` | Validated catalog release, local scoring, optional funding details and example team coverage |
| `api/` | One-line Vercel entry files that re-export `@weave/api` handlers |
| `dev/` | The dev server's `/api` bridge, which answers the way Vercel does, the font preloads, the theme colours and the theme's first-paint script (`public/theme-boot.js`) that the dev server and the build add to `index.html`, the link previews: one copy of `index.html` for each section and `share/records.json` for the record pages (DL-136), written by the build, and the installed app's manifest with its shortcuts and its install-sheet screenshots (`public/install/screens/`, captured from a build with no example data) |
| `scripts/share-images/` | Renders the link-preview pictures in `public/share/` and the home-screen icons with a local browser. The pictures are committed; run it after changing a headline or a template |
| `public/brand/` | Copied from the design system by `scripts/copy-brand.mjs`; ignored by Git |
| `vercel.json` | The Weave project's build, rewrites (seven endpoints share `api/router.ts` to stay within the Hobby plan's 12 functions; a fund's and an initiative's address go to it for their link preview and search data, and `/sitemap.xml` for the sitemap, DL-136), security headers and caching |

## Boundaries

- The app owns no visual CSS. It imports `@regen-commons/design-system/css` once, in
  `src/main.tsx`, and components render the system's markup and `rc-` classes. No
  inline styles, no raw values. A missing pattern goes into the design system first.
- Labels come from [VOICE.md](../design-system/brand/VOICE.md): title case for buttons
  and headings, sentence case for the rest, plain names, no em dashes or arrows. Every
  page has one `h1`, and the tab title echoes it, except on home, whose tab shows the
  product name alone.
- TypeScript follows the [TypeScript rules](../../.claude/rules/typescript.md).
- The theme follows the system until a person chooses one: in Settings, with the header's switch
  on a wide screen (DL-079), or on a phone's You tab (DL-086). All three read and write it through
  `src/theme.ts`, which also says which of index.html's two `theme-color` tags applies (DL-087).
- Signing in only identifies the person. Publishing is its own tap with its own row, shows
  what leaves and who sees it first, and a refusal changes nothing (DL-032). Nothing is saved
  privately or shared for matching any more (DL-155, step 4): the server refuses both by name.
  The private saves made before are no longer listed, opened, downloaded or deleted (step 7, D49),
  and no share is still on. A draft that carries the mark of an earlier private save is a device
  draft: it reads "On this device" and claims no saved copy, while that mark still decides whose
  the card is (DL-055). Only a group project's team workspace, its shared team draft, still takes
  a save (D48).
- Drafts stay on the device until the person makes them public. The browser uses same-origin account endpoints; the server calls Supabase only after configuration. The content security policy in `vercel.json` allows only this origin. Widen it only
  with the change that needs it, such as the Supabase project or model files.
- Keep the words a person said or typed, their files and unfinished edits in the device draft. A
  browser keeps several drafts, each under its own ID, and Start An Initiative never replaces
  one (DL-112). Two tabs on one draft follow latest edit wins: a write compares the stored
  version with the one the tab last saw, and keeps a version another tab wrote as a device
  backup before replacing it. Never add a state that stops a tab or asks it to reload. Storage
  failure must offer text recovery and must not claim the latest changes are saved.
- Device drafts are in the IndexedDB database `weave-drafts`. Never open the released build's
  `weave-device-drafts` with a version number or change its shape: an older tab and a rollback
  still use it (DL-114). `describe/earlier-database.ts` reads it, and the copy deletes nothing.
  Never reload a tab from the service worker: an older build holds some words only on its page,
  and a worker cannot see them. Two builds side by side after a release is expected.
- A card's Certified project is the account's choice, kept in the device's own storage through
  `src/social/project-choice.ts` (DL-119), so a linked card is still linked in a new tab. Read it
  only through that module; `select` in `src/social/live.ts` is its one writer. Do not add it to
  the draft: an older tab parses drafts strictly and refuses a field it does not know. The choice
  is a note, never an access grant, and it also decides whose an unsaved card is (DL-055). So
  store only a link the person made. Opening a team workspace, suggestions a project page left on
  a card, and what an earlier build kept for a tab are not choices: they are never stored, and the
  tab's own storage is never read for one. `linkedProject` in `src/initiative/list.ts` is the one
  rule for what a card is linked to, and a link that is still being stored shows nothing new. A
  workspace the tab opened over an unlinked card is `visit` in the social state, never `project`.
- The describe step is one page (DL-110). Words fill the four fields in place through
  `src/describe/fill.ts`, which never writes over a field the person typed or changed.
  The page asks for three things, the name, the place and what the initiative does, and
  shows no suggested details. A file is read as soon as it is added, and words as a
  speech recognizer writes them, with capitals or without, are read by the spoken rules in
  `names.ts` and `places.ts`, only where the written rules found nothing (DL-127). After
  the plainer words ("we're in", "it's in", "we work in") a place counts only with its
  capital or a country's name, and "we work in" is read only in the person's own words,
  never in a file's. On a wide screen a step's way
  forward goes in the Step bar at the foot of the window through `IntakeStepper`, and in the dock on a phone.
  Structuring goes through `src/describe/structure.ts`, which runs on the device; a cloud
  engine waits for D35 and its own consent. On the four steps nothing opens in the page when
  pressed: use a Status slot for progress and problems, and a dialog for a choice (DL-113).
- Needs and offers are two steps, each with one list, and share the four-card rule and all eight kinds (DL-111). A
  recording ends as one line per need or offer (`src/intake/spoken.ts`), so a list said in one go makes a card for each. `ASK_LIMIT` is
  what adding checks; a list stored with five stays valid, and the server keeps the earlier
  stored limits so saved cards still save. Keep and manual correction freeze a card; reading
  words again preserves those choices and removed source chunks. Linking a Certified project adds pencil entries from its description
  (`src/intake/project-page.ts`), once per project; rebuilding keeps them, and
  they wait without unchecking a list the person already checked. Empty steps may continue; unfinished or unreviewed steps may not. Keep
  the old Describe draft readable when extending its schema.
- The browser model requires an already available capability and a tap. Local
  speech may also ask the browser to install its own speech pack, from a tap, and
  starts only when the browser reports it available on the device: a
  browser-managed pack is a local capability under D32. Where the browser has no
  speech on the device, its own speech service may be used, only after the person
  agrees to a notice that it may send their voice away, and never as a silent
  fallback (`src/describe/speech-consent.ts`, 19 November 2026). Where the browser has
  no speech recognition at all, or its own speech service cannot work here (Brave, or a
  failure this device noted in `src/describe/speech-fallback.ts`), and the server has
  cloud speech on, a person who agrees to its own notice can record, and the recording goes once through `/api/transcribe`
  to the provider the notice names (`src/describe/speech-cloud.ts`, 23 November 2026).
  That module is the only place the app records or sends audio, and a test fails if
  another does. No example records or sends anything: an example of cloud speech shows
  its words and stops there, and `WEAVE_CLOUD_SPEECH_FIXTURE=true` on the dev server
  answers a real local recording with fixed words. App-downloaded models and cloud
  structuring of words stay behind their unavailable adapters until D32 and D35 are
  approved. PDF text runs in a same-origin Worker; unread
  files and pages remain explicitly unread, with original bytes retained.
- Server code belongs in `@weave/api`. A file in `api/` is a single re-export, and
  the entry test fails on anything else.
- funding-commons.vercel.app is a different Vercel project, rooted at the repository
  root. Nothing here changes it.
- Funding imports the authoritative matching, domain and profile vocabularies from
  the root `dist/*.mjs` sources. Keep the rubric and live site intact; do not fork
  the engine into app code. Public catalog JSON is bundled and precached separately
  from private device drafts. Missing screening data must remain explicit.
- Team requirements and coverage remain labelled development examples until D29 and the
  service adapters are ready, and Weave makes no introductions yet. Private views show
  counts only; unknown requirements and counts stay unknown in production.

## Checks

| When | Run |
|---|---|
| Any change | `bun run --filter @weave/app test` and `bun run --filter @weave/app typecheck` |
| Before push | `bun run ci`, which builds and tests every package and the live site |
| Anything people see | Start the `app` server in `.claude/launch.json` (`bun run --filter @weave/app dev`, port 5173) and check 360 px and 1280 px in both themes, with the keyboard, then run the five-minute review |
| The describe flow, a route or a screen's layout | After building the API and the app, `bun run --filter @weave/app e2e`: the flows, axe and, in CI, screenshots, as [e2e/README.md](e2e/README.md) says |

The tests check the route table, that every `rc-` class, form of capital and icon
exists in the design system, that there are no inline styles, raw values or app CSS
files, the voice rules, that each `api/` entry loads and exports only HTTP handlers,
and that the dev `/api` bridge answers like Vercel. Label rendered proof as
`fixture` until the app talks to a backend.
