// Question 1: does a funding program fit the shape of an initiative's needs and offers?
// Maps every committed catalog program into the shared shape and counts what fills it.
//
//   node packages/api/evaluation/experiments/matching-architecture/catalog-shape.mjs [--output <file>]
import { readFile, writeFile } from "node:fs/promises";
import { catalogCoverage, programKey, programToParty } from "./shape.mjs";

const root = new URL("../../../../../", import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
export async function loadCatalog() {
  const [catalog, rules, conditions, labels] = await Promise.all([json("dist/data/funders.json"), json("dist/data/eligibility-rules.json"),
    json("dist/data/program-conditions.json"), JSON.parse(await readFile(new URL("fixtures/team-requirement-labels.json", import.meta.url), "utf8"))]);
  return { funds: catalog.funds, compiledAt: catalog.compiledAt, rules: rules.rules, conditions: conditions.conditions, teamLabels: labels.labels };
}
export function catalogParties({ funds, rules, conditions, teamLabels }) {
  return funds.flatMap(fund => (fund.enrichment?.programs ?? []).map(program => programToParty(fund, program, rules, conditions, teamLabels)));
}

/** Thirteen programs chosen to differ in instrument, access, conditions and team wording. */
export const SAMPLE = [
  ["rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027", "open grant, current award, two fact rules, a three-role team in prose"],
  ["recSZN9ckNi2cuE1y::beni-confiscati-alle-mafie-2026-initiative", "open grant, partnership of at least three organizations in prose, no rules"],
  ["recdLQ4guN000D7Oh::dutch-philanthropic-partnership-support", "invitation route, two sourced partner conditions, matched funding with no fixed amount"],
  ["recwNYbgyirnLcv6X::creation-fund-phasei", "closed grant, sourced partner condition, historical award"],
  ["recOUk0NdykPghost::wff-sustainability-2026", "closed grant, applicant must be based in one country"],
  ["recdKMrhbjABCXgyM::san-francisco-collaboration-opportunity-2026", "open grant, collaboration required, fiscal sponsorship accepted"],
  ["local-mozilla::mozilla-independent-fellow-2027", "open fellowship for an individual"],
  ["local-whitley::whitley-2027", "open prize, individual leader backed by a local team"],
  ["recJnEGA1LiDXHdOp::benito-mass-scholarships-2026", "open scholarship, individuals only"],
  ["local-sovereign-tech::sovereign-tech-fund", "open mixed instrument, uncategorised conditions"],
  ["local-ardc::ardc-grants", "open grant, fiscal sponsorship accepted"],
  ["local-ma-earth::ma-earth-round4", "host partner required when the applicant is not a registered nonprofit"],
  ["local-gcc::gcc-digital-commons", "open grant for digital public goods, one uncategorised condition"],
];

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const catalog = await loadCatalog();
  const parties = catalogParties(catalog);
  const byId = new Map(parties.map(party => [party.id, party]));
  const coverage = catalogCoverage(parties);
  const overviewOnly = catalog.funds.filter(fund => !(fund.enrichment?.programs ?? []).length).length;
  const sample = SAMPLE.map(([id, why]) => {
    const party = byId.get(id);
    if (!party) throw Error(`sample_program_missing:${id}`);
    const offer = party.offers[0];
    const kinds = on => offer.conditions.filter(c => c.on === on);
    return { id, steward: party.steward, name: party.name, chosenFor: why,
      offer: { terms: offer.terms, status: offer.status, amount: offer.amount, closesOn: offer.window.closesOn, usableFor: offer.usableFor.length },
      conditions: { factRules: kinds("fact").map(c => `${c.field} ${c.operator} ${c.values.join(",")}`),
        sourcedStatements: kinds("statement").map(c => `${c.category}: ${c.text}`), prose: kinds("prose").map(c => c.text) },
      asks: party.asks.map(ask => `${ask.kind}: ${ask.text}`), teamWordingInProse: party.teamRequirementInProse, unmapped: party.unmapped };
  });
  const report = { reportDate: "2026-11-19", catalogCompiledAt: catalog.compiledAt, funds: catalog.funds.length, fundsWithNoProgram: overviewOnly,
    coverage, sample,
    note: "teamWordingInProse comes from fixtures/team-requirement-labels.json, one unreviewed reading of the catalog text. Everything else is counted from dist/data." };
  const index = process.argv.indexOf("--output");
  if (index > 0) await writeFile(process.argv[index + 1], JSON.stringify(report, null, 2) + "\n");
  const pct = n => `${n} (${(100 * n / coverage.programs).toFixed(0)}%)`;
  console.log(`${coverage.programs} programs across ${catalog.funds.length} funds; ${overviewOnly} funds have no researched program`);
  console.log(`offer: terms known ${pct(coverage.offer.termsKnown)}, amount stated ${pct(coverage.offer.amountStated)}, current amount ${pct(coverage.offer.amountCurrentOffer)}, closing date ${pct(coverage.offer.closingDate)}`);
  console.log(`conditions: fact rules ${pct(coverage.conditions.programsWithFactRules)}, sourced statements ${pct(coverage.conditions.programsWithSourcedStatements)}, either ${pct(coverage.conditions.programsWithEither)}, prose only ${pct(coverage.conditions.programsWithProseOnly)}, none ${pct(coverage.conditions.programsWithNone)}`);
  console.log(`team asks: structured on ${pct(coverage.asks.programsWithStructuredTeamAsk)} programs (${coverage.asks.structuredTeamAsks} conditions); prose wording ${JSON.stringify(coverage.asks.teamWordingInProse)}`);
  console.log(`offer status: ${JSON.stringify(coverage.offer.status)}`);
}
