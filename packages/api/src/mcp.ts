// /api/mcp lets an assistant search Weave's public data through the Model Context Protocol: the fund
// catalog and the public Certified projects Weave lists. It is off, answering 404, until
// WEAVE_MCP_ENABLED=true. It takes no sign-in, reads no cookie and keeps nothing a caller sends.
import { createAgentTools, type FundCatalog } from "./agent-tools.ts";
import { createMcpHandler } from "./mcp-http.ts";
import { GET as publicProjects } from "./public-projects.ts";

/** Weave's public address, for the links results carry. */
const PUBLIC_ORIGIN = "https://weave.regencommons.com";

let catalog: Promise<FundCatalog> | undefined;
/** The catalog file the app ships, read once per function instance on the first fund call. */
function fundCatalog(): Promise<FundCatalog> {
  const current = catalog ??= import("../../../dist/data/funders.json", { with: { type: "json" } })
    .then((module) => module.default as FundCatalog);
  // A failed read is tried again by a later call instead of being kept.
  current.catch(() => { if (catalog === current) catalog = undefined; });
  return current;
}

export const { POST, GET, DELETE } = createMcpHandler({
  enabled: () => process.env.WEAVE_MCP_ENABLED === "true",
  tools: createAgentTools({ catalog: fundCatalog, publicProjects, origin: PUBLIC_ORIGIN }),
  log: (entry) => console.log(JSON.stringify({ event: "mcp_tool", ...entry })),
});
