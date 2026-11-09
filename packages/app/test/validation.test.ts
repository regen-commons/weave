import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("device and extraction schemas validate without probing blocked code generation", () => {
  const contracts = new URL("../src/describe/contracts.ts", import.meta.url).href;
  const asks = new URL("../src/intake/contracts.ts", import.meta.url).href;
  const script = `
    let probes = 0;
    globalThis.Function = new Proxy(Function, { construct() { probes++; throw new Error("CSP blocks eval"); }, apply() { probes++; throw new Error("CSP blocks eval"); } });
    const { newDraft, DeviceDraftSchema, modelConstraint } = await import(${JSON.stringify(contracts)});
    const { AskStepSchema, emptyAskStep, AskExtractionSchema } = await import(${JSON.stringify(asks)});
    DeviceDraftSchema.parse(newDraft());
    AskStepSchema.parse(emptyAskStep());
    AskExtractionSchema.parse({ items: [], heard: 0 });
    modelConstraint(AskExtractionSchema);
    process.stdout.write(JSON.stringify({ probes }));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8" }));
  assert.equal(result.probes, 0, "A caught eval attempt still violates the page CSP");
});
