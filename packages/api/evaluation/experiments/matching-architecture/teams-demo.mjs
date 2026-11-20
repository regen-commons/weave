// Worked examples for the gap-driven team prototype and the need-driven funding query
// (questions 4 and 5), on fictional initiatives and real catalog programs.
//
//   node packages/api/evaluation/experiments/matching-architecture/teams-demo.mjs [--output <file>]
import { readFile, writeFile } from "node:fs/promises";
import { loadCatalog } from "./catalog-shape.mjs";
import { createFundingEngine, fundsForPair, present, projectFromNeed, projectOf, suggestTeam } from "./teams.mjs";

export const NOW = new Date("2026-11-19T12:00:00Z");
const fixture = async name => JSON.parse(await readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8"));
export async function loadFixtures() {
  const [{ initiatives, publicWork }, { programs }] = await Promise.all([fixture("initiatives.json"), fixture("program-asks.json")]);
  return { initiatives, publicWork, asksByProgram: programs, byId: Object.fromEntries(initiatives.map(i => [i.id, i])) };
}

const CSCI = "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027";
const DUTCH = "recdLQ4guN000D7Oh::dutch-philanthropic-partnership-support";
const BENI = "recSZN9ckNi2cuE1y::beni-confiscati-alle-mafie-2026-initiative";
const FIJI = "recOUk0NdykPghost::wff-sustainability-2026";
const SCHOLARSHIP = "recJnEGA1LiDXHdOp::benito-mass-scholarships-2026";
const LOTTERY = "recNlZ47PGyebvRdD::lottery-awards-all-england";

export async function runExamples() {
  const catalog = await loadCatalog(), engine = createFundingEngine(catalog);
  const { initiatives, publicWork, asksByProgram, byId } = await loadFixtures();
  // The subject says which asks it already meets itself.
  const riverbend = { ...byId.riverbend, selfAnswers: { [CSCI]: { "community-organization": "self" } } };
  const kijani = { ...byId.kijani, selfAnswers: { [DUTCH]: { "local-owner": "self" } } };
  const team = (subject, programKey, extra = {}) => suggestTeam({ engine, subject, programKey, asks: asksByProgram[programKey]?.asks ?? [], initiatives, publicWork, now: NOW, ...extra });
  const without = id => initiatives.filter(i => i.id !== id);

  const forward = [
    { id: "full-cover", title: "A team of two covers both open asks", expect: "team_suggested", result: team(riverbend, CSCI) },
    { id: "private-viewer", title: "The same result for a person who has shared nothing: counts, no names", expect: "team_suggested",
      result: present(team({ ...riverbend, shared: false }, CSCI), { shared: false }) },
    { id: "partial-public-lead", title: "No shared local government: one ask stays open and the public project is a lead, not a cover", expect: "team_suggested",
      result: team(riverbend, CSCI, { initiatives: without("millcreek-county") }) },
    { id: "requested-from-fund", title: "Opened from the fund's page: a sourced partner condition, fit not assessed", expect: "team_suggested",
      result: team(kijani, DUTCH, { requested: true }) },
    { id: "not-requested-weak-fit", title: "The same program without being asked: nothing, because the fit is not established", expect: "nothing_to_suggest", result: team(kijani, DUTCH) },
    { id: "wrong-country-of-work", title: "Work is in Kenya, the program funds work in the United States: a partner cannot change that", expect: "nothing_to_suggest", result: team(kijani, CSCI, { requested: true }) },
    { id: "applicant-based-elsewhere", title: "Applicant must be based in Fiji and nobody shared there offers to lead: nothing", expect: "nothing_to_suggest", result: team(riverbend, FIJI, { requested: true }) },
    { id: "individuals-only", title: "A scholarship for individuals: no partner is willing to be that applicant", expect: "nothing_to_suggest", result: team(riverbend, SCHOLARSHIP, { requested: true }) },
    { id: "one-of-two-partners", title: "Two third-sector partners asked for, one shared: partial cover when requested", expect: "team_suggested", result: team(kijani, BENI, { requested: true }) },
    { id: "no-gap", title: "No sourced gap for this applicant: no team needed", expect: "no_team_needed",
      result: team({ id: "local-charity", name: "Fixture charity", shared: true, description: "A community centre bringing neighbours together in shared community spaces.", themes: ["community wellbeing"],
        facts: { applicantType: "nonprofit", applicantBaseCountry: "GB", registrationCountry: "GB", workCountries: ["GB"], benefitCountries: ["GB"] } }, LOTTERY) },
  ];

  // Diagnostic, not a product behaviour: the same examples with keyword matching alone deciding who covers an ask.
  const names = result => result.team?.members?.map(m => m.name).sort().join(" + ") ?? null;
  const textOnly = [["partial-public-lead", riverbend, CSCI, { initiatives: without("millcreek-county") }], ["one-of-two-partners", kijani, BENI, { requested: true }],
    ["full-cover", riverbend, CSCI, {}], ["requested-from-fund", kijani, DUTCH, { requested: true }]]
    .map(([id, subject, programKey, extra]) => ({ id, withConditions: names(forward.find(e => e.id === id).result), keywordOnly: names(team(subject, programKey, { ...extra, textOnly: true })) }))
    .map(row => ({ ...row, differs: row.withConditions !== row.keywordOnly }));

  const pair = (subject, partner, extra = {}) => fundsForPair({ engine, subject, partner, asksByProgram, initiatives, now: NOW, ...extra });
  const reverse = [
    { id: "pair-with-fit", title: "Two initiatives with a confirmed fit: programs that suit the pair", expect: "funds_suggested", result: pair(riverbend, byId["cascadia-practice"]) },
    { id: "pair-without-fit", title: "Two initiatives with no confirmed fit: nothing", expect: "nothing_to_suggest", result: pair(riverbend, byId["terra-aperta"]) },
    // Not a product behaviour: shows how often the uncalibrated theme reason fires when the fit precondition is ignored.
    { id: "theme-reason-without-precondition", title: "Diagnostic: the theme reason alone, for the pair with no fit", expect: null,
      result: (({ counts, funds }) => ({ counts, firstThree: funds.slice(0, 3) }))(pair(riverbend, byId["terra-aperta"], { checkPrecondition: false })) },
  ];

  // Question 5: what changes when the financial need is the funding query.
  const need = riverbend.needs.find(n => n.capitals.includes("financial"));
  const top = matches => matches.filter(m => m.program).slice(0, 10).map(m => m.documentId);
  const before = engine.all(projectOf(riverbend), NOW), after = engine.all(projectFromNeed(riverbend, need), NOW);
  const programs = after.filter(m => m.program);
  const comparable = programs.filter(m => m.program.award.basis === "current_offer" && m.program.award.currency === need.amount.currency && (m.program.award.min != null || m.program.award.max != null));
  const [, needEnd] = need.timeframe.split(" to ");
  const today = NOW.toISOString().slice(0, 10);
  const needQuery = {
    need: { title: need.title, amount: need.amount, timeframe: need.timeframe },
    topTenFromDescription: top(before), topTenFromNeed: top(after), topTenInCommon: top(before).filter(id => top(after).includes(id)).length,
    programs: programs.length,
    awardComparableToTheNeed: comparable.length,
    awardTooSmallForTheWholeNeed: comparable.filter(m => m.program.award.max != null && m.program.award.max < need.amount.min).length,
    awardMinimumAboveTheNeed: comparable.filter(m => m.program.award.min != null && m.program.award.min > need.amount.max).length,
    closingDateKnownAndStillOpen: programs.filter(m => m.program.application.closesOn && m.program.application.closesOn >= today).length,
    closingBeforeTheNeedEnds: programs.filter(m => m.program.application.closesOn && m.program.application.closesOn >= today && m.program.application.closesOn <= needEnd).length,
  };
  return { reportDate: "2026-11-19", now: NOW.toISOString(), status: "prototype on fictional initiatives and real catalog programs; mechanics, not measured quality", forward, keywordOnlyCovers: textOnly, reverse, needQuery };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const report = await runExamples();
  const index = process.argv.indexOf("--output");
  if (index > 0) await writeFile(process.argv[index + 1], JSON.stringify(report, null, 2) + "\n");
  for (const example of [...report.forward, ...report.reverse]) {
    const r = example.result;
    const detail = r.team ? (r.team.namesHidden ? `${r.team.partners} partners, ${r.team.covered} of ${r.team.total} covered, names hidden`
      : `${r.team.members.map(m => m.name).join(" + ")}; ${r.team.covered} of ${r.team.total} covered; lead ${r.team.lead}`)
      : r.funds ? r.funds.map(f => `${f.name} [${f.reasons}]`).slice(0, 3).join("; ") || r.reason : r.counts ? JSON.stringify(r.counts) : r.reason;
    const ok = example.expect === null ? "info" : r.status === example.expect ? "as expected" : `UNEXPECTED (${r.status})`;
    console.log(`${example.id.padEnd(34)} ${ok.padEnd(12)} ${detail}`);
  }
  for (const row of report.keywordOnlyCovers) console.log(`keyword-only cover ${row.id.padEnd(22)} ${row.differs ? "DIFFERS" : "same"}: ${row.keywordOnly} | with conditions: ${row.withConditions}`);
  console.log(`need as query: ${JSON.stringify({ ...report.needQuery, topTenFromDescription: undefined, topTenFromNeed: undefined })}`);
}
