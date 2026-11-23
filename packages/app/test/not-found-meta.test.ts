import assert from "node:assert/strict";
import { test } from "node:test";
import { keepOutOfSearch } from "../src/not-found-meta.ts";

function head(withCanonical: boolean) {
  const nodes: string[] = withCanonical ? ["canonical"] : [];
  const node = (name: string) => ({ name, remove: () => void nodes.splice(nodes.indexOf(name), 1) });
  return {
    nodes,
    querySelector: (selector: string) => (selector === 'link[rel="canonical"]' && nodes.includes("canonical") ? node("canonical") : null),
    append: (added: unknown) => void nodes.push((added as { name: string }).name),
    robots: () => node("robots"),
  };
}

test("a missing page asks not to be indexed and names no canonical address, and leaving it puts both back", () => {
  const page = head(true);
  const leave = keepOutOfSearch(page, page.robots);
  assert.deepEqual(page.nodes, ["robots"]);
  leave();
  assert.deepEqual(page.nodes, ["canonical"]);
});

test("a page with no canonical address only gains and loses the robots tag", () => {
  const page = head(false);
  const leave = keepOutOfSearch(page, page.robots);
  assert.deepEqual(page.nodes, ["robots"]);
  leave();
  assert.deepEqual(page.nodes, []);
});
