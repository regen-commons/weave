import assert from "node:assert/strict";
import test from "node:test";
import { fundingTopics, namedTopics, OTHER_MEANINGS, TOPIC_WORDS } from "./topics.ts";

test("Portuguese and Spanish words name the catalog's English topics, with or without accents", () => {
  assert.deepEqual(
    fundingTopics("Uma cozinha comunitária que cultiva uma horta com a escola do bairro e ensina alimentação saudável."),
    ["cooking", "food", "school", "neighborhood", "healthy"],
  );
  assert.deepEqual(
    fundingTopics("Capacitamos a mujeres jóvenes en periodismo y cuidamos los bosques y el agua."),
    ["training", "women", "youth", "journalism", "care", "forest", "water"],
  );
  // Typed without accents, or in capitals at the start of a sentence, the words read the same.
  assert.deepEqual(fundingTopics("Educacao ambiental. Restauración de bosques nativos."), ["education", "environmental", "restoration", "forest", "native"]);
  assert.deepEqual(fundingTopics("Mar y costa: cuidamos el litoral."), ["ocean", "coastal", "care"]);
});

test("a word with an everyday second meaning counts only in the phrase that settles it", () => {
  for (const [text, wanted] of [
    ["Protegemos a Mata Atlântica e a mata nativa.", ["protection", "forest", "native"]],
    ["Oficinas para pessoas com deficiência.", ["disability"]],
    ["Trabajamos con pueblos indígenas contra la violencia de género.", ["peoples", "indigenous", "violence", "gender"]],
  ] as const)
    assert.deepEqual(fundingTopics(text), wanted, text);
  for (const text of [
    "La violencia mata a las mujeres.", // mata, "kills"
    "Una especie de escuela abierta.", // una especie de, "a kind of"
    "Fixing the deficiencias of the old pump.", // deficiencias, "shortcomings"
    "Rotação de culturas no sítio.", // culturas, "crops"
    "Visitamos los pueblos cada mes.", // pueblos, "villages"
    "El cura del pueblo nos presta la sala.", // cura, "priest"
    "Tocamos géneros musicales distintos.", // géneros, "kinds"
    "Comunidades da Cordillera Negra.", // negra, a colour and a place
  ])
    assert.ok(!namedTopics(text).has("forest") && !namedTopics(text).has("species") && !namedTopics(text).has("disability")
      && !namedTopics(text).has("culture") && !namedTopics(text).has("peoples") && !namedTopics(text).has("healing")
      && !namedTopics(text).has("gender"), text);
});

test("an English description is left to the rubric, so its own words weigh as they always have", () => {
  assert.deepEqual(fundingTopics("We restore forests and protect water for smallholder farmers, with schools and families."), []);
  // A word that is also English is not read as another topic.
  assert.deepEqual(fundingTopics("Elders familiar with medicinal plants map the local fauna."), []);
  // El Niño is weather, not children.
  assert.deepEqual(fundingTopics("We help coastal fishing cooperatives in Peru adapt to El Niño and La Niña."), []);
  assert.ok(!namedTopics("Ayudamos a las cooperativas a adaptarse a el niño.").has("children"));
});

test("names and places are not read as topics, typed or said without capitals", () => {
  assert.deepEqual(fundingTopics("Fundada por María Costa en Costa Rica, La Paz y Mar del Plata, con apoyo de Terra Viva."), []);
  // Speech gives no capitals: the places are known as phrases.
  assert.deepEqual(fundingTopics("trabajamos en costa rica y en la paz"), []);
  assert.deepEqual(fundingTopics("cuidamos la costa y el mar para construir la paz"), ["care", "coastal", "ocean", "peace"]);
});

test("the person's own themes come first and are not repeated", () => {
  assert.deepEqual(fundingTopics("Hortas escolares e alimentos.", ["food", "seed saving"]), ["food", "seed saving", "school"]);
});

test("kept needs and offers add the topics they name in any language, and not those the description states", () => {
  assert.deepEqual(
    fundingTopics("We run a seed library for farmers.", [], ["A water pump for the farmers", "Oficinas de saúde para crianças"]),
    ["water", "health", "children"],
  );
  assert.deepEqual(fundingTopics("Restoring water in the valley.", [], ["Water tanks"]), [], "water is in the description already");
  // The rubric reads "schools" as its own word, not as school, so a need for a school still adds it.
  assert.deepEqual(fundingTopics("We visit schools.", [], ["Uma escola nova"]), ["school"]);
  // Each need or offer is read whole, however many there are.
  const many = Array.from({ length: 40 }, (_, n) => `Item ${n} ${"palavra ".repeat(30)}`);
  assert.deepEqual(fundingTopics("A card.", [], [...many, "Água limpa"]), ["water"]);
});

test("only the start of a very long description is read, as the rubric reads it", () => {
  const filler = "palavra ".repeat(800);
  assert.deepEqual(fundingTopics(`${filler} água`), []);
  assert.deepEqual(fundingTopics(`água ${filler}`), ["water"]);
});

test("the lists hold each word once, and every topic is a word the rubric reads as itself", async () => {
  const { terms } = (await import("../../../dist/matching.mjs")) as unknown as { terms: (text: string) => string[] };
  const seen = new Map<string, string>();
  for (const [topic, words] of Object.entries(TOPIC_WORDS)) {
    assert.deepEqual(terms(topic), [topic], `${topic} is one rubric term`);
    for (const word of words.split(" ")) {
      assert.ok(!seen.has(word), `${word} is listed for ${seen.get(word)} and ${topic}`);
      seen.set(word, topic);
      assert.match(word, /^[a-z]+(?:_[a-z]+)*$/u, `${word} is folded`);
      // A listed word the rubric would read as a catalog topic itself would count twice.
      if (!word.includes("_")) assert.ok(!(word in TOPIC_WORDS), `${word} is a topic in its own right`);
    }
  }
  for (const phrase of OTHER_MEANINGS) assert.match(phrase, /^[a-z]+(?: [a-z]+)+$/u);
});
