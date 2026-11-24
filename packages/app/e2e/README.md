# Interface checks

These run the production build in a real browser: the describe flow end to end, axe on
every route in both themes, pictures of the flow's key steps, and Lighthouse budgets. They
run in the **Interface checks** workflow, apart from the faster Weave app and API checks,
for any change to the app, the API, the design system, the catalog or the lockfile.

```sh
bun run --filter @weave/api build && bun run --filter @weave/app build   # after every change
bun run --filter @weave/app e2e          # flows, axe and screenshots (Chromium)
bun run --filter @weave/app lighthouse   # Lighthouse budgets
```

The first run on a machine may need `./node_modules/.bin/playwright install chromium` in
`packages/app`. On a Mac without Google Chrome, give Lighthouse Playwright's Chromium with
`CHROME_PATH`.

## The server

`serve.mjs` serves `dist` as Vercel serves the Weave project, adapted from the quality
session's stand-in: a page with a file of its own gets that file, `/funding/:id` and
`/initiatives/:id` go to the record-page function, and text is compressed. It starts
`vite preview` beside itself for assets and `/api`. The tests start their own server on
port 4796, never one already running: the preview server keeps the record page it read
when it started, so a server started before the last build answers with an old page. The
`app-production` launch configuration runs the same server on 4790 for a person to look at.

The tests use full Chromium in its new headless mode (`channel: "chromium"`). Playwright's
lighter headless shell crashed on the describe step on 23 November 2026, which no
person's browser does.

## What is checked

- **`describe.spec.ts`**: typing through all three steps to a checked card; speech, with a
  stand-in on-device recognizer (`fake-speech.ts`) that says a script without punctuation,
  filling the fields on step 1 and making a card for each need said in one go, with no
  press after Stop; and changing a checked card's name and coming back to the card.
- **`axe.spec.ts`**: WCAG 2.2 AA (axe's `wcag2a` to `wcag22aa` rules) on every page a
  person can reach without an account, a first visit, and again with a checked card, in
  light and dark, at 360 and 1280. A failure names each rule, its impact and the elements.
- **`screenshots.spec.ts`**: the flow's five key steps at 360 and 1280, against the
  pictures in `screenshots/`. The background growth is hidden, and on Your Initiative the
  Funding and Partners sections are masked, since the catalog and the public list change
  on their own.
- **`../lighthouserc.json`**: Lighthouse 13.6 on mobile, the median of three runs, on seven
  routes. Accessibility and best practices must be 100 everywhere, SEO 100 on the public
  pages (the private ones are kept out of search on purpose), layout shift at most 0.1,
  and each route's performance at least its budget. Largest contentful paint over 2 s, the
  PRD's bar, is a warning for now.

| Route | Performance budget | Local, 23 November 2026 | LCP |
|---|---:|---:|---:|
| Home | 85 | 94 | 1.8 s |
| Initiatives | 70 | 81 | 4.5 s |
| Funding | 85 | 90 | 1.0 s |
| A fund | 90 | 96 | 1.0 s |
| Describe | 90 | 98 | 0.9 s |
| Your Initiatives | 90 | 99 | 1.0 s |
| Settings | 90 | 99 | 0.9 s |

The local numbers are one run each on a busy machine. The budgets leave about ten points
for a runner's noise; raise each one toward its median once a few runs on GitHub have
shown how much they move, and toward 100 as the pages improve. Initiatives is drawn by the
app once its list arrives, so it is the one far from the 2 s bar.

## When a picture changes

The pictures are taken and compared only in the Playwright Linux image the workflow runs
in (`mcr.microsoft.com/playwright:v1.65.1-noble`); elsewhere the test is skipped, because
fonts draw differently. When a picture differs, the workflow takes all of them again in
the same image and keeps them as the `screenshots` artifact, with the failing comparison
in `interface-report`. If the change is intended, download the artifact, put its files in
`screenshots/`, look at each one, and commit them with the change. A local trial run can
take pictures with `WEAVE_SCREENSHOTS=1` and `WEAVE_SCREENSHOT_DIR` pointing outside the
repository; never commit those.

## Not covered

A real recognizer and the cloud speech recording (`speech-cloud.ts`), signed-in flows,
an initiative's record page (it needs the public project list), Safari and Firefox, and
the live site.
