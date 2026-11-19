// Fill In The Fields with the keyword rules alone, as Brave and Safari get it: no built-in model
// and no speech. Each input is written the way people write about their initiative, and each
// expectation is what the words state and nothing more: a field the words do not give stays empty.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, type DeviceDraft } from "../src/describe/contracts.ts";
import { changeSaid, fieldsForm, fillFields } from "../src/describe/fill.ts";
import { collectSource, fromSource } from "../src/describe/keywords.ts";

const build: NonNullable<DeviceDraft["lastBuild"]> = { engine: "keywords", unreadFiles: 0, sourceCharacters: 0, files: [], fallback: false };
/** What the page does on Fill In The Fields: the worker reads the box, then the fields fill in place. */
async function fill(said: string) {
  const draft = changeSaid(newDraft(), said);
  const { suggestion } = fromSource(draft, await collectSource(draft));
  return fieldsForm(fillFields(draft, suggestion, build).draft);
}

interface Case {
  said: string;
  name: string;
  where: string;
  link?: string;
  /** Words About it must not hold: a sentence that only pointed at the link. */
  aboutWithout?: string;
  /** Words About it must still hold. */
  aboutWith?: string;
}

const CASES: readonly Case[] = [
  {
    // The shape found in a manual try on 19 November: a whole clause went into Name.
    said: "Riverbend Seed Library is a volunteer group in Porto Alegre, Brazil. We collect and share native seeds with small farms and run planting days with schools. See https://example.org/riverbend for more.",
    name: "Riverbend Seed Library",
    where: "Porto Alegre, Brazil",
    link: "https://example.org/riverbend",
    aboutWithout: "See https",
    aboutWith: "We collect and share native seeds",
  },
  {
    said: "We are Lakeside Compost Collective, based in Kisumu, Kenya. We turn market waste into compost for smallholder farmers.",
    name: "Lakeside Compost Collective",
    where: "Kisumu, Kenya",
  },
  {
    said: "At Green Roots Kitchen, we cook with surplus food from local markets. We are a community kitchen in Leeds, UK.",
    name: "Green Roots Kitchen",
    where: "Leeds, UK",
  },
  {
    said: "Bee Corridors, a network of beekeepers across Ghana, plants wildflower strips along farm edges.",
    name: "Bee Corridors",
    where: "Ghana",
  },
  {
    said: "We're Friends of the Mangroves. Our group is in Lamu, Kenya, and we replant mangroves with fishing families.",
    name: "Friends of the Mangroves",
    where: "Lamu, Kenya",
  },
  {
    said: "Somos a Horta Comunitária Vila Nova, em Porto Alegre. Plantamos alimentos com as famílias do bairro.",
    name: "Horta Comunitária Vila Nova",
    where: "Porto Alegre",
  },
  {
    said: "Somos la Red de Semillas del Sur, un colectivo en Valparaíso, Chile. Guardamos semillas nativas.",
    name: "Red de Semillas del Sur",
    where: "Valparaíso, Chile",
  },
  {
    said: "Our project is called Clean Rivers Lab. We are based in Accra. Read more at https://example.org/clean-rivers.",
    name: "Clean Rivers Lab",
    where: "Accra",
    link: "https://example.org/clean-rivers",
    aboutWithout: "Read more",
  },
  {
    said: "Name: Hilltop Learning Garden\nWe are a school garden in Nairobi where children grow vegetables.",
    name: "Hilltop Learning Garden",
    where: "Nairobi",
  },
  {
    said: "Seeds for Schools\nWe are a seed library from Lancashire. We run seed swaps in primary schools.",
    name: "Seeds for Schools",
    where: "Lancashire",
  },
  {
    said: "Visit https://example.org/hive to learn more. Hive Commons is a cooperative of urban beekeepers in Lisbon.",
    name: "Hive Commons",
    where: "Lisbon",
    link: "https://example.org/hive",
    aboutWithout: "Visit https",
    aboutWith: "Hive Commons is a cooperative",
  },
  {
    // A link inside a sentence that says something stays in About it.
    said: "Tidewater Trust is a charity in Bristol. Our seed map at https://example.org/map shows every orchard we planted.",
    name: "Tidewater Trust",
    where: "Bristol",
    link: "https://example.org/map",
    aboutWith: "Our seed map at https://example.org/map shows every orchard",
  },
  {
    said: "Hello, we are Tree Keepers! We plant trees with schools.",
    name: "Tree Keepers",
    where: "",
  },
  {
    said: "Somos un colectivo de mujeres en Oaxaca, México. Cuidamos el maíz nativo.",
    name: "",
    where: "Oaxaca, México",
  },
  {
    said: "Riverbend Seed Library is based in Porto Alegre and Canoas.",
    name: "Riverbend Seed Library",
    // Two places: the person says which, or both.
    where: "",
  },
  // The words do not give these, so they stay empty.
  { said: "We are students from Unilag who plant trees on campus.", name: "", where: "" },
  { said: "Le Jardin Partagé est une association à Lyon.", name: "", where: "" },
  { said: "We are a group of neighbours who clean the canal on Saturdays.", name: "", where: "" },
  { said: "Maria is a farmer in Lagos who teaches composting to her neighbours.", name: "", where: "" },
  { said: "We are Brazilian farmers in Bahia, and we save seeds together.", name: "", where: "Bahia" },
  { said: "We work in Education and run after-school clubs.", name: "", where: "" },
];

for (const item of CASES)
  test(`keyword fill: ${item.said.slice(0, 60)}`, async () => {
    const form = await fill(item.said);
    assert.equal(form.name, item.name, "Name");
    assert.equal(form.where, item.where, "Where you work");
    assert.equal(form.links, item.link ?? "", "Website or main link");
    if (item.aboutWithout) assert.ok(!form.about.includes(item.aboutWithout), `About it still holds "${item.aboutWithout}": ${form.about}`);
    if (item.aboutWith) assert.ok(form.about.includes(item.aboutWith), `About it lost "${item.aboutWith}": ${form.about}`);
  });

test("a pointer to a link stays in About it when the link does not go on the card", async () => {
  // The person typed another link first, so the one in the words is not taken, and the sentence is all that points to it.
  const said = "Riverbend Seed Library is a volunteer group in Porto Alegre, Brazil. See https://example.org/riverbend for more.";
  let draft = changeSaid(newDraft(), said);
  const { suggestion } = fromSource(draft, await collectSource(draft));
  draft = { ...draft, form: { name: "", where: "", about: "", links: "https://example.org/own" }, filled: [] };
  const form = fieldsForm(fillFields(draft, suggestion, build).draft);
  assert.equal(form.links, "https://example.org/own");
  assert.ok(form.about.includes("See https://example.org/riverbend for more."), form.about);
});
