# API package

Use the [root guide](../../AGENTS.md) for shared workflow. `@weave/api` holds Weave's
server functions: the consented cloud AI proxy, sharing, introductions, the pulse and
the catalog, as [spec 2](../../docs/platform/05-technical-spec.md#2-system-context)
lists. It includes the health check and private account sign-in, save and load. The public, read-only
MCP endpoint for assistants is described in [MCP.md](MCP.md). This whole package is a critical surface:
read every touched line and prove the failure paths.

## How a handler is deployed

Vercel only serves functions from `api/` under a project's root directory, and the
Weave project's root is `packages/app`. So each handler lives here, in
`src/<name>.ts`, exported through this package's `exports`, and
`packages/app/api/<name>.ts` re-exports it in one line. Write no logic in the entry
file. Handlers use the Web signature: export `GET`, `POST` and so on, taking a
`Request` and returning a `Response`. They run on the Node runtime, never Edge.

Each handler's `exports` entry has three targets. `types` and the `source` condition
point at `src/<name>.ts`, which type checks, tests and the app's dev server read. The
default target is the compiled `dist/<name>.js`, which the deployed function imports:
Vercel ships the TypeScript it compiles as `.js`, so an export that points at a `.ts`
file fails to load once deployed. `bun run build` writes `dist/`, and the Weave
project builds this package before the app. `src/exports.test.ts` checks every entry.
In development, the app's Vite server answers `/api/*` from the same entry files.

Vercel's Hobby plan deploys at most 12 functions, so most endpoints share one,
`packages/app/api/router.ts` (`src/router.ts`). Only an endpoint that needs an address,
a duration or a cron of its own gets its own entry file: the account, sign-in, the four
Certified addresses and the daily index refresh. To add an endpoint to the router, give
it a line in `ENDPOINTS` in `src/router.ts` with exactly the methods it exports, and a
rewrite in `packages/app/vercel.json` from `/api/<name>` to
`/api/router?__route=<name>`, ahead of the catch-all. The router hands the request on
untouched (streamed body, headers, origin) and returns the handler's response as it is.

A record's link picture (`GET /api/record-image`, `src/record-image*.ts`) is drawn by
`@vercel/og` 0.9.0, the newest version that runs as an ES module in Node without
`sharp`. Its faces are TrueType files in `assets/record-image`, written from the design
system's fonts by `scripts/record-image-fonts.swift`. Run that on macOS after a font
changes. A picture draws only characters its faces have, because the renderer would
otherwise fetch a font from Google at run time. Raise `RECORD_IMAGE_DESIGN` whenever the
drawing changes, so every picture gets a new address past the CDN's year-long cache.

## Boundaries

- TypeScript follows the [TypeScript rules](../../.claude/rules/typescript.md).
- Secrets live only in Vercel and Supabase settings. Never commit one, log one or
  return one. No service-role key: data calls use the person's own token, so
  row-level security still applies.
- Validate methods, bodies, identifiers and sizes at the handler boundary, and cap
  bodies at 64 KB. Write endpoints require a same-origin `Origin` header and JSON.
  `/api/transcribe` is the one exception to the size and to JSON: it takes one audio
  recording of up to 3 MB, and still requires the same-origin `Origin` header. It
  stores and logs nothing, and needs no sign-in, so nothing in it may depend on who
  is asking.
- Give every outbound call a timeout. Return stable error codes, never a raw provider
  response or personal data, and log neither.
- Cloud AI runs only after consent that names the provider, model, region and
  retention, and records hashes and derived fields, not prompts
  ([spec 6.6](../../docs/platform/05-technical-spec.md#66-consented-cloud-fallback-r10)).
- Local and test runs use synthetic providers. A fixture must never fall through to a
  live service.

## Checks

| When | Run |
|---|---|
| Any change | `bun run --filter @weave/api test` and `bun run --filter @weave/api typecheck` |
| A new or renamed handler | Also `bun run --filter @weave/app test`, which checks every entry file |
| Before merge | A preview deployment answering the route, labeled `preview` |
