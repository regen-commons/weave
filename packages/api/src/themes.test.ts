import assert from "node:assert/strict";
import { test } from "node:test";
import { fundFit, readInitiative, withFundFit, type RubricResult } from "./fund-fit.ts";
import { lowOrMiddleIncome, namedPlaces, namesLowOrMiddleIncome } from "./places.ts";
import { readThemes } from "./themes.ts";

const ids = (text: string, name = "") =>
  Object.fromEntries([...readThemes(text, name)].map(([id, { example, lead }]) => [id, example ? "example" : lead ? "lead" : "later"]));

test("a field named in an example list or as a subject taught is an example, not the subject", () => {
  assert.deepEqual(
    ids("Green Goods is an open-source app that helps community groups record their regenerative work, such as planting trees, sorting waste or keeping solar panels running.", "Green Goods"),
    { commons: "lead", regeneration: "lead", evidence: "lead", technology: "lead", forests: "example", waste: "example", energy: "example" },
  );
  assert.deepEqual(ids("We build solar-powered hubs. We run workshops on Web3 and climate, and we share our design."), {
    energy: "lead", education: "later", web3: "example", climate: "example",
  });
});

test("an initiative's own name, a negation and a phrase that means something else are not read as themes", () => {
  assert.deepEqual(ids("Tech and Sun builds hubs.", "Tech and Sun"), {});
  assert.deepEqual(ids("A simple way to give without crypto."), {});
  assert.deepEqual(ids("Evidence-based tools for amateur radio operators."), { technology: "lead" });
  assert.deepEqual(ids("A strong track record."), {});
  // Early childhood is its own field, not education.
  assert.deepEqual(ids("Early childhood development for children aged 0 to 6."), { childhood: "lead" });
});

test("Portuguese and Spanish words name the same themes, through the catalog's topics", () => {
  assert.deepEqual(ids("Una radio comunitaria hecha por pescadoras. Capacitamos a mujeres jóvenes en periodismo."), {
    ocean: "lead", education: "later", women: "later", youth: "later", media: "later",
  });
  assert.deepEqual(Object.keys(ids("Resgata os saberes ancestrais da Amazônia, com mudas nativas.")).sort(), ["indigenous", "nature"]);
});

test("places are read as countries and the catalog's regions, never Niger inside Nigeria", () => {
  const nigeria = namedPlaces("Solar hubs in Awka, Nigeria, and across West Africa.");
  assert.deepEqual([[...nigeria.countries], [...nigeria.regions]], [["NG"], ["Africa"]]);
  assert.deepEqual([...namedPlaces("Educación para América Latina").regions], ["Latin America & Caribbean"]);
  assert.deepEqual([...namedPlaces("Restoring Latin America's forests").countries], []);
  assert.ok(namesLowOrMiddleIncome("Projects in low- and middle-income countries"));
  assert.ok(lowOrMiddleIncome("NG") && !lowOrMiddleIncome("US"));
});

const program = (id: string, focus: string[], workCountries: string[] = [], regions: string[] = []): RubricResult => ({
  documentId: id,
  fund: { regions },
  program: { focus, beneficiaries: [], geography: { workCountries, scope: "" } },
  thematicFit: { version: "rubric", score: 50, band: "partial", label: "", evidenceTerms: [] },
});
const hub = { description: "We build free, solar-powered hubs in Nigeria where students get steady power, internet and a place to learn.", tags: [] };

test("fit weighs the field of work above the tools, and rises where the program names the initiative's country", () => {
  const reading = readInitiative(hub);
  const energyHere = fundFit(reading, program("a", ["Off-grid clean energy"], ["NG"]));
  const energyAnywhere = fundFit(reading, program("b", ["Solar energy access"]));
  const internet = fundFit(reading, program("c", ["Internet freedom", "Digital security"]));
  assert.deepEqual(energyHere.evidenceTerms, ["energy access", "Nigeria"]);
  assert.ok(energyHere.score! >= 60, "a field and the program's own country are a Strong fit");
  assert.ok(energyAnywhere.score! >= 40 && energyAnywhere.score! < energyHere.score!);
  assert.ok(internet.score! < 20, "internet freedom shares no field with a hub that offers internet");
});

test("a program that names only other countries keeps half its fit, as a caution and never an exclusion", () => {
  const reading = readInitiative(hub);
  const elsewhere = fundFit(reading, program("a", ["Solar energy access"], ["BR"]));
  const anywhere = fundFit(reading, program("b", ["Solar energy access"]));
  assert.equal(elsewhere.score, Math.round(anywhere.score! / 2));
  assert.ok(elsewhere.score! > 0);
});

test("a program the rubric could not assess stays unassessed, and the rubric's other results are untouched", () => {
  const unassessed = { ...program("a", []), thematicFit: { version: "rubric", score: null, band: "unknown" as const, label: "Fit not assessed", evidenceTerms: [] } };
  const [result] = withFundFit(hub, [{ ...unassessed, extra: 7 }]);
  assert.equal(result!.thematicFit.score, null);
  assert.equal(result!.extra, 7);
});

test("a theme named only as an example weighs a quarter, so a tool's examples do not make it an energy project", () => {
  const app = readInitiative({ description: "An open-source app for groups doing regenerative work, such as keeping solar panels running.", tags: [] });
  assert.ok(fundFit(app, program("a", ["Solar energy access"])).score! < 20);
  assert.ok(fundFit(app, program("b", ["Open source", "Public goods"])).score! >= 40);
});

test("review findings: everyday words are not countries, and longer place names are read whole", () => {
  const read = (text: string) => [...namedPlaces(text).countries].sort();
  assert.deepEqual(read("Fazemos uma reunião mensal no Ceará"), []);
  assert.deepEqual(read("La comunidad gana tierra en Granada"), []);
  assert.deepEqual(read("We raise guinea fowl"), []);
  assert.deepEqual(read("Reefs of Papua New Guinea"), ["PG"]);
  assert.deepEqual(read("Refugees from South Sudan"), ["SS"]);
  assert.deepEqual(read("Myanmar, Bosnia and Herzegovina, Hong Kong and Trinidad and Tobago"), ["BA", "HK", "MM", "TT"]);
});

test("review findings: e.g. opens an example list, negation reaches one word, and one phrase can name two themes", () => {
  assert.deepEqual(ids("An app for community groups, e.g. tree planting and solar panels."), { technology: "lead", forests: "example", energy: "example" });
  assert.deepEqual(ids("A non-profit education group doing no-till farming."), { education: "lead", farming: "lead" });
  assert.deepEqual(ids("Not a solar project."), {});
  assert.deepEqual(ids("Small-scale fisheries."), { farming: "lead", ocean: "lead" });
  assert.deepEqual(ids("We hold weekly sessions in the forest, planting trees."), { forests: "lead" });
  // Portuguese "dão" (they give) is not a DAO, and Spanish "media" (half) is not journalism.
  assert.deepEqual(ids("Mulheres que dão oficinas em media hectárea"), { women: "lead" });
});

test("review findings: an ask's audience is read as such only when it names people, and never weakens a reading", () => {
  const program = (id: string, focus: string[]): RubricResult => ({
    documentId: id, fund: {}, program: { focus, beneficiaries: [], geography: { workCountries: [], scope: "" } },
    thematicFit: { version: "rubric", score: 50, band: "partial", label: "", evidenceTerms: [] },
  });
  const solar = program("solar", ["Solar energy access"]);
  const card = { description: "A community garden.", tags: [] };
  const fit = (asks: string[]) => fundFit(readInitiative({ ...card, asks }), solar).score!;
  assert.equal(fit(["Funding for solar batteries"]), fit(["Solar batteries"]));
  const later = { description: "A community garden. We also keep solar inverters running.", tags: [] };
  assert.equal(fundFit(readInitiative({ ...later, asks: ["Spare parts, such as solar inverters"] }), solar).score,
    fundFit(readInitiative({ ...later, asks: [] }), solar).score);
});

test("second review: a country in parentheses is read, Congo is the Democratic Republic, and negation reaches past one verb", () => {
  const read = (text: string) => [...namedPlaces(text).countries].sort();
  assert.deepEqual(read("Solar hubs (Anambra, Nigeria)"), ["NG"]);
  assert.deepEqual(read("Forest work in the Congo Basin and the Democratic Republic of the Congo"), ["CD"]);
  assert.deepEqual(read("Republic of the Congo"), ["CG"]);
  assert.deepEqual(read("New South Wales and Northern Ireland"), ["AU", "GB"]);
  assert.deepEqual(ids("We do not use blockchain."), {});
  assert.deepEqual(ids("Our app does not need internet."), { technology: "lead" });
  assert.deepEqual(ids("A DAO for climate."), { web3: "lead", climate: "lead" });
  assert.deepEqual(ids("Elas dão oficinas."), {});
});
