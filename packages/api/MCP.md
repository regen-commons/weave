# Weave for assistants: the MCP endpoint

`/api/mcp` lets an assistant read Weave's public data through the Model Context Protocol. The
[agent access proposal](../../docs/platform/10-agent-access.md) explains why and what comes later.

## What it offers

Four read-only tools, defined in `src/agent-tools-contract.ts`:

| Tool | Reads |
|---|---|
| `search_funds` | The fund catalog, by words, region, sector, access and deadline |
| `get_fund` | One fund with its programs, evidence and sources, or one program as `fund::program` |
| `search_projects` | The public Certified projects Weave lists, as `/api/public-projects` does |
| `get_project` | One of those projects by its address |

Results are possibilities to check, never eligibility decisions. The endpoint takes no sign-in, reads no
cookie and stores nothing. Its log holds a tool's name, outcome and duration, never its arguments.

## Switching it on

The route answers 404 until `WEAVE_MCP_ENABLED=true` is set for the deployment. Project tools also need
the public project list to be on (`WEAVE_PUBLIC_PROJECTS_ENABLED`). Turning either on in Vercel, and
adding a Firewall rate limit rule for `/api/mcp`, are the maintainer's steps
([D40](../../docs/platform/open-decisions.md#agent-access)).

Two things come before the switch, and neither has been done:

- **A preview deployment that answers the route.** The compiled function imports the catalog's code
  (`dist/domain.mjs`) and data (`dist/data/funders.json`) from the repository root, outside the Weave
  project's root directory. Local builds find them; whether Vercel's file tracing ships them is unproven.
  If it does not, the fund tools answer `catalog_unavailable` and the project tools keep working.
- **The rate limit rule.** The endpoint has no limit of its own. A fund search reads the whole catalog in
  memory on each call, so the Firewall rule is what bounds the cost of an unauthenticated caller.

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

## Protocol

Stateless Streamable HTTP: one JSON-RPC request per POST and one JSON response, with no session and no
stream. `src/mcp-http.ts` answers the 2026-07-28 revision (`server/discover`, `tools/list`, `tools/call`,
with the version and method repeated in headers) and the 2025 revisions (`initialize`, `ping`,
`tools/list`, `tools/call`). It is hand-written, so a new protocol revision means editing that file and
its tests in `src/mcp.test.ts`.

Requests are refused when they are not POST, come from another site's page, are not JSON, exceed 16 KB,
hold a batch, or name a tool or argument the contract does not define.
