import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import type { MatchingMutation } from "../src/partners/matching-client.ts";

// Compile the small presentation component with the project's existing compiler, without a browser or server.
const source = readFileSync(new URL("../src/partners/MatchingFeedback.tsx", import.meta.url), "utf8");
const script = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText
  .replaceAll('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
const { MatchingFeedback } = await import(`data:text/javascript;base64,${Buffer.from(script).toString("base64")}`);
function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat().flatMap(elements)];
}
test("matching feedback replays the exact uncertain command and retains success/error and refresh feedback", () => {
  const pending: MatchingMutation = { action: "withdraw", input: { entries: [{ kind: "need", entryId: crypto.randomUUID(), revision: 1, shareVersion: 1 }], requestId: crypto.randomUUID() } };
  let replay: unknown, refreshed = false;
  const nodes = elements(MatchingFeedback({ busy: false, loading: false, error: "Response lost", notice: "Previous result",
    pending, online: true, readOnly: false, onRetry(command: MatchingMutation) { replay = command; }, onRefresh() { refreshed = true; } }));
  const retry = nodes.find(node => node.type === "button" && node.props.children === "Try again");
  assert.equal(retry.props.disabled, false); retry.props.onClick();
  assert.equal(replay, pending, "retry preserves the reviewed request identity and fields");
  assert.ok(nodes.some(node => node.props?.role === "alert" && node.props.children === "Response lost"));
  assert.ok(nodes.some(node => node.props?.role === "status" && node.props.children === "Previous result"));
  nodes.find(node => node.type === "button" && node.props.children === "Check again").props.onClick();
  assert.equal(refreshed, true);
  const viewer = elements(MatchingFeedback({ busy: false, loading: false, error: "", notice: "", pending,
    online: true, readOnly: true, onRetry() { throw Error("viewer cannot mutate"); } }));
  assert.equal(viewer.some(node => node.type === "button"), false);
});
