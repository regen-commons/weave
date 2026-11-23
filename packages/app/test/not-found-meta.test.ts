import assert from "node:assert/strict";
import { test } from "node:test";
import { LANDING_HEAD } from "../src/landing-head.ts";
import { keepOutOfSearch } from "../src/not-found-meta.ts";

function head(landing: string[]) {
  const nodes = [...landing];
  const node = (name: string) => ({ name, remove: () => void nodes.splice(nodes.indexOf(name), 1) });
  return {
    nodes,
    querySelectorAll: (selector: string) => (selector === LANDING_HEAD ? nodes.filter((name) => name !== "robots").map(node) : []),
    append: (added: unknown) => void nodes.push((added as { name: string }).name),
    robots: () => node("robots"),
  };
}

test("a missing page asks not to be indexed and drops Home's canonical link and JSON-LD", () => {
  const page = head(["canonical", "json-ld"]);
  const leave = keepOutOfSearch(page, page.robots);
  assert.deepEqual(page.nodes, ["robots"]);
  // Leaving takes the request away; the landing head stays gone, as after any move in the app.
  leave();
  assert.deepEqual(page.nodes, []);
});

test("a head with no landing tags only gains and loses the robots tag", () => {
  const page = head([]);
  const leave = keepOutOfSearch(page, page.robots);
  assert.deepEqual(page.nodes, ["robots"]);
  leave();
  assert.deepEqual(page.nodes, []);
});
