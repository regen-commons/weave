// Places the keyword rules gave before 24 November 2026 that were wrong. Reviews written to widen
// Where found them already there, beside the new ones they were looking for: a platform, a
// possessive, a firm or a building with a country in its name, a language, a kind of place, part of
// a country cut short to the country, and a list read as one place. Each now gives nothing or the
// place as a careful person would write it, never another place. "I work in Dubai and send money
// home" still gives Dubai: "I work in" is how a founder working alone says where, and is kept.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readDescribe } from "../evaluation/extraction.ts";

const where = async (text: string) => (await readDescribe(text)).where.join("; ");

/** Each sentence, and the answers that would not be wrong besides nothing at all. */
const FALSE_BEFORE: readonly [string, readonly string[]][] = [
  ["Estamos en Facebook e Instagram.", []],
  ["We work in Georgia's garden on Saturdays.", []],
  ["We work in Grandma Rose's kitchen.", []],
  ["We work in Kenya Power's old depot.", []],
  ["we work in kenya power offices", []],
  ["Our office is in the Ghana Commercial Bank building.", []],
  ["We work in Quechua.", []],
  ["We work in Refugee Camps.", []],
  ["We work in five counties of Kenya.", ["Kenya"]],
  ["we work in hospitals across kenya", []],
  ["we work in chile farming in new mexico", []],
  ["we work in the niger delta", ["Niger Delta"]],
  ["we work in the islands", []],
  ["we work in new jersey", ["New Jersey"]],
  ["We work in New Mexico.", ["New Mexico"]],
  ["we work in the gulf of mexico", ["Gulf of Mexico"]],
  ["We work in war-torn South Sudan.", ["South Sudan"]],
  ["We work in Kenya, Uganda, Rwanda.", ["Kenya; Uganda; Rwanda"]],
  ["Estamos en WhatsApp y en Instagram.", []],
  ["We work in Mexico City Hall.", []],
  ["we're based in kitchens throughout the city", []],
  ["we work in support of Ukraine", []],
  ["we work in farms across kenya", []],
  ["We work in Canada, USA.", []],
  ["we work in the university of ghana", []],
  ["We work in the University of Ghana.", []],
  ["we work in parts of kenya", []],
  ["We work in the Democratic Republic of the Congo.", []],
  ["we work in drought-hit northern kenya", ["Northern Kenya"]],
  ["We work in post-war Sierra Leone.", ["Sierra Leone"]],
];

test("places the rules gave wrongly before are gone: nothing, or the place as it is written", async () => {
  const wrong: string[] = [];
  for (const [text, right] of FALSE_BEFORE) {
    const got = await where(text);
    if (got && !right.includes(got)) wrong.push(`${text} -> ${got}`);
  }
  assert.deepEqual(wrong, []);
});

test("the places the rules read before are still read", async () => {
  for (const [text, place] of [
    ["We are based in Awka, Nigeria.", "Awka, Nigeria"],
    ["We work in Mexico City with street vendors.", "Mexico City"],
    ["we are river keepers and we work in nairobi kenya", "Nairobi, Kenya"],
    ["our project works in the philippines with fishing families", "Philippines"],
    ["We operate in Awka.", "Awka"],
    ["Somos la Huerta Vila Nova, en Porto Alegre.", "Porto Alegre"],
    ["We are a seed library in Rio de Janeiro.", "Rio de Janeiro"],
    ["We work in Bosnia and Herzegovina with schools.", "Bosnia and Herzegovina"],
    // A fourth review found these lost by a wider first version of this change; they are held here.
    ["we work in uganda mostly with coffee farmers", "Uganda"],
    ["we work in peru helping farmers", "Peru"],
    ["we're based in kiambu county kenya", "Kiambu County, Kenya"],
    ["We work in Kakuma Refugee Camp.", "Kakuma Refugee Camp"],
    ["We work in the West Bank.", "West Bank"],
    ["We work in Tamil Nadu.", "Tamil Nadu"],
    ["We work in Cox's Bazar with Rohingya families.", "Cox's Bazar"],
    ["We work in the Niger Delta.", "Niger Delta"],
    ["We work in Kibera with young mothers.", "Kibera"],
    ["I work in Kibera with young mothers.", "Kibera"],
    ["we work in kinshasa with street children", "Kinshasa"],
    ["We work in Georgia, USA.", "Georgia, USA"],
    ["We work in Six Nations.", "Six Nations"],
    ["we work in Nairobi Kenya with schools", "Nairobi, Kenya"],
    // A code review found these lost by the first version of this change; they are held here too.
    ["We work in Scotland, UK.", "Scotland, UK"],
    ["We work in Hong Kong, China.", "Hong Kong, China"],
    ["We work in Kinshasa, DRC.", "Kinshasa, DRC"],
    ["We work in Panama, Panama.", "Panama, Panama"],
    ["we work in trans-nzoia kenya", "Trans-nzoia, Kenya"],
    ["we work in ado-ekiti nigeria", "Ado-ekiti, Nigeria"],
    // A place joined across "of" is written without the comma the rules put in before.
    ["We work in the Republic of Ireland.", "Republic of Ireland"],
    ["we work in the north of kenya", "North of Kenya"],
  ] as const)
    assert.equal(await where(text), place, text);
});
