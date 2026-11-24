import assert from "node:assert/strict";
import test from "node:test";
import { fundingTopics, namedTopics } from "./topics.ts";

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
});

test("an English description is left to the rubric, so its words weigh as they always have", () => {
  assert.deepEqual(fundingTopics("We restore forests and protect water for smallholder farmers, with schools and families."), []);
  // A word that is also English is not read as another topic: "familiar", "medicinal" and "fauna" stay English.
  assert.deepEqual(fundingTopics("Elders familiar with medicinal plants map the local fauna."), []);
});

test("a word that also names a person or a place counts only in lower case", () => {
  assert.deepEqual(fundingTopics("Fundada por María Costa en Costa Rica, La Paz y Mar del Plata, con apoyo de Terra Viva."), []);
  assert.deepEqual(fundingTopics("Cuidamos la costa y el mar para construir la paz."), ["care", "coastal", "ocean", "peace"]);
  // A colour or a place as often as a people: "Cordillera Negra" names no topic.
  assert.deepEqual(fundingTopics("Comunidades de la Cordillera Negra y la tierra negra."), ["land"]);
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
});

test("one word names one topic, so one word never counts as two shared topics", () => {
  for (const word of ["reflorestamento", "agroecologia", "pescadoras", "afrodescendientes", "permacultura"])
    assert.equal(namedTopics(word).size, 1, word);
  assert.deepEqual([...namedTopics("")], []);
});

test("only the start of a very long text is read, as the rubric reads it", () => {
  const filler = "palavra ".repeat(800);
  assert.deepEqual(fundingTopics(`${filler} água`), []);
  assert.deepEqual(fundingTopics(`água ${filler}`), ["water"]);
});
