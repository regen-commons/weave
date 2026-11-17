import assert from "node:assert/strict";
import { test } from "node:test";
import { likelyDuplicate } from "../src/initiative/duplicates.ts";
import { certifiedRecord } from "../src/social/live.ts";

const orchard = { name: "Orchard learning circle", links: ["https://example.org/orchard"] };
const seeds = { name: "Seed library of the upper valley", links: [] };
const water = { name: "Spring water notes", links: [] };
const projects = [orchard, seeds, water];

test("the same name points to the project, whatever its case, accents or plurals", () => {
  assert.equal(likelyDuplicate({ name: "orchard learning circles", links: [] }, projects), orchard);
  const sementes = { name: "Biblioteca de Sementes", links: [] };
  assert.equal(likelyDuplicate({ name: "biblioteca de sementes", links: [] }, [sementes]), sementes);
});

test("a shorter name inside a project's name counts only with two words or more", () => {
  assert.equal(likelyDuplicate({ name: "Water notes", links: [] }, projects), water);
  assert.equal(likelyDuplicate({ name: "Seeds", links: [] }, projects), null);
});

test("a shared link is enough, however it is written", () => {
  assert.equal(likelyDuplicate({ name: "Pomar", links: ["http://www.example.org/orchard/"] }, projects), orchard);
});

test("one shared word, an empty card or no projects suggest nothing", () => {
  assert.equal(likelyDuplicate({ name: "Seed stories studio", links: [] }, projects), null);
  assert.equal(likelyDuplicate({ name: "", links: [] }, projects), null);
  assert.equal(likelyDuplicate({ name: "Orchard learning circle", links: [] }, []), null);
});

test("a link that several projects share, such as their group's website, does not pick one of them", () => {
  const site = ["https://valley.example.org/"];
  const nursery = { name: "Valley tree nursery", links: site };
  const school = { name: "Valley seed school", links: site };
  assert.equal(likelyDuplicate({ name: "Seed school", links: ["https://valley.example.org"] }, [nursery, school]), school);
  assert.equal(likelyDuplicate({ name: "Something else", links: site }, [nursery, school]), null);
  assert.equal(likelyDuplicate({ name: "Something else", links: site }, [nursery, orchard]), nursery, "a link only one project has still decides");
});

test("links on a group's Certified profile never match a card to one of its projects", () => {
  const site = "https://valley.example.org/";
  const group = { groupDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", role: "member" as const, displayName: "Valley growers" };
  const nursery = certifiedRecord({ uri: "at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/nursery", cid: "bafyfixture",
    repoDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", groupDid: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", title: "Valley tree nursery",
    publisherLinks: [site] }, group);
  assert.deepEqual([nursery.links, nursery.publisherLinks], [[], [site]]);
  assert.equal(likelyDuplicate({ name: "Riverside compost club", links: [site] }, [nursery]), null,
    "a card with another name and the group's website is not this project");
});

test("when several projects share a card's link, a project with the card's own name elsewhere is still found", () => {
  const site = ["https://valley.example.org/"];
  const nursery = { name: "Valley tree nursery", links: site };
  const school = { name: "Valley seed school", links: site };
  const notes = { name: "Riverbank water notes", links: [] };
  assert.equal(likelyDuplicate({ name: "Riverbank water notes", links: site }, [nursery, school, notes]), notes);
});
