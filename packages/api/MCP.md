# Weave for assistants: the MCP endpoint

`/api/mcp` lets an assistant read Weave's public data through the Model Context Protocol. The
[agent access proposal](../../docs/platform/10-agent-access.md) explains why and what comes later.

## What it offers

Five read-only tools, defined in `src/agent-tools-contract.ts`:

| Tool | Reads |
|---|---|
| `search_funds` | The fund catalog, by words, region, sector, access and deadline |
| `get_fund` | One fund with its programs, evidence and sources, or one program as `fund::program` |
| `find_funds_for_initiative` | The fund catalog, ranked for a description the person gives, with the rubric the Funding page uses |
| `search_projects` | The public Certified projects Weave lists, as `/api/public-projects` does |
| `get_project` | One of those projects by its address |

Results are possibilities to check, never eligibility decisions. The endpoint takes no sign-in, reads no
cookie and stores nothing. Its log holds a tool's name, outcome and duration, never its arguments.

`find_funds_for_initiative` is the one tool that takes a person's own words. In the app that ranking runs
on the device; here the description reaches Weave's server, which the user approved on 22 November 2026
([D39](../../docs/platform/open-decisions.md#agent-access)). The server ranks in memory and keeps nothing:
the description is not stored, logged or cached, and the tool's own description tells the assistant so.
The answer does carry what the description has in common with each program: theme names from a fixed list
(such as "energy access"), a country or region the program names, or a word that also appears in that program's
published focus (DL-143). It goes only to the caller. A test in `src/mcp.test.ts` checks that it never reaches the log.

## Switching it on

The route answers 404 until `WEAVE_MCP_ENABLED=true` is set for the deployment. Project tools also need
the public project list to be on (`WEAVE_PUBLIC_PROJECTS_ENABLED`). Turning either on in Vercel, and
adding a Firewall rate limit rule for `/api/mcp`, are the maintainer's steps
([D40](../../docs/platform/open-decisions.md#agent-access)).

The switch is on for Preview and Production (23 November 2026). Two things were meant to come first, and
both are done:

- **A preview deployment that answers the route: done for four tools.** The compiled function imports
  the catalog's code and data from the repository root, outside the Weave project's root directory. On a
  preview of `develop` on 23 November 2026, `tools/list`, `search_funds` and `get_fund` answered with
  catalog data, so those files ship. `find_funds_for_initiative` reads three more files the same way
  (`dist/matching.mjs`, `dist/data/eligibility-rules.json`, `dist/data/program-conditions.json`) and had
  not been called on a deployment when this was written. If one is missing it answers
  `catalog_unavailable` and the other tools keep working.
- **The Firewall rate limit rule: done.** "Rate limit MCP" was published on 23 November 2026, on the
  user's word. It is described under [Limits](#limits). The endpoint's own limit bounds one function
  instance; the rule is what bounds a caller across instances, before a function runs.

## Adding it to an assistant

Once it is on, any client that speaks Streamable HTTP can add the address with no sign-in:

```bash
claude mcp add --transport http weave https://weave.regencommons.com/api/mcp
```

Other assistants take the same address in their custom connector or MCP server settings.

## Trying it locally

Start the app's dev server with the switch on, on a port no other session uses, then point a client at
`http://localhost:<port>/api/mcp`. The fund tools answer from the committed catalog. The project tools
answer `projects_unavailable` unless the local server has the project index configured.

## Limits

Two layers, because neither is enough alone.

**In the function** (`src/mcp-limit.ts`, values in `MCP_LIMITS`), counted per function instance in fixed
one-minute windows. A caller is one client address, or one /64 network for IPv6.

| What | Limit |
|---|---|
| Any request from one caller | 120 a minute, answered `429` with `Retry-After` before the body is read |
| `find_funds_for_initiative` from one caller | 10 a minute |
| `find_funds_for_initiative` calls that run, from everyone | 30 a minute |
| All tool calls that run, from everyone | 300 a minute |

A tool call over its limit gets an answer the assistant can read: `rate_limited: Too many calls. Try again
in N seconds.` The address is the one Vercel sets in `x-forwarded-for`, which a caller cannot choose. The
per-caller numbers are loose on purpose: an assistant service calls from a few shared addresses for all
its users. A call the argument checks refuse counts against its own caller only, never against the two
ceilings everyone shares.

What this layer does and does not do:

- It bounds the tool work one instance does in a minute. The two shared ceilings are kept apart from the
  per-caller counts and are never forgotten.
- Each instance counts alone, so the real ceiling is the limit times the instances running, and a count
  is lost when an instance stops.
- An instance remembers 5,000 callers. Past that the oldest count is forgotten, so someone with thousands
  of addresses gets fresh per-caller counts. The shared ceilings still hold.
- Three addresses are enough to use up a shared ceiling with real calls (three times 10 rankings), and
  the Firewall rule would not stop them. Others then wait up to a minute. That is the price of bounding
  the work while leaving room for assistant services that share addresses.
- It does not stop a flood from reaching the function. The Firewall rule does that.

**At the Vercel Firewall**, one rate limit rule, which the Hobby plan allows (one per project, fixed
window of 10 seconds to 10 minutes, keyed by address, counted per region). It cannot be written in
`vercel.json`, whose `mitigate` supports only `challenge` and `deny`, so it lives in the weave project's
Firewall settings. The rule as published on 23 November 2026:

- Name: `Rate limit MCP`.
- It applies when either of two groups of conditions holds:
  - the method is `POST` and the path is `/api/mcp`;
  - the method is `POST`, the path is `/api/router` and the query has `__route=mcp`.
  The second group is there because `/api/mcp` is rewritten to the shared router
  ([How it is deployed](#how-it-is-deployed)), whose own address can be called directly. A rule on the
  public path alone would let a caller go around it.
- Then: rate limit, fixed window, 60 seconds, 120 requests, keyed by IP, action rate limit, which answers
  429 Too Many Requests.

To change it, use the dashboard: the weave project, Firewall, then the rule, then Review Changes and
Publish. Keep both condition groups.

Do not use Challenge as the action, or Attack Mode on this path: assistants are not browsers and cannot
pass a challenge. The rule cannot tell one tool from another, which is why the ranking tool's tighter
limit lives in the function.

## How it is deployed

`/api/mcp` has no function of its own. `packages/app/vercel.json` rewrites it to the shared router
(`src/router.ts`), which hands the request to `src/mcp.ts` unchanged.

## Protocol

Stateless Streamable HTTP: one JSON-RPC request per POST and one JSON response, with no session and no
stream. `src/mcp-http.ts` answers the 2026-07-28 revision (`server/discover`, `tools/list`, `tools/call`,
with the version and method repeated in headers) and the 2025 revisions (`initialize`, `ping`,
`tools/list`, `tools/call`). It is hand-written, so a new protocol revision means editing that file and
its tests in `src/mcp.test.ts`.

Requests are refused when they are not POST, come from another site's page, are not JSON, exceed 16 KB,
hold a batch, or name a tool or argument the contract does not define.
