import assert from "node:assert/strict";
import { test } from "node:test";
import { partnerPlaces } from "./partner-places.ts";

const countries = (text: string, locations?: readonly string[]) => [...partnerPlaces(text, locations).countries];

test("countries can be resolved from a city or state in public prose or a structured location", () => {
  assert.deepEqual(countries("Sofia’s rivers: from sewage channels to community spaces"), ["BG"]);
  assert.deepEqual(countries("The school runs residencies in Northern California."), ["US"]);
  assert.deepEqual(countries("", ["California"]), ["US"]);
  assert.deepEqual(countries("", ["Northern California"]), ["US"]);
  assert.deepEqual(countries("", ["Awka"]), ["NG"]);
  assert.deepEqual(countries("", ["Paris, Texas"]), ["US"]);
  assert.deepEqual(countries("Volunteers work in Paris, Texas."), ["US"]);
});

test("an explicit country wins and uncertain mentions do not establish a location", () => {
  assert.deepEqual(countries("We work in Sofia, Bulgaria.", ["Awka, Nigeria"]), ["NG"]);
  assert.deepEqual(countries("We host visitors from Sofia in Nigeria."), ["NG"]);
  assert.deepEqual(countries("A pilot in Victoria will open soon."), []);
  assert.deepEqual(countries("We have pilot sites in Sofia and in Awka."), []);
  assert.deepEqual(countries("We start in May and continue through Summer."), []);
  assert.deepEqual(countries("", ["Georgia"]), []);
});
