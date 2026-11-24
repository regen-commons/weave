// About it is the initiative's own description, in the person's own words: what it needs or could
// offer belongs on the Needs and Offers steps, and the speaker's own name is not the initiative's
// (24 November 2026). Whole sentences and clauses are left out, never reworded. Every name and
// sentence here is invented for these rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { initiativeWords } from "../src/describe/about.ts";
import { readDescribe } from "../evaluation/extraction.ts";

test("what the initiative needs or could offer is left out of About it, in English, Portuguese and Spanish", () => {
  const cases: [string, string][] = [
    ["We are Seed Keepers of Ilha. We swap seeds at the market every month. We need a freezer for the seeds.", "We are Seed Keepers of Ilha. We swap seeds at the market every month."],
    ["We run a tool library on Saturdays. We are looking for volunteers to fix bikes.", "We run a tool library on Saturdays."],
    ["We teach swimming to kids. We can offer our pool on Sundays.", "We teach swimming to kids."],
    ["Cuidamos a horta da escola com as famílias. Precisamos de mudas e ferramentas.", "Cuidamos a horta da escola com as famílias."],
    ["Sembramos maíz con niños. Necesitamos herramientas y semillas.", "Sembramos maíz con niños."],
    ["Damos clases de música en el barrio. Podemos prestar sillas para eventos.", "Damos clases de música en el barrio."],
    // Said without full stops, the clause that asks is cut where it starts.
    ["we teach kids to swim at the lake and we need a bigger boat", "we teach kids to swim at the lake"],
    ["a gente cuida da praça com os vizinhos e precisamos de bancos novos", "a gente cuida da praça com os vizinhos"],
  ];
  for (const [said, about] of cases) assert.equal(initiativeWords(said), about, said);
});

test("the speaker's own name is left out, and what they do is kept", () => {
  const cases: [string, string][] = [
    ["My name is Tomás and I coordinate the Barrio Verde garden. We grow herbs on school roofs.", "I coordinate the Barrio Verde garden. We grow herbs on school roofs."],
    ["Hi, I'm Dara. We run a seed library in the old post office.", "We run a seed library in the old post office."],
    ["Me llamo Rosa y coordino la Huerta Las Flores. Sembramos maíz con niños.", "Coordino la Huerta Las Flores. Sembramos maíz con niños."],
    ["Meu nome é Ana e coordeno a Horta da Vila. Plantamos com as crianças.", "Coordeno a Horta da Vila. Plantamos com as crianças."],
    ["my name is dara and we run a seed library for the street", "We run a seed library for the street"],
  ];
  for (const [said, about] of cases) assert.equal(initiativeWords(said), about, said);
});

test("what the work aims at, and what it gives, stay: they describe the initiative", () => {
  for (const said of [
    "We need to restore the river before the dry season.",
    "Buscamos fortalecer la soberanía alimentaria de las familias.",
    "Precisamos proteger as nascentes do bairro.",
    "We offer free repair workshops every Saturday.",
    "Oferecemos aulas de costura para mulheres.",
    "I'm a teacher and we run a garden club.",
    "Soy profesora y damos talleres de lectura.",
    "I'm from Bogotá and we teach dance to teenagers.",
    "I'm happy to say we planted 300 trees.",
  ])
    assert.equal(initiativeWords(said), said, said);
});

test("words that are only an ask or an introduction stay as they are, so About it is never emptied", () => {
  for (const said of ["We need tools.", "Hi, I'm Dara.", "Necesitamos semillas."]) assert.equal(initiativeWords(said), said, said);
});

test("where an ask cannot be told from what the work does, the words stay (a code review's cases)", () => {
  for (const said of [
    // A second subject in the clause that asks: what it says about the work is kept with the ask.
    "We run a kitchen in Maputo. We need a van and the kitchen feeds 200 families a day.",
    "Cocinamos en Maputo. Necesitamos una furgoneta y la cocina alimenta a 200 familias.",
    "We run a kitchen in Maputo. We need a van because the kitchen feeds 200 families.",
    // "Need to find", "raise" and "get" with no thing to get after them are the work.
    "We clean beaches. We need to raise awareness about plastic pollution.",
    "We run a youth club. We need to get kids outdoors more often.",
    "We run a dog shelter. We need to find homes for rescued dogs.",
    "We run a market. We need to replace plastic bags with cloth ones.",
    "We restore dunes. We are looking for solutions to coastal erosion.",
    "We help displaced families. We are seeking justice for displaced families.",
    "Cuidamos el agua. Buscamos soluciones para la sequía.",
    "Cocinamos en la escuela. Necesitamos que los niños coman mejor.",
    "Cozinhamos na escola. Precisamos pôr fim à fome.",
    // An offer said as what the work does.
    "We run an after-school club. We can host up to 40 children in our after-school club.",
    "We cook for the street. We can provide meals to 300 people a day thanks to donations.",
    "Enseñamos música. Podemos dar clases gratuitas gracias a los voluntarios.",
    // "Needs" with no one who needs.
    "We support carers. Family needs shape everything we do.",
    "We visit the elderly. Daily needs of the elderly are our focus.",
    "We work with refugees. Needs assessments for refugees are our main service.",
    // What a school or a community needs is why the work exists.
    "The school needs a garden, so we built one.",
    "The community needs clean water and we drill wells.",
    // An opening phrase before the clause's own subject.
    "In need of a change, we started the market.",
    "Looking for a better life, families come to our centre.",
  ])
    assert.equal(initiativeWords(said), said, said);
  // The plain asks beside them still go.
  const cases: [string, string][] = [
    ["We run a kitchen in Maputo. We need a van and a trailer.", "We run a kitchen in Maputo."],
    ["We clean beaches. We need to raise funds for a truck.", "We clean beaches."],
    ["We clean beaches. We need to find a venue.", "We clean beaches."],
    ["We fix bikes. Still need volunteers!", "We fix bikes."],
    ["We grow herbs. Our school needs a greenhouse.", "We grow herbs."],
  ];
  for (const [said, about] of cases) assert.equal(initiativeWords(said), about, said);
});

test("what is left keeps its own shape: its end mark, quotes, line ends and list numbers", () => {
  const cases: [string, string][] = [
    ["I could use some help explaining what we do: we restore coral reefs.", "We restore coral reefs."],
    ["My name is Tomás, and I coordinate the Barrio Verde garden.", "I coordinate the Barrio Verde garden."],
    ["I'm Mary Jane Watson, and we run a pantry.", "We run a pantry."],
    ['"We teach kids to swim and we need a boat."', '"We teach kids to swim."'],
    ["We teach kids to swim \u2014 and we need a boat.", "We teach kids to swim."],
    ["Riverbend Seed Library\nWe swap seeds at the market.\nWe need a freezer.\nWe teach kids to save seeds.", "Riverbend Seed Library\nWe swap seeds at the market.\nWe teach kids to save seeds."],
    ["We swap seeds.\n\nWe need a freezer.\nWe teach kids.", "We swap seeds.\n\nWe teach kids."],
    ["- We swap seeds\n- We need a freezer\n- We teach kids", "- We swap seeds\n- We teach kids"],
    ["1. We swap seeds. 2. We need a boat. 3. We teach kids.", "1. We swap seeds. 3. We teach kids."],
  ];
  for (const [said, about] of cases) assert.equal(initiativeWords(said), about, said);
});

test("Fill In The Fields puts the initiative's own description in About it, and leaves a pointer to the card's link out", async () => {
  const filled = await readDescribe("We run a tool library. Visit https://tools.example.org for our opening hours.");
  assert.equal(filled.about, "We run a tool library.");
  // A link the card does not hold stays where it is, as the only place it is.
  const two = await readDescribe("We run a tool library. Visit https://tools.example.org for hours, and https://repair.example.org for repairs.");
  assert.match(two.about, /repair\.example\.org/u);
  // A tail that says what the initiative does is not a pointer.
  const offered = await readDescribe("We run a repair café. Visit https://x.org for free repair workshops.");
  assert.equal(offered.about, "We run a repair café. Visit https://x.org for free repair workshops.");
  const asked = await readDescribe("We are Seed Keepers of Ilha. We swap seeds at the market. We need a freezer.");
  assert.equal(asked.about, "We are Seed Keepers of Ilha. We swap seeds at the market.");
});

test("a reviewer's 99 inputs lose no description, are never emptied and are never reworded", async () => {
  const { readFileSync } = await import("node:fs");
  const { cases } = JSON.parse(readFileSync(new URL("./about-attacks.json", import.meta.url), "utf8")) as {
    cases: { id: string; text: string; keep: string[]; drop: string[] }[];
  };
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const has = (text: string, phrase: string) => new RegExp(`(?<![\\p{L}\\p{M}])${escape(phrase)}(?![\\p{L}\\p{M}])`, "iu").test(text);
  const words = (text: string) => text.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  /** Every word of About it is a word of the input, in the same order: nothing is reworded. */
  const inOrder = (about: string, input: string) => {
    const said = words(input);
    let at = 0;
    return words(about).every((word) => {
      while (at < said.length && said[at] !== word) at++;
      return at++ < said.length;
    });
  };
  const wrong: string[] = [];
  let dropped = 0;
  for (const row of cases) {
    const about = (await readDescribe(row.text)).about;
    if (!about) wrong.push(`${row.id} emptied`);
    for (const phrase of row.keep) if (!has(about, phrase)) wrong.push(`${row.id} lost "${phrase}"`);
    if (!inOrder(about, row.text)) wrong.push(`${row.id} reworded`);
    if (row.drop.length && row.drop.every((phrase) => !has(about, phrase))) dropped++;
  }
  assert.deepEqual(wrong, []);
  // Most of what should go does go; what stays is a name said without capitals, which is left rather than risk a word of description.
  assert.ok(dropped >= 40, `only ${dropped} inputs had everything they should lose left out`);
});
