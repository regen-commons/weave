# App package

Use the [root guide](../../AGENTS.md) for shared workflow and the
[design skill](../../.claude/skills/design/SKILL.md) for anything people see.
`@weave/app` is Weave: a React 19 PWA built with Vite, in TypeScript, with no CSS
framework. It is the root directory of the Weave Vercel project. Read the
[app dialect](../design-system/dialects/app.md) before changing a screen.

The route table in [src/routes.ts](src/routes.ts) owns pages and their section cues.
Home, frame, lists, the three-step intake through Finish, Funding and opportunity
detail are built. Initiative details follow in later steps. Settings now provides the private account connection. Development fixtures require an
explicit `?fixture=draft` (or visitor, private, shared); `view` selects Describe
states; `intake` selects Needs, Offers and Finish examples. Without that parameter,
development uses the real device draft too.
`import.meta.env.DEV` removes invented records and service simulations from
production. Account saving uses the same-origin API and stays unavailable until its server configuration is enabled.

## Structure

| Path | Holds |
|---|---|
| `src/routes.ts` | Every page: path, title, whether it is a form page |
| `src/router.tsx` | The small history router and `Link` |
| `src/ui/` | Thin components, one per design-system pattern, named by structure |
| `src/pages/` | Pages composed from `src/ui` |
| `src/describe/` | Validated device draft, IndexedDB writer and local extraction adapters |
| `src/intake/` | Need/offer contracts, review rules, local extraction and checked-card text |
| `src/funding/` | Validated catalog release, local scoring, optional funding details and example team coverage |
| `api/` | One-line Vercel entry files that re-export `@weave/api` handlers |
| `dev/` | The dev server's `/api` bridge, which answers the way Vercel does |
| `public/brand/` | Copied from the design system by `scripts/copy-brand.mjs`; ignored by Git |
| `vercel.json` | The Weave project's build, rewrites, security headers and caching |

## Boundaries

- The app owns no visual CSS. It imports `@regen-commons/design-system/css` once, in
  `src/main.tsx`, and components render the system's markup and `rc-` classes. No
  inline styles, no raw values. A missing pattern goes into the design system first.
- Labels come from [VOICE.md](../design-system/brand/VOICE.md): sentence case, plain
  names, no em dashes or arrows. Every page has one `h1`, and the tab title echoes it,
  except on home, whose tab shows the product name alone.
- TypeScript follows the [TypeScript rules](../../.claude/rules/typescript.md).
- The theme follows the system. There is no theme toggle in the header.
- Drafts stay on the device until the person saves. The browser uses same-origin account endpoints; the server calls Supabase only after configuration. The content security policy in `vercel.json` allows only this origin. Widen it only
  with the change that needs it, such as the Supabase project or model files.
- Keep raw unfinished answers, links and review edits in the device draft. Compare
  stored revisions before writing; preserve both tabs' words on a conflict. Storage
  failure must offer text recovery and must not claim the latest changes are saved.
- Needs and offers share the five-card rule and all eight kinds. Keep and manual
  correction freeze a card; rebuilding preserves those choices and removed source
  chunks. Empty steps may continue; unfinished or unreviewed steps may not. Keep
  the old Describe draft readable when extending its schema.
- Local speech and the browser model require an already available capability and
  a tap. Downloaded models and cloud calls stay behind their unavailable adapters
  until D32 and D35 are approved. PDF text runs in a same-origin Worker; unread
  files and pages remain explicitly unread, with original bytes retained.
- Server code belongs in `@weave/api`. A file in `api/` is a single re-export, and
  the entry test fails on anything else.
- funding-commons.vercel.app is a different Vercel project, rooted at the repository
  root. Nothing here changes it.
- Funding imports the authoritative matching, domain and profile vocabularies from
  the root `dist/*.mjs` sources. Keep the rubric and live site intact; do not fork
  the engine into app code. Public catalog JSON is bundled and precached separately
  from private device drafts. Missing screening data must remain explicit.
- Team requirements, coverage and introductions remain labelled development
  examples until D29 and the service adapters are ready. Private views show counts
  only; unknown requirements and counts stay unknown in production.

## Checks

| When | Run |
|---|---|
| Any change | `bun run --filter @weave/app test` and `bun run --filter @weave/app typecheck` |
| Before push | `bun run ci`, which builds and tests every package and the live site |
| Anything people see | Start the `app` server in `.claude/launch.json` (`bun run --filter @weave/app dev`, port 5173) and check 360 px and 1280 px in both themes, with the keyboard, then run the five-minute review |

The tests check the route table, that every `rc-` class, form of capital and icon
exists in the design system, that there are no inline styles, raw values or app CSS
files, the voice rules, that each `api/` entry loads and exports only HTTP handlers,
and that the dev `/api` bridge answers like Vercel. Label rendered proof as
`fixture` until the app talks to a backend.
