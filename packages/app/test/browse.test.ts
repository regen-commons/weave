import assert from "node:assert/strict";
import { test } from "node:test";
import { activeChoices } from "../src/filters.ts";
import {
  applyBrowseFacet, BROWSE_GROUPS, browseEvidence, browseFacets, EMPTY_BROWSE,
} from "../src/partners/browse.ts";
import { PUBLIC_PARTNER_EVIDENCE } from "../src/partners/catalog.ts";

const catalog = PUBLIC_PARTNER_EVIDENCE;
const ids = (filters: Parameters<typeof browseEvidence>[1]) => browseEvidence(catalog, filters).map((evidence) => evidence.id);

test("with nothing chosen the starter list shows every entry, in its own order", () => {
  assert.deepEqual(ids(EMPTY_BROWSE), catalog.map((evidence) => evidence.id));
});

test("the starter list narrows as words are typed: every word, any case, in the name, summary, topics or publisher", () => {
  assert.deepEqual(ids({ ...EMPTY_BROWSE, search: "o" }).length > 0, true);
  const maps = ids({ ...EMPTY_BROWSE, search: "MAP" });
  assert.ok(maps.length > 0 && maps.every((id) => id.startsWith("osm:")), "one word finds OpenStreetMap's entries");
  assert.deepEqual(ids({ ...EMPTY_BROWSE, search: "imagery openly" }), ["osm:contribute"], "every word must be there");
  assert.deepEqual(ids({ ...EMPTY_BROWSE, search: "  wikipedia  " }), ["art-feminism:training"]);
  assert.deepEqual(ids({ ...EMPTY_BROWSE, search: "no such words here" }), []);
});

test("filters offer only what the list holds, any choice within one fits, and all filters must", () => {
  const facets = browseFacets(catalog, EMPTY_BROWSE);
  assert.deepEqual(facets.map((facet) => facet.key), ["support", "listed"]);
  const held = new Set(catalog.flatMap((evidence) => evidence.capitals));
  assert.deepEqual(new Set(facets[0]!.options.map((option) => option.value)), held, "no kind of support that leads nowhere");
  const kinds = new Set(catalog.map((evidence) => evidence.kind));
  assert.deepEqual(facets[1]!.options.map((option) => option.value), BROWSE_GROUPS.map((group) => group.kind).filter((kind) => kinds.has(kind)));

  const cultural = applyBrowseFacet(EMPTY_BROWSE, "support", ["cultural"]);
  assert.deepEqual(ids(cultural), ["art-feminism:training"]);
  const either = applyBrowseFacet(EMPTY_BROWSE, "support", ["cultural", "experiential"]);
  assert.ok(ids(either).length > 1, "any chosen kind fits");
  const requests = applyBrowseFacet(either, "listed", ["published_need"]);
  assert.deepEqual(ids(requests), ["osm:contribute"], "a second filter narrows the first");
  assert.equal(applyBrowseFacet(EMPTY_BROWSE, "country", ["Brazil"]), EMPTY_BROWSE, "a filter the list does not have changes nothing");
  // What is chosen shows as removable chips, in the bar every list shares.
  assert.deepEqual(activeChoices(browseFacets(catalog, requests)).map((choice) => choice.label),
    ["Cultural: Culture and story", "Experiential: Skills and know-how", "Public requests"]);
});
