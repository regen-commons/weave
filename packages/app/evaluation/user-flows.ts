import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export type FlowEvidence = { file: string; test: string; class: "module" | "disposable-postgres"; landsWith?: string };
export type Flow = { id: string; behavior: string; evidence: FlowEvidence[] };
const repository = new URL("../../../", import.meta.url);

export async function loadFlows(): Promise<Flow[]> {
  const data: unknown = JSON.parse(await readFile(new URL("user-flows-v1.json", import.meta.url), "utf8"));
  const flows = (data as { version?: unknown; flows?: unknown }).flows;
  if ((data as { version?: unknown }).version !== 1 || !Array.isArray(flows)) throw Error("invalid_flow_map");
  const ids = new Set<string>();
  for (const flow of flows as Flow[]) {
    if (!flow?.id || ids.has(flow.id) || !flow.behavior || !Array.isArray(flow.evidence) || !flow.evidence.length)
      throw Error("invalid_flow_map");
    ids.add(flow.id);
    for (const item of flow.evidence)
      if (!item.file || /^\/|\.\./u.test(item.file) || !item.test || !["module", "disposable-postgres"].includes(item.class))
        throw Error("invalid_flow_map");
  }
  return flows as Flow[];
}

/** A test exists only if its exact name opens a test( or integration( call in the named file. */
async function present(item: FlowEvidence): Promise<boolean> {
  let source: string;
  try {
    source = await readFile(new URL(item.file, repository), "utf8");
  } catch {
    return false;
  }
  return [`test("${item.test}"`, `integration("${item.test}"`].some((call) => source.includes(call));
}

export async function flowCoverage(requireAll: boolean) {
  const flows = await loadFlows();
  const rows = await Promise.all(flows.map(async (flow) => {
    const evidence = await Promise.all(flow.evidence.map(async (item) => ({ ...item, present: await present(item) })));
    const missing = evidence.filter((item) => !item.present && (requireAll || !item.landsWith));
    const pending = evidence.filter((item) => !item.present && item.landsWith && !requireAll);
    return { id: flow.id, behavior: flow.behavior, present: evidence.filter((item) => item.present).length,
      total: evidence.length, missing, pending, databaseOnly: evidence.every((item) => item.class === "disposable-postgres") };
  }));
  return { flows: rows, complete: rows.every((row) => !row.missing.length) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await flowCoverage(process.argv.includes("--require-all"));
  for (const row of report.flows)
    console.log(`${row.missing.length ? "MISSING" : row.pending.length ? "PENDING" : "COVERED"} ${row.id}: ${row.present}/${row.total}`
      + (row.pending.length ? ` (lands with ${[...new Set(row.pending.map((item) => item.landsWith))].join(", ")})` : "")
      + row.missing.map((item) => `\n  missing: ${item.file} :: ${item.test}`).join(""));
  process.exitCode = report.complete ? 0 : 1;
}
