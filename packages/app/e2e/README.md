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
session's stand-in, and reads `vercel.json` so a change there reaches the checks. A file
the build wrote is sent as it is, and a page with an `index.html` of its own gets that;
otherwise the first matching rewrite decides, so `/initiatives` goes to its server-drawn
page and `/funding/:id` to the record page; every response carries the headers
`vercel.json` gives its address, the content security policy included; and text is
compressed. `vite preview` runs beside it for built files and `/api`. The tests start
their own server on port 4796 and Lighthouse on 4800, never one already running: the
preview server keeps the record page it read when it started, so a server started before
the last build answers with an old page. The `app-production` launch configuration runs
the same server on 4790 for a person to look at.

The tests use full Chromium in its new headless mode (`channel: "chromium"`). Playwright's
lighter headless shell crashed on the describe step on 23 November 2026, which no
person's browser does.

## What is checked

- **`account-refresh.spec.ts`** tests a signed-in Home refresh with delayed account and
  workspace responses. It measures the header and both actions before the app starts,
  while it checks the session, and once the workspace is ready. It also checks that
  Sign In returns if the request fails.
- **`describe.spec.ts`**: typing through all three steps to a checked card; speech, with a
  stand-in on-device recognizer (`fake-speech.ts`) that says a script without punctuation,
  filling the fields on step 1 and making a card for each need said in one go, with no
  press after Stop; and changing a checked card's name, which comes straight back to the
  card with one Continue.
- **`axe.spec.ts`**: WCAG 2.2 AA (axe's `wcag2a` to `wcag22aa` rules) on every page a
  person can reach without an account, empty steps included, on a first visit and again
  with a checked card, in light and dark, at 360 and 1280. Each scan waits until the app
  has taken over the prerendered page and nothing is still loading. A failure names each
  rule, its impact and the elements.
- **`screenshots.spec.ts`**: the flow's five key steps at 360 and 1280, against the
  pictures in `screenshots/`, with the background growth hidden.
- **`../lighthouserc.json`**: Lighthouse 13.6 on mobile, the median of three runs, on seven
  routes. Accessibility and best practices must be 100 everywhere, SEO 100 on the
  public pages (the private ones are kept out of search on purpose), layout shift at most
  0.1, and each route's performance at least its budget. Largest contentful paint over 2 s,
  the PRD's bar, is a warning for now. `test/lighthouse-config.test.ts`, in the ordinary
  app tests, fails if an address loses its budget, since Lighthouse CI drops a budget whose
  pattern matches nothing without a word.

| Route | Budget | Local, one run | GitHub, median of 3 (two runs) | LCP on GitHub |
|---|---:|---:|---:|---:|
| Home | 85 | 94 | 99 | 0.9 s |
| Initiatives | 75 | 84 | 86 | 4.1 s |
| Funding | 85 | 97 | 99 | 0.9 s (3.2 s once) |
| A fund | 85 | 98 | 99, 85 | 0.9 s (3.8 s once) |
| Describe | 90 | 96 | 99 | 0.9 s |
| Your Initiatives | 90 | 99 | 100 | 0.9 s |
| Settings | 90 | 99 | 100 | 0.9 s |

Measured on 23 November 2026. One GitHub run had Funding's and a fund page's largest paint
at 3 to 4 s and the fund page at 85, and the next had both at 0.9 s, so a runner can swing
a route by about 15 points; the budgets sit below that. Raise each toward its median once
more runs have shown the spread, and toward 100 as the pages improve. Initiatives is the
one far from the 2 s bar.

## When a picture changes

The pictures are taken and compared only in the Playwright Linux image the workflow runs
in (`mcr.microsoft.com/playwright:v1.65.1-noble`, pinned by digest), where the workflow
sets `WEAVE_SCREENSHOTS=1`; everywhere else the test is skipped, because fonts draw
differently. On Your Initiative only the card itself is pictured, since funding and
partners change with the catalog and the public list. When a picture differs, the workflow takes all of them again in
the same image and keeps them as the `screenshots` artifact, with the failing comparison
in `interface-report`. If the change is intended, download the artifact, put its files in
`screenshots/`, look at each one, and commit them with the change. A local trial run can
take pictures with `WEAVE_SCREENSHOTS=1` and `WEAVE_SCREENSHOT_DIR` pointing outside the
repository; never commit those.

## Not covered

A real recognizer and the cloud speech recording (`speech-cloud.ts`), live sign-in,
an initiative's record page (it needs the public project list), Safari and Firefox, and
the live site.
