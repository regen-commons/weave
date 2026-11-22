// Fill In The Fields from words as speech gives them, and from a file, with the keyword rules alone
// (DL-127). Many browsers return what was said without capitals or full stops, and the written
// rules read a name and a place by both. Each expectation is what the words state and nothing
// more: where the shape the page asks for is not there, the field stays empty.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { fileNote } from "../src/describe/file-note.ts";
import { changeSaid, fieldsForm, fillFields } from "../src/describe/fill.ts";
import { aboutPassage, collectSource, fromSource } from "../src/describe/keywords.ts";
import { fileName, heard, spokenName } from "../src/describe/names.ts";
import { spokenWhere } from "../src/describe/places.ts";

const build: NonNullable<DeviceDraft["lastBuild"]> = { engine: "keywords", unreadFiles: 0, sourceCharacters: 0, files: [], fallback: false };
const textFile = (name: string, text: string) => {
  const blob = new Blob([text], { type: "text/plain" });
  return { id: crypto.randomUUID(), name, type: "text/plain", bytes: blob.size, blob };
};
/** What the page does on Fill In The Fields, or when a file is added: read the sources, then fill in place. */
async function fill(said: string, files: readonly ReturnType<typeof textFile>[] = []) {
  const draft = revise(changeSaid(newDraft(), said), { attachments: [...files] }, true);
  const { suggestion } = fromSource(draft, await collectSource(draft));
  return fieldsForm(fillFields(draft, suggestion, build).draft);
}

const SPOKEN: readonly { said: string; name: string; where: string }[] = [
  // The shape the page's example shows, as a recognizer returns it: no capitals, no full stops.
  { said: "we are orchard learning circle based in nairobi we help families restore the riverbank", name: "Orchard Learning Circle", where: "Nairobi" },
  // Some recognizers give a known place its capital and nothing else.
  { said: "We are orchard learning circle based in Nairobi we help families restore the riverbank", name: "Orchard Learning Circle", where: "Nairobi" },
  { said: "our project is called river keepers and we are based in nairobi kenya and we teach schools about water", name: "River Keepers", where: "Nairobi, Kenya" },
  { said: "um so we're the seed library, based in awka, nigeria. we lend seeds to growers", name: "Seed Library", where: "Awka, Nigeria" },
  { said: "we are river keepers based in rio de janeiro we clean beaches with schools", name: "River Keepers", where: "Rio de Janeiro" },
  { said: "river keepers is based in nairobi", name: "River Keepers", where: "Nairobi" },
  { said: "river keepers is a community group that cleans the river", name: "River Keepers", where: "" },
  { said: "the name is green roots collective and we run community gardens", name: "Green Roots Collective", where: "" },
  { said: "hi i run a seed library and it's called awka seed library", name: "Awka Seed Library", where: "" },
  // What a group is doing, or who its people are, is not what it is called.
  { said: "we are working with farmers based in kenya", name: "", where: "" },
  // "Farmers based in Kenya" may say where the farmers are from, as the written rules also hold.
  { said: "we are farmers based in kenya", name: "", where: "" },
  { said: "we are a group of volunteers based in lagos", name: "", where: "Lagos" },
  { said: "we are happy to be here and this is a test", name: "", where: "" },
  // A place that is someone else's, a list, and a phrase that names no one place leave Where empty.
  { said: "we work with farmers based in lagos", name: "", where: "" },
  { said: "we are based in lagos and accra", name: "", where: "" },
  { said: "we are based in rural communities", name: "", where: "" },
  { said: "we are based in a small village near kisumu", name: "", where: "" },
];

test("words as speech gives them fill Name and Where you work, with the capitals a written name has", async () => {
  for (const { said, name, where } of SPOKEN) {
    const form = await fill(said);
    assert.equal(form.name, name, `name from: ${said}`);
    assert.equal(form.where, where, `where from: ${said}`);
    // About it is the person's own words, whatever was read from them.
    assert.ok(form.about.toLocaleLowerCase().startsWith(said.slice(0, 20).toLocaleLowerCase()), `about from: ${said}`);
  }
});

// Ways people introduce an initiative aloud that are not the page's example. Each is run as an
// on-device recognizer writes it (capitals and stops), as a browser's speech service does (a
// capital only on a place it knows), and with no capitals at all. A place after the plainer words
// ("we work in", "we're in", "it's in") is taken only when it has its capital or names a country.
const VOICES: readonly { said: string; name: string; where: string; known?: string; bare?: string }[] = [
  { said: "My name is Amina and I run a project called Green Roots in Kisumu, Kenya. We plant trees with schools.", name: "Green Roots", where: "Kisumu, Kenya" },
  { said: "Hello, my name is David. I'm the founder of Ocean Guardians. We are located in Mombasa.", name: "Ocean Guardians", where: "Mombasa" },
  { said: "So our organization is called the Bamboo Collective and we are based in northern Thailand.", name: "Bamboo Collective", where: "Northern Thailand", known: "northern Thailand" },
  { said: "We call ourselves the Tidal Gardeners and we're based in Portland, Oregon.", name: "Tidal Gardeners", where: "Portland, Oregon", bare: "Portland Oregon" },
  { said: "The name of our initiative is Harvest Hub and we are based in Des Moines, Iowa.", name: "Harvest Hub", where: "Des Moines, Iowa", bare: "Des Moines Iowa" },
  { said: "I lead an initiative called Clean Water for All and we are headquartered in Accra, Ghana.", name: "Clean Water for All", where: "Accra, Ghana" },
  { said: "We're Greenpill Nigeria, a community of builders, and we're in Lagos, Nigeria.", name: "Greenpill Nigeria", where: "Lagos, Nigeria" },
  { said: "We are River Keepers and we restore the riverbank. We're in Nairobi.", name: "River Keepers", where: "Nairobi", bare: "" },
  { said: "It's called the Repair Cafe and it's in Bristol.", name: "Repair Cafe", where: "Bristol", bare: "" },
  { said: "Um, okay, so, uh, we are, um, River Keepers and, uh, we're based in, like, Nairobi.", name: "River Keepers", where: "Nairobi" },
  { said: "Good morning. This is the Tamarind Valley Cooperative, located in Chiang Mai, Thailand.", name: "Tamarind Valley Cooperative", where: "Chiang Mai, Thailand" },
  { said: "We are the Atlas Mountain Weavers, a women's cooperative based in Morocco.", name: "Atlas Mountain Weavers", where: "Morocco" },
  { said: "The organisation's name is Highland Seed Bank and it is based in Addis Ababa.", name: "Highland Seed Bank", where: "Addis Ababa" },
  { said: "We are Open Rivers and we are based in Bosnia and Herzegovina.", name: "Open Rivers", where: "Bosnia and Herzegovina" },
  { said: "We are New Roots Community Farm, based in Durham, North Carolina, and we grow food with families.", name: "New Roots Community Farm", where: "Durham, North Carolina", bare: "Durham North Carolina" },
  { said: "The name is River Keepers. Where we work is Nairobi, Kenya. What we do is restore the riverbank.", name: "River Keepers", where: "Nairobi, Kenya" },
  // "We work in" answers what the page asks, where you work (21 November 2026).
  { said: "We are Blue Mangrove Trust. We work in Kerala, India, restoring mangroves with fishing families.", name: "Blue Mangrove Trust", where: "Kerala, India" },
  { said: "Our name is Kelp Forest Alliance. We work across Australia.", name: "Kelp Forest Alliance", where: "Australia" },
  { said: "We are Open Rivers and we operate in Bosnia and Herzegovina.", name: "Open Rivers", where: "Bosnia and Herzegovina" },
  { said: "We are River Keepers and we work in Nairobi.", name: "River Keepers", where: "Nairobi", bare: "" },
];
/** The words as a browser's speech service gives them: no stops, and a capital only on the places it knows. */
const asService = (said: string, where: string) => {
  const places = new Map(where.split(/[ ,]+/u).filter(Boolean).map((word) => [word.toLocaleLowerCase(), word]));
  return said
    .replace(/[.,!?]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => places.get(word.toLocaleLowerCase()) ?? (/^I(?:'|$)/u.test(word) ? word : word.toLocaleLowerCase()))
    .join(" ");
};
const plain = (value: string) => value.toLocaleLowerCase().replace(/,/gu, "");

test("the ways people introduce an initiative aloud fill Name and Where you work, however the recognizer writes them", async () => {
  for (const { said, name, where, known = where, bare = where } of VOICES) {
    const written = await fill(said);
    assert.equal(plain(written.name), plain(name), `name as written: ${said}`);
    assert.equal(plain(written.where), plain(where), `where as written: ${said}`);
    const service = await fill(asService(said, known));
    assert.equal(plain(service.name), plain(name), `name from a speech service: ${said}`);
    assert.equal(plain(service.where), plain(where), `where from a speech service: ${said}`);
    const lower = await fill(said.replace(/[.,!?]/gu, " ").replace(/\s+/gu, " ").trim().toLocaleLowerCase());
    assert.equal(plain(lower.name), plain(name), `name without capitals: ${said}`);
    assert.equal(plain(lower.where), plain(bare), `where without capitals: ${said}`);
  }
  // A place said without capitals is written with them, and with the comma before its country.
  assert.equal((await fill("we are river keepers based in nairobi kenya schools love us")).where, "Nairobi, Kenya");
  assert.equal((await fill("we are river keepers we operate out of western kenya")).where, "Western Kenya");
  assert.equal(heard("Um, we're we're based in, uh, Nairobi, you know, by the river"), "we're based in Nairobi, by the river");
});

test("a person, someone else's project and a description are never taken for the name", async () => {
  for (const said of [
    "my name is amina i am based in nairobi",
    "i am called peter and i am a farmer in meru",
    "I'm Sarah from Coastal Roots.",
    "we work with a school called saint mary's in kisumu",
    "we work in a village called kibera",
    "we are three sisters from ghana and we make shea butter",
    "we are community organizers and we work with tenants",
    "we are very excited and we cannot wait to start",
    "we are women led and we are based in lagos",
    "we are open source and we build tools",
    "we are passionate about clean water and we are based in uganda",
    "we plant trees with schools and later we are happy campers and we sing",
    "our school is under resourced and we need books",
    "our team is fully remote and we meet online",
    "we run workshops for kids in nairobi",
    "Good morning. Thank you for having us.",
  ])
    assert.equal((await fill(said)).name, "", said);
  // A name the written rules once ran on past: it ends where the sentence goes on.
  assert.equal((await fill("The project is called Water for Tomorrow and it's in rural Rwanda.")).name, "Water for Tomorrow");
  assert.equal((await fill("my name is john and i live in boston but it's called haiti reforest")).name, "Haiti Reforest");
});

test("the plainer words name a place only when it is known to be one", async () => {
  for (const said of [
    // "We work in" names a sector as often as a place: one counts only with its capital or a country's name.
    "we are river keepers and we work in nairobi",
    "We work in Education.",
    "We work in WASH programmes.",
    "We work in Early Childhood Development.",
    "We are working in Partnership with schools.",
    "We work in Yoruba with families.",
    "we work in regenerative agriculture with farmers",
    "we work in three counties",
    "we work across sectors and borders",
    "He works in Finance at Shell.",
    // Not places at all.
    "we're in our third year and we love it",
    "We're in Partnership with schools.",
    "It's in Kiswahili and English.",
    "we are based in the cloud",
    "We are based in Plot 12, Zik Avenue, Awka.",
    "we are a community based group",
    "River Keepers. Welcome. We restore the riverbank.",
    // Someone else's place, a hometown, two places and a list.
    "we are looking for funders based in europe",
    "we're from toronto canada",
    "we're in lagos nigeria and our office is in accra ghana",
    "we're in kenya uganda and tanzania",
  ])
    assert.equal((await fill(said)).where, "", said);
  // In the person's own words "we work in" is read where the place is known (21 November 2026).
  assert.equal((await fill("We operate in Awka.")).where, "Awka");
  assert.equal((await fill("we are river keepers and we work in nairobi kenya")).where, "Nairobi, Kenya");
  assert.equal((await fill("our project works in the philippines with fishing families")).where, "Philippines");
  // In a file it never is (19 November 2026): a document says "we work in" of sectors and programmes.
  assert.equal((await fill("", [textFile("about.txt", "River Keepers\nWe work in Nairobi, Kenya. We restore the riverbank with schools.")])).where, "");
  assert.equal((await fill("We restore the riverbank.", [textFile("about.txt", "We operate in Awka.")])).where, "");
  assert.equal((await fill("River Keepers. Nairobi, Kenya. We restore riverbanks with schools.")).where, "Nairobi, Kenya");
  assert.equal((await fill("We are River Keepers, a Nairobi based group restoring the river.")).where, "Nairobi");
  assert.equal((await fill("Name: Sol y Tierra. Location: Oaxaca. We grow agave.")).where, "Oaxaca");
  assert.equal((await fill("name river keepers location nairobi kenya description we restore the riverbank")).where, "Nairobi, Kenya");
});

test("the spoken rules are only for words the written rules found nothing in", async () => {
  // Written with capitals and full stops, the words are read as before, capital for capital.
  const written = await fill("We are Orchard learning circle, based in Upper Valley, Brazil. Families share an orchard.");
  assert.deepEqual([written.name, written.where], ["Orchard learning circle", "Upper Valley, Brazil"]);
  // Two different places written out leave Where empty, and the spoken rule does not overrule that.
  const two = await fill("We are based in Lagos. Our partners are based in Accra.");
  assert.equal(two.where, "");
  assert.deepEqual(spokenWhere("We are based in Lagos. Our partners are based in Accra.").locations, []);
  // Nothing is made up from a description.
  assert.equal(spokenName("families share what they learn about the orchard"), "");
  assert.deepEqual(spokenWhere("families share what they learn about the orchard").locations, []);
});

test("the spoken rules stay cheap on any input", () => {
  const long = `we are ${"very ".repeat(200_000)}based in ${"far ".repeat(200_000)}`;
  const started = performance.now();
  spokenName(long);
  spokenWhere(long);
  assert.ok(performance.now() - started < 500, "each rule reads only the start");
});

test("a file is read for the name, the place and the description when it is added (DL-127)", async () => {
  const notes = textFile(
    "about.txt",
    "Project Proposal\n\nMarch 2026\n\nRiver Keepers is a community group based in Nairobi, Kenya. We restore the riverbank with local families and teach schools about clean water.\n\nBudget\n\n1. Tools",
  );
  // A file alone fills all three. Its own title and date are not the initiative's name or its description.
  const alone = await fill("", [notes]);
  assert.equal(alone.name, "River Keepers");
  assert.equal(alone.where, "Nairobi, Kenya");
  assert.equal(
    alone.about,
    "River Keepers is a community group based in Nairobi, Kenya. We restore the riverbank with local families and teach schools about clean water.",
  );
  // The person's own description stays theirs, and the file gives what their words left out.
  const both = await fill("We clean the river every month and plant trees along its banks.", [notes]);
  assert.equal(both.about, "We clean the river every month and plant trees along its banks.");
  assert.equal(both.name, "River Keepers", "the name the words did not give comes from the file");
  assert.equal(both.where, "Nairobi, Kenya");
  // A few words that are only a name are not a description, so the file's is used.
  const named = await fill("Banks And Trees", [notes]);
  assert.equal(named.name, "Banks And Trees", "the person's name wins over the file's");
  assert.ok(named.about.startsWith("River Keepers is a community group"), named.about);
});

test("a file's own title is not taken for the initiative's name, and a file with no description gives none", () => {
  assert.equal(fileName("Annual Report\n\nWe plant trees."), "");
  assert.equal(fileName("Concept Note\n\nWe plant trees."), "");
  assert.equal(fileName("Tree Keepers\n\nWe plant trees."), "Tree Keepers");
  assert.equal(aboutPassage("Budget\n\n1. Tools\n2. Seeds"), "");
  // A line end inside a paragraph, as a PDF gives it, is read as a space.
  // The heading after the paragraph is not run into it.
  assert.equal(
    aboutPassage("Contents\n\nOur group helps families\nrestore the old orchard together. It meets weekly.\n\nContact"),
    "Our group helps families restore the old orchard together. It meets weekly.",
  );
});

test("each added file says what the reading made of it", () => {
  const file = { id: "0b0f4f52-5d0b-4c0e-9a55-6a8f7a2f1c11", name: "notes.pdf", type: "application/pdf" };
  assert.equal(fileNote(file, [], true), "reading on this device");
  assert.equal(fileNote(file, []), "kept on this device, not read yet");
  assert.equal(fileNote(file, [{ id: file.id, pages: 4, unreadPages: 0, status: "read" }]), "read on this device");
  assert.equal(fileNote(file, [{ id: file.id, pages: 4, unreadPages: 1, status: "partial" }]), "read on this device, except 1 of 4 pages");
  assert.equal(fileNote(file, [{ id: file.id, pages: 0, unreadPages: 0, status: "unread" }]), "kept on this device, but its text could not be read");
  assert.equal(fileNote({ ...file, name: "photo.jpg", type: "image/jpeg" }, [], true), "kept on this device, content not read");
});
