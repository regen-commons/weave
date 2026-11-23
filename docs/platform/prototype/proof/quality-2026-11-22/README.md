# Quality baseline, 22 November 2026

Accessibility, best practices and SEO are close to done; mobile performance is the gap.
Lighthouse scores accessibility and best practices at 100 on all seven main routes, on
mobile and desktop, in production and in a local production build. SEO scored 90 to 92
everywhere because the site had no `robots.txt`; this change adds one and SEO reaches
100. Desktop performance scores 96 to 100 on most runs. Mobile performance ranges from
49 to 93, held down by the funding catalog download, one large script bundle and four
font preloads.

The manual accessibility review found no contrast, target-size, reflow, reduced-motion,
forced-colours or keyboard failures. Its findings are about comfort at 400% zoom and a
few pieces of copy. VoiceOver was not run (see [Not covered](#not-covered)).

## How it was measured

| | |
|---|---|
| When | 22 November 2026, 7.15 to 7.30 p.m. Pacific (23 November UTC) |
| Production | `https://weave.regencommons.com`, class `production` |
| Local | `develop` at `5557016`, `bun run --filter @weave/app build`, served by `vite preview` on port 4188, class `fixture` (no account, no public project list) |
| Lighthouse | 13.6.0 CLI, all categories, one run per cell. Mobile uses the default emulated Moto G Power with simulated slow 4G and 4x CPU; desktop uses `--preset=desktop` |
| Browser | Chrome for Testing 149.0.7827.22, headless, on macOS |
| Manual checks | The same browser through the Chrome DevTools protocol: 360, 640, 1280 and 320 by 256 px windows, light and dark, forced colours, reduced motion, keyboard only |

Fund is `/funding/local-nlnet`, Describe is `/start/initiative`.

Nine other sessions were running browsers and builds on the same machine. Performance
moved by up to 30 points between identical runs (Home on mobile scored 41, 50, 71, 72
and 73 locally), so read single performance numbers as rough. Local performance numbers serve only to
compare a change before and after under the same load; phase 2 takes its scores from
production or a Vercel preview, as the median of three runs. Accessibility, best
practices and SEO did not move between runs.

Per-run scores, metrics and failing audits are in
[lighthouse-baseline.json](lighthouse-baseline.json).

## Lighthouse baseline

Scores are performance / accessibility / best practices / SEO. LCP, TBT and CLS are
the mobile run's.

### Production

| Route | Mobile | LCP | TBT | CLS | Desktop |
|---|---|---|---|---|---|
| Home | 74 / 100 / 100 / 91 | 6.0 s | 228 ms | 0 | 98 / 100 / 100 / 91 |
| Initiatives | 91 / 100 / 100 / 91 | 3.1 s | 196 ms | 0 | 100 / 100 / 100 / 91 |
| Funding | 66 / 100 / 100 / 91 | 6.0 s | 502 ms | 0 | 98 / 100 / 100 / 91 |
| Fund | 50 / 100 / 100 / 90 | 6.1 s | 1,983 ms | 0 | 97 / 100 / 100 / 90 |
| Describe | 92 / 100 / 100 / 91 | 3.0 s | 176 ms | 0 | 85 / 100 / 100 / 91 |
| Your Initiatives | 92 / 100 / 100 / 91 | 3.0 s | 151 ms | 0 | 76 / 100 / 100 / 91 |
| Settings | 93 / 100 / 100 / 91 | 3.1 s | 130 ms | 0 | 100 / 100 / 100 / 92 |

The two low desktop scores came from blocking time the trace could not attribute to a
script (649 ms "Unattributable" on Your Initiatives), which points at the busy machine
rather than the page.

### Production, 23 November, before #140

Production at main `70897f6` (the UX sessions' work, before this pull request's lazy loading
and prerendering), Lighthouse 13.6.0 in Chrome 149, median of three runs. Performance on
mobile, with its largest contentful paint and total blocking time; desktop scored 100 for
performance on every route. Accessibility and best practices were 100 everywhere. SEO was 91
or 92 everywhere, failing only `robots-txt`, which this pull request adds.

| Route | Mobile | LCP | TBT | Desktop |
|---|---|---|---|---|
| Home | 90 | 3.19 s | 195 ms | 100 |
| Funding | 88 | 3.18 s | 247 ms | 100 |
| Fund | 86 | 3.18 s | 288 ms | 100 |
| Initiatives | 90 | 3.19 s | 207 ms | 100 |
| Describe | 92 | 3.21 s | 136 ms | 100 |
| Your Initiatives | 91 | 3.19 s | 170 ms | 100 |
| Settings | 92 | 3.19 s | 130 ms | 100 |

Every mobile route reached its largest paint at the same 3.2 s, the mark of a page drawn by its
script. The fund page also shifted its footer as the record loaded (CLS 0.069 on mobile).

### Local production build of #140, 23 November

Class: local, for comparison only. #140 at `e45da33`, with develop's first-view work merged
(record pages #190, the describe step #192, Initiatives' early list #194, Funding's first cards
#195 and #197, the describe prompt #196), built and served through a stand-in that sends each
page's own file, routes records through the record-page function and compresses text as Vercel
does. Lighthouse 13.6.0 in Chrome 149, median of three runs, on a machine at a load average of
about 30, which inflates blocking time.

| Route | Mobile | LCP | TBT | Desktop | Largest paint |
|---|---|---|---|---|---|
| Home | 95 | 1.04 s | 238 ms | 100 | the prerendered view, at first paint |
| Funding | 97 | 0.98 s | 200 ms | 100 | the prerendered view with its first cards, at first paint |
| Fund | 99 | 0.94 s | 128 ms | 100 | the record's server-drawn heading and summary, at first paint |
| Describe | 99 | 0.96 s | 106 ms | 100 | the prerendered step, at first paint (CLS 0.035) |
| Your Initiatives | 99 | 0.95 s | 105 ms | 100 | the prerendered view, at first paint |
| Settings | 99 | 0.95 s | 114 ms | 100 | the prerendered view, at first paint |
| Initiatives | 81 | 4.63 s | 174 ms | 97 | a project card, drawn by the app once its code has run |

Accessibility and best practices were 100 on every route; SEO was 100 on the public routes
and 63 on the private ones, the exception under Q-16. What remains: Initiatives' cards are
drawn by the app (a server-drawn list is coming from lists-filters), and blocking time of
100 to 240 ms keeps the other routes just short of 100 on mobile, which production will
measure without this machine's load.

### Local production build

| Route | Mobile | LCP | TBT | CLS | Desktop |
|---|---|---|---|---|---|
| Home | 71 / 100 / 100 / 91 | 7.2 s | 253 ms | 0 | 99 / 100 / 100 / 91 |
| Initiatives | 68 / 100 / 100 / 91 | 4.0 s | 783 ms | 0 | 99 / 100 / 100 / 91 |
| Funding | 63 / 100 / 100 / 91 | 7.1 s | 516 ms | 0 | 99 / 100 / 100 / 91 |
| Fund | 49 / 100 / 100 / 90 | 7.2 s | 1,152 ms | 0.122 | 96 / 100 / 100 / 90 |
| Describe | 85 / 100 / 100 / 91 | 4.0 s | 172 ms | 0 | 87 / 100 / 100 / 91 |
| Your Initiatives | 81 / 100 / 100 / 91 | 3.9 s | 312 ms | 0 | 100 / 100 / 100 / 91 |
| Settings | 86 / 100 / 100 / 91 | 4.0 s | 149 ms | 0 | 100 / 100 / 100 / 91 |

Lighthouse 13.6 also reports a fifth category, agentic browsing, at 46 to 50 on every
route: there is no `llms.txt` and no agent resource manifest. It is outside the four
categories this pass covers; see Q-15.

## Findings

Owners are the sessions working on the QA notes. Ticked items are fixed in this change.

### Performance

- [ ] **Q-01. The funding catalog loads during the first render.** Routes: Home,
  Funding, Fund. Home and Funding fetch the whole catalog (`funders.json`, 3.6 MB, 549 kB
  compressed) as the page renders, then parse and validate it on the main thread.
  Lighthouse counts every request that starts before the largest paint, so this one
  download takes mobile LCP from about 4 s to 6 to 7 s, and the parse drives the fund
  page's 1.2 to 2.0 s of blocking time. The real, unthrottled LCP on Home was 0.62 s,
  and a real trace of Funding with slow 4G and 4x CPU throttling measured 2.5 s, almost
  all of it render delay. The simulation is harsher than a real phone, but it is what
  the score uses.
  Owner: funding-page (`src/funding/client.ts`), with home-shell for Home's
  "Funding closing soon" strip. Fix: start the fetch after the first paint (on idle, or
  when the strip nears the viewport), parse and validate it in a worker, or give Home a
  small closing-soon file written at build time. Quality can add that build step in
  `dev/` if funding-page wants it.
- [x] **Q-02. Every page ships in one script.** Routes: all. `src/App.tsx` imported every
  page statically, so the first visit downloaded 838 kB (251 kB compressed) before
  anything rendered: React DOM 202 kB, Zod 92 kB, `describe/` 79 kB, `partners/` 70 kB,
  `pages/` 65 kB. Fixed in phase 2: each page is its own file (`src/lazy-page.ts`). On the
  23 November build the main script went from 877 kB to 262 kB (83 kB compressed), and a
  first visit to Home loads 677 kB in all. The first page's code arrives before the app
  draws, and a move keeps the page on screen until the next page's code is here, so focus
  still lands on the new page's heading (checked in Chrome: Home to Funding, Back,
  Forward, a fund sheet, a fund page opened directly). Rolldown now writes about 40 small
  shared files; merging them is a follow-up.
- [x] **Q-03. Four font preloads compete with the script on slow phones.** Routes:
  all. The page preloaded four faces (180 kB). With only Space Grotesk and Fraunces
  preloaded, simulated mobile LCP on Settings fell from 4.0 s to 3.3 s and the score rose
  from 86 to 90, the same gain as removing all four. The faces use
  `font-display: optional`, so a face that is not preloaded is not used on a first visit:
  the hero's italic word and reading text show the metric-matched Georgia fallback until
  the second visit, without any layout shift. The user chose to keep the two preloads
  (DL-057, amended 22 November 2026); fixed in `dev/font-preloads.ts`. After the change,
  three mobile runs on Settings scored 53, 91 and 91 (the 53 had 3.2 s of blocking time
  from machine load), with LCP 3.3 s. Captures from a fresh browser profile on fast 4G:
  [first visit at 360, light](local-chrome149-home-first-visit-360-light.jpg),
  [first visit at 1280, dark](local-chrome149-home-first-visit-1280-dark.jpg) and
  [the second visit](local-chrome149-home-second-visit-1280-dark.jpg), where the italic
  word is Fraunces and the lines sit where they did.
- [x] **Q-04. The service worker's register script blocked the first paint.** Routes:
  all. `registerSW.js` loaded as a plain script in the head. Fixed in `vite.config.ts`
  with `injectRegister: "script-defer"`; Lighthouse's render-blocking estimate on Home
  fell from 450 ms to 300 ms. The script still registers the worker on the window's load
  event.
- [ ] **Q-05. The fund sheet shifts the layout as it opens.** Route: Fund, mobile. One
  shift of 0.122 on `dialog.rc-dialog` in the local run; production showed none, so it
  depends on timing. The sheet grows as the record's details arrive. Owner:
  detail-sheet-sharing (`ui/DetailSheet.tsx`) with funding-page (`pages/Opportunity.tsx`).
  Fix: open the sheet at its final height, or open it once the record is ready.
- [ ] **Q-06. A page drawn in the browser cannot reach 100 on mobile.** Routes: all.
  Even with Q-01 to Q-03 fixed, the largest paint waits for the script to download and
  run. Settings, which fetches nothing large, scored 86 to 93 with a simulated LCP of
  3.0 to 4.0 s. A mobile 100 needs roughly 1.5 s, which means sending each route's first
  view as HTML (prerendered at build time and hydrated). The build already writes one
  `index.html` per section for link previews. The user chose to prerender the main
  routes on 22 November 2026; quality builds it in phase 2, after the UX sessions land,
  with drafts and accounts kept client-only.
  Built on 23 November (`dev/prerender.ts`): every static address's HTML carries its first
  view as a visitor sees it, inert until the app replaces it, and the app's scripts now come
  after the stylesheet, fonts and theme script in the head. In a local production build with
  the CPU slowed 4x on Slow 4G (Chrome 149, fixture data), Home's largest paint came at
  2.1 s and Settings' at 2.2 s, from the prerendered view, while the app's scripts finished
  at 7.1 s and 5.1 s; the app's own draw added no later largest paint and did not fade in
  again. The same run before prerendering put Settings' largest paint at about 5.7 s.
  Test locally with a trailing slash (`/settings/`): Vite's preview server sends index.html
  for `/settings`, which Vercel does not. Lighthouse scores wait for a deployment.
- [ ] **Q-07. The first visit downloads 7.1 MB for offline use.** Routes: all. The
  service worker precaches 38 files, 7.1 MB before compression, including the catalog
  (3.6 MB) and the PDF reader (1.7 MB with its worker). This does not affect Lighthouse,
  but it is a lot on a metered phone. Owner: quality (`vite.config.ts`). Fix: cache the
  PDF reader when a person first adds a PDF instead of on install. Decide in phase 2,
  since reading a PDF offline on a first visit would then need a connection once.

### SEO and best practices

- [x] **Q-08. No `robots.txt`.** Routes: all. The rewrite to `index.html` answered
  `/robots.txt` with the app's HTML, which Lighthouse reads as an invalid file (37
  errors). Fixed with `public/robots.txt`, which allows everything except `/api/`. Home
  on mobile now scores SEO 100 locally.
- [ ] **Q-09. No source maps for the main script.** Routes: all. Lighthouse lists it, but
  it carries no weight and best practices stays at 100. No action: publishing source
  maps would only help debugging in production.
- [x] **Q-16. Private and personal pages can be indexed.** Routes: Your Initiatives,
  Your Initiative, Settings, Partners and the describe steps (`/start/*`). Fixed in phase 2:
  their HTML asks not to be indexed and names no canonical page, through
  `withPagePreview`'s `indexed: false` in `@weave/api/page-preview` (`/your-initiatives`
  through its link preview, the others through `dev/prerender.ts`; `/start/initiative`
  follows in detail-sheet-sharing's change to its link preview). Team Workspace is served
  by the catch-all and keeps no tag, since it needs sign-in and a header would need a
  `vercel.json` change. **SEO exception, decided by the orchestrator on 23 November:**
  Lighthouse's `is-crawlable` audit fails every page that asks not to be indexed, by design,
  so these routes score 63 for SEO. Keeping them out of search wins; SEO 100 is counted on
  the public routes only (Home, Funding, Initiatives and the record pages).
- [ ] **Q-17. The main pages name no canonical address.** Routes: Home, Funding,
  Initiatives. Owner: detail-sheet-sharing, which writes every canonical (Home, each
  section copy and each record page) from `withPagePreview` in `@weave/api/page-preview`.
  None goes in `index.html`, because the build copies it into every section page. Quality
  keeps the title and description in each prerendered page.
- [ ] **Q-18. `robots.txt` names no sitemap.** Routes: all. `robots.txt` now ends with
  `Sitemap: https://weave.regencommons.com/sitemap.xml`; the user approved the rewrite to
  detail-sheet-sharing's `/api/sitemap`. Before #140 merges, confirm that address serves
  the sitemap. Search Console verification needs the user's own account; ask the user
  before adding a verification tag or file, and leave DNS alone.

### Accessibility

- [ ] **Q-10. At 400% zoom the fixed bars leave little room to read.** Routes: all. In
  a 320 by 256 px window (1280 by 1024 at 400%) the development banner, the sticky app
  header (65 px) and the bottom navigation (57 px) or the step dock leave about 96 px of
  256 for the page on Home and 85 px on Describe. Nothing scrolls sideways and
  `scroll-padding` keeps focused fields clear of the bars, so this passes WCAG 1.4.10 and
  2.4.11, but reading is cramped. Owner: home-shell (`ui/AppHeader.tsx`,
  `ui/BottomNav.tsx`, the banner in `ui/Page.tsx`) and describe-flow (`ui/Dock.tsx`). Fix:
  on short windows, for example below 30rem tall, let the header and banner scroll with
  the page and keep `scroll-padding` in step. Capture:
  [Describe at 400%](local-chrome149-describe-400pct-light.jpg).
  Related, fixed in phase 2 (A-16 on the accessibility list, WCAG 1.4.12): with text
  spacing raised, the banner's paragraph gained space under it and the stuck header ended
  28 px lower than `--app-header-height` assumed, so it covered the top of Funding's pinned
  Search and Filters row. The app now measures where the stuck header ends
  (`ui/header-height.ts`) and sets that height, which the pinned row and `scroll-padding`
  read. Capture, fixture data in a local production build:
  [Funding at 320 by 568 with text spacing](local-chrome149-funding-320-text-spacing-pin.jpg).
- [ ] **Q-11. The banner reads as one run-on phrase, outside any landmark.** Routes:
  all. "Still in development will be live soon" has no break between its two
  statements, and it sits before the header, so a screen reader moving by landmark
  never meets it. Owner: home-shell (`ui/Page.tsx`). Fix: two sentences, wording per
  VOICE.md, inside the header landmark.
- [ ] **Q-12. The fund sheet shows a raw timestamp.** Route: Fund. "Source deadline 3
  November 2026, 2026-11-03T11:00:00Z." repeats the date as an ISO instant, which a
  screen reader spells out character by character. Owner: funding-page. Fix: give the
  time in words with its time zone, or leave the instant out.
- [ ] **Q-13. Funding opens with two filled status regions.** Route: Funding. "771 of
  771 programs and overview records." and "Showing 24 of 771 programs and overview
  records." are both `role="status"` and filled on arrival. Most screen readers stay
  quiet about a region's first content, but two counts that say nearly the same thing
  should be one. Owner: lists-filters with funding-page. Fix: one status region that
  speaks only when a filter or "show more" changes the count. Confirm with VoiceOver.
- [ ] **Q-14. Catalog names carry em dashes into headings and tab titles.** Routes:
  Funding, Fund, Home. For example "Restack — first call 2026 | Weave". These are the
  funders' own program names, not product copy, so VOICE.md does not strictly apply.
  Owner: funding-research, for a decision on display names.
- [ ] **Q-15. No `llms.txt` or agent manifest.** Routes: all (Lighthouse agentic
  browsing, 46 to 50). Owner: agent-access, as part of its proposal.

### What passed

| Check | Result |
|---|---|
| Lighthouse accessibility | 100 on every route, mobile and desktop, production and local. |
| Contrast | Every visible text element on all seven routes, at 360 px, in light and dark: no element below 4.5:1, or 3:1 for large text. The focus ring is 5.9:1 against the light surface and 8.1:1 against the dark one. |
| Target size | No control under 24 by 24 px except text links in sentences, which WCAG 2.5.8 exempts. The three theme checkboxes on Your Initiatives are 20 px, inside 44 px tall labels. |
| Reflow | No sideways scrolling at 360 px, at 640 by 400 (200% zoom) or at 320 by 256 (400% zoom). Card rows that scroll sideways do so inside their own scrolling list. |
| Reduced motion | With reduced motion on, no element has a running animation or transition, and the mycelium canvas asked for no animation frames in three seconds of pointer movement. |
| Forced colours | Controls, links, the fund sheet, its backdrop and the focus ring stay visible. Capture: [Fund at 1280, forced colours](local-chrome149-fund-1280-forced-colors.jpg). |
| Keyboard | Tab from the top reaches "Skip to content" first; every stop shows the 3 px focus ring. Enter on Funding in the header moves to `/funding`, updates the tab title and puts focus on the `h1`. |
| Structure | `lang="en"`, one `h1` per route, header, main and footer landmarks, labelled navigation, and a title on every route. |

## Not covered

- **VoiceOver.** Turning VoiceOver on changes a system setting, which this session does
  not do. The accessibility tree was read instead, and Q-13 needs a VoiceOver check.
- **Other browsers and real devices.** Safari, Firefox, and phones in the hand were not
  used.
- **Signed-in routes.** Your Initiatives and Settings were checked signed out; the local
  build had no account service.
