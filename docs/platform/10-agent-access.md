# Agent access: MCP and WebMCP

Status: first slice approved by the user and built on 22 November 2026, switched off; the later slices are still proposals · Date: 2026-11-22
Companions: [PRD interoperability requirements](04-prd.md#7-functional-requirements) · [technical spec, interoperability](05-technical-spec.md#10-interoperability-r29-to-r32) · [technical spec, security](05-technical-spec.md#12-security-and-privacy) · [repository layout](09-repository-layout.md) · [open decisions](open-decisions.md#agent-access)

People increasingly ask an assistant instead of opening a site. This proposal lets them add Weave to that assistant, so it can search the fund catalog and the public project list and link back to Weave. It starts with public, read-only data over the Model Context Protocol (MCP), then offers the same tools inside the browser through WebMCP. The user approved the first slice on 22 November 2026 (D37, D38), and it is built but switched off: see the [endpoint notes](../../packages/api/MCP.md). The same day the user also approved ranking funds for a description on the server as a second slice (D39), and `llms.txt` now with `ard.json` once the endpoint is live (D44). Neither is built. Everything else here is still a proposal. The questions it raises are D37 to D44 in [open decisions](open-decisions.md#agent-access).

## Recommendation

Build one small MCP endpoint at `https://weave.regencommons.com/api/mcp`, as a handler in `packages/api` with no new dependency. It answers four read-only tools from data Weave already publishes, takes no sign-in, stores nothing and is off until an environment switch turns it on. WebMCP and signed-in tools follow as separate slices, each with its own approval.

## Who it serves

| Who | What they get | Today |
|---|---|---|
| Someone at an initiative who works with an assistant (Claude, ChatGPT, Cursor, Gemini) | "Which funds support watershed restoration in Brazil, and which close soonest?" answered from the catalog, with the official source and a Weave link for each | They open Weave and filter by hand |
| Stewards and network weavers | Quick lookups across funds and public projects while writing a pulse or preparing a call | Same |
| The Regen Commons Telegram agent | A Weave read tool. Its README says it has none | No access |
| Partner networks and builders | A documented, standard way to read Weave's public data from their own agents | The catalog JSON, undocumented |

It does not serve crawlers that want the whole dataset. They can already download the catalog file, and bulk export belongs to [R29](04-prd.md#7-functional-requirements).

## What Weave can expose today

| Data | Where it lives now | Public? |
|---|---|---|
| Fund catalog: 699 funds and 730 programs, with access, amounts, deadlines, sources and research dates | `dist/data/funders.json`, built by the catalog importer and loaded by the app | Yes, served as a static file |
| Public Certified projects: name, publisher, place, kinds of work, the project's own passages | `GET /api/public-projects`, answered from a one-minute copy of the index | Yes, by the [15 November decision](open-decisions.md#all-listed-public-certified-projects-decided-15-november-2026) |
| Funding fit for an initiative | The catalog's rubric (`dist/matching.mjs`), run in the browser so the description stays on the device | The rubric is public; the description is private |
| Saved initiatives, needs, offers, partner matches, saved leads | `/api/account`, `/api/matching`, behind Certified sign-in | No |
| Shared Weave initiatives | Shared with Weave users only. There is no public initiative page yet ([D26](open-decisions.md#for-the-council)) | No |

So a `search_initiatives` tool has nothing public to search yet. The public records that describe groups doing the work are Certified projects, and the tools name them that way.

## Tools

Tool names use the platform's terms: fund, program, project. Results say "fit" and "to check", never "eligible", because an opportunity is never an eligibility decision. Every tool is read-only and says so in its annotations (`readOnlyHint`).

### Slice 1: public search and read

| Tool | Input | Returns |
|---|---|---|
| `search_funds` | `query` (words), optional `region`, `sector`, `access` (open now, rolling, by invitation), `deadline_before`, `limit` up to 24, `cursor` | Funds and their programs: identifier, name, summary, access, amount, deadline, the date research last checked it, the official source link and the Weave link |
| `get_fund` | A fund or program identifier | The full record: programs, conditions to check, evidence with dates, source warnings |
| `search_projects` | `query`, optional `organization_type`, `work_scope`, `sort`, `limit` up to 24, `cursor` | Public Certified projects: address, name, publisher, place, passages, when Weave last read it, the Certified source link and the Weave link. Also how fresh the index is (`bounded`, `partial` or `stale`) |
| `get_project` | A project address | One project's card |

As built, `get_project` returns the same card `search_projects` does, found by address in the copy of the list the function already holds.

`search_funds` reuses the catalog's own filtering and keyword index, and `search_projects` calls the reader behind `/api/public-projects`, so the app and the tools cannot disagree. The assistant's own model does the reasoning about fit in this slice. Weave returns records and their evidence.

### Slice 2: funding fit for a description

`find_funds_for_initiative` takes a description and optional details (countries, applicant type, funding range) and returns the catalog rubric's ranked programs with the reasons and what still needs checking.

This is the first tool where a person's own words reach Weave's server. In the app the same ranking runs on the device, and that is a stated privacy position ([spec 12](05-technical-spec.md#12-security-and-privacy)). The tool would rank in memory, store nothing and log nothing, and its description would tell the assistant so. It still changes what Weave's server sees, so it is its own decision ([D39](open-decisions.md#agent-access)). The on-device alternative is WebMCP, below.

### Later: signed-in tools

"My initiatives", partner matches, saving a lead and anything that writes need the person's account. Under the MCP authorization rules the endpoint becomes an OAuth 2.1 resource server: it serves protected resource metadata (RFC 9728), checks that each token was issued for Weave (RFC 8707) and answers 401 otherwise. Certified is Weave's only sign-in, so Certified, or the existing server bridge, would have to issue those tokens.

This is critical-tier work that touches sessions, consent and sharing. An assistant acting for a person would also need its own entry in the consent story: which assistant, which initiative, read or write, and how to withdraw it. The recommendation is to wait until slice 1 shows real use, then write a separate proposal ([D42](open-decisions.md#agent-access)).

## Hosting and transport

- **Where.** A handler at `packages/api/src/mcp.ts`, reached through the shared router function, as the [API guide](../../packages/api/AGENTS.md#how-a-handler-is-deployed) describes. The first plan was a function of its own, but Vercel's Hobby plan deploys at most 12 functions and Weave was at the limit, so `/api/mcp` is one line in the router's endpoint list and one rewrite in `packages/app/vercel.json`. It needs no new Vercel project. A separate service was considered and rejected: the data and its readers live here, and a second deployment would need its own copy of both.
- **Shared tool definitions.** Names, descriptions, input schemas and result shapes live in one contract module in `packages/api`, exported the way the other contracts are. The MCP handler and the later WebMCP registration both read it, each supplying its own data source.
- **Transport.** Streamable HTTP, stateless, answering each POST with one JSON response. No sessions, no server-sent stream, nothing held between requests, which suits a Vercel function.
- **Protocol versions.** The current MCP revision is 2026-07-28 (checked 22 November 2026 against the [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). It removed `initialize`, sessions and the GET stream, and a tools-only server answers `server/discover`, `tools/list` and `tools/call`. Clients on the 2025 revisions still open with `initialize`, so the endpoint answers both: about six methods and a few header checks.
- **No dependency.** The handler is hand-written, in the style of the package's other handlers. The official `@modelcontextprotocol/server` 2.x (Apache-2.0, two dependencies including zod 4) and Vercel's `mcp-handler` are the alternative. They would track future protocol revisions for us at the cost of two or three new packages in a critical-tier package that has avoided them ([D38](open-decisions.md#agent-access)).
- **Catalog in a function.** The handler reads the same `funders.json` the app ships. A preview deployment has to prove the compiled function finds that file; if it cannot, the fund tools return a stable `catalog_unavailable` error and the project tools keep working.

## Limits and abuse

- **Off by default.** `WEAVE_MCP_ENABLED` must be `true`, as `WEAVE_PROJECTS_ENABLED` works today. Unset, the route answers 404. Turning it on in Vercel is the user's step.
- **No database load per call.** Funds come from memory. Projects come from the existing one-minute copy of the index, so a burst of tool calls costs the shared database nothing more than the public list already does.
- **Bounded requests.** POST only, JSON only, bodies capped at 16 KB, queries at the existing 100 characters, pages at 24 records, one request per POST. Unknown fields and tools are refused with stable error codes.
- **Origin.** The MCP transport requires a 403 for an invalid `Origin`. Requests with no `Origin` (assistants calling from their servers) and same-origin requests pass. Other origins are refused until someone asks for one. The handler never reads cookies, so it cannot act for a signed-in person.
- **Rate limit.** One Vercel Firewall rule on `/api/mcp`, by IP address. Rate limit rules are set in the dashboard, not in `vercel.json`, and the Hobby plan includes one. That is a Vercel settings change, so it needs the user's approval ([D40](open-decisions.md#agent-access)).
- **Text written by others.** Project passages and funder descriptions are other people's words and could carry instructions aimed at an assistant. MCP has no marker for untrusted content, so results keep that text in named fields, the tool descriptions say it is quoted source material, and the existing contract already strips control characters.
- **Logging.** Tool name, outcome and duration only. Never arguments, since a query can hold someone's private plans.
- **Attribution.** Each record carries its official source and the date research checked it. The data licence for public records is still open ([D4](open-decisions.md#for-the-council)); the server's instructions would state it once decided.

## Discovery files

The quality baseline (finding Q-15, 22 November 2026) reports that Lighthouse 13.6 scores Weave 46 to 50 in its "agentic browsing" category, because the site has no `llms.txt` and no agent resource manifest. Both are small static files, and both belong with this work because they tell an assistant what Weave is and where its tools are.

| File | Served at | What it lists | Ships |
|---|---|---|---|
| `packages/app/public/llms.txt` | `/llms.txt` | A plain Markdown summary: what Weave is in two sentences; links to Funding, Partners and the privacy page; the fund catalog file and what its fields mean; that results are possibilities to check and never eligibility decisions; that private initiatives are not readable; and, once it is on, the MCP endpoint and its four tools | With slice 1. The endpoint lines are added when the switch is turned on |
| `packages/app/public/.well-known/ard.json` | `/.well-known/ard.json` | One entry, valid against the [ARD specification](https://agenticresourcediscovery.org/spec): the Weave MCP server, its URL, transport (Streamable HTTP), that it needs no sign-in, and its tool names | Only when the endpoint is on in production ([D40](open-decisions.md#agent-access)), so it never points at a route that answers 404 |

The quality session checked both audits against the Lighthouse 13.6.0 source on 22 November 2026:

- The `llms.txt` audit needs a Markdown file with at least one top-level heading.
- The manifest audit looks for an `Agentmap:` line in `robots.txt`, then `<link rel="ard">`, then a `Link` header with `rel="ard"`, then `/.well-known/ard.json`. It tries `/.well-known/ai-catalog.json` only after those, and scores that lower with a warning. The manifest has to validate against the ARD specification.
- Both audits score 0 today because the app's catch-all rewrite answers every missing path, these two included, with the app's HTML and status 200.

Files in `public/` are copied into the build and served before the rewrite, so real files need no `vercel.json` change. `public/` belongs to the quality session, so the files are theirs to add from the content agreed here.

That leaves a choice for the time before the endpoint is live ([D44](open-decisions.md#agent-access)). Shipping `llms.txt` now fixes the first audit. The manifest audit then stays at 0 until `ard.json` ships with the endpoint, unless `/.well-known/ard.json` is made to answer 404 in the meantime, which makes the audit not applicable but is a `vercel.json` change and so needs the user's approval.

## WebMCP

WebMCP lets a page register tools that an agent in the browser can call, instead of the agent reading and clicking the interface. Checked on 22 November 2026:

- It is a [draft Community Group report](https://webmachinelearning.github.io/webmcp/) (19 November 2026), not on the standards track.
- Chrome has it in an origin trial (149 to 156) and behind `chrome://flags/#enable-webmcp-testing`. It is not on by default. Edge has an origin trial, Mozilla is neutral and WebKit opposes it.
- The entry point moved this year from `navigator.modelContext` to `document.modelContext`, with `registerTool`, and tools can carry `readOnlyHint` and `untrustedContentHint`. A declarative form (`toolname` and `tooldescription` attributes on a form) also exists.
- We could not confirm that Gemini in Chrome, or any assistant people actually use, calls these tools yet. Chrome's documents name demo extensions.

How Weave would use it:

- The app registers the same tools from the shared contract when `document.modelContext` exists, and does nothing otherwise. No polyfill, no dependency.
- The tools run in the page. `find_funds_for_initiative` calls the rank worker the Funding page already uses, so the description never reaches Weave's server. That makes WebMCP the natural home for the private half of matching, and later for tools that act on the draft on the device.
- Results set `untrustedContentHint` where they carry publisher text.
- Testing uses the chrome-devtools MCP (`list_webmcp_tools`, `execute_webmcp_tool`), which needs Chrome 150 or later started with `--enable-features=WebMCP`.

The recommendation is to build this after the MCP slice, behind feature detection, and not to join the origin trial yet ([D41](open-decisions.md#agent-access)). A trial token is a deployment change, the interface has changed once already, and no everyday assistant is known to call the tools. Registering tools in the app shell touches files other sessions own, so it goes through them.

## How it fits the plan

- It is the plan's "one node, not a silo" position applied to assistants. MCP sits beside Murmurations and KOI in the Exchange layer of the [logical architecture](03-logical-architecture.md), as a way to read, not a federation protocol.
- It adds no domain concept. Tools return funds, programs and projects as the catalog and the index already define them, and link to Weave for anything a person should decide.
- It keeps the consent line where it is: public data is open, private entries stay private, and nothing a person wrote is stored or shared by a tool.
- The whole of `packages/api` is a critical surface, so every slice gets the failure-path tests and second review that tier requires.

## First slice

1. The tool contract, with `search_funds`, `get_fund`, `search_projects` and `get_project`.
2. The handler, routed through the shared router function, behind `WEAVE_MCP_ENABLED`, answering both protocol eras.
3. Tests for each tool, each refusal (method, origin, size, unknown tool, bad arguments, switch off) and both handshakes, using fixtures.
4. A local demo: Claude Code added with `claude mcp add --transport http weave http://localhost:5190/api/mcp`, listing and calling each tool. Labeled `fixture`.
5. A short "Add Weave to your assistant" section in the API package's documents. A public page in the app waits for the owning sessions.
6. The content for `/llms.txt`, handed to the quality session, which owns `public/`.

Not in this slice: the description tool, WebMCP, sign-in, a registry listing, the agent manifest, the Firewall rule and turning the switch on in production. Each needs its own yes.

## What needs a person

- Approve the slice, or change it ([D37](open-decisions.md#agent-access), [D38](open-decisions.md#agent-access)).
- Decide whether a description may be ranked on Weave's server ([D39](open-decisions.md#agent-access)).
- Add the Firewall rule and set `WEAVE_MCP_ENABLED` when the preview proof is in ([D40](open-decisions.md#agent-access)).
- Decide when Weave is listed in the MCP registry and in assistants' connector directories. That is publishing, so it is never part of a build step ([D43](open-decisions.md#agent-access)).
