import assert from "node:assert/strict";
import { test } from "node:test";
import { rankPartnerMatches, type PartnerEntry, type ProjectEvidence } from "./partner-matcher.ts";
import { neededRoles, projectRoles, rankPartners } from "./partner-ranking.ts";
import { readThemes } from "./themes.ts";

const evidence = (uri: string, name: string, passage: string): ProjectEvidence => ({
  id: `${uri}:0`, projectUri: uri, projectName: name, sourceUri: uri, sourceUrl: `https://source.example/${name}`,
  cid: "cid", contentHash: "hash", fieldPath: "$.description", passage, sourceCreatedAt: "2026-11-01T00:00:00Z",
  sourceIndexedAt: "2026-11-02T00:00:00Z", fetchedAt: "2026-11-20T00:00:00Z", extractionVersion: "test", kind: "work",
});
const tool = {
  name: "Ledger", description: "Ledger is an open-source app that helps community groups record their regenerative work, such as keeping solar panels running or teaching classes.",
  locations: ["Awka, Nigeria"], isGlobal: true, lenses: ["technology"], themes: [],
};
const entry = (entryId: string, kind: "need" | "offer", title: string, description: string, capitalForms: string[], placeScope = "anywhere", summary: object = tool): PartnerEntry => ({
  initiativeId: "at://ledger", revision: 1, entryId, kind, summary: summary as PartnerEntry["summary"],
  value: { status: "open", title, description, purpose: null, placeScope, capitalForms },
});
const hub = evidence("at://hub", "Sun Hub", "We build free, solar-powered hubs in Nigeria where students learn and work, and run workshops for local builders.");
const birds = evidence("at://birds", "Night birds", "Bioacoustic recordings of nocturnal urban wildlife to track species with AudioMoth sensors.");
const own = evidence("at://ledger", "Ledger", "Ledger is an open-source app that helps community groups record their regenerative work.");
const corpus = [hub, birds, own];

test("a need for communities to pilot with finds a place-based community doing the work the tool records, without shared words", () => {
  const pilots = entry("pilots", "need", "Communities to pilot it", "Groups doing this kind of work who will try it for a season.", ["social"]);
  assert.deepEqual(rankPartnerMatches({ queries: [pilots], publicEvidence: [hub] }), [], "the word matcher alone finds nothing");
  const [match, ...rest] = rankPartners({ queries: [pilots], publicEvidence: corpus });
  assert.equal(match!.counterpart.id, "at://hub");
  assert.equal(match!.evidenceKind, "inferred_capability");
  assert.deepEqual(match!.reasons, [{ type: "complement", terms: ["a place-based community", "energy access", "education and skills", "Nigeria"] }]);
  assert.ok(match!.unknowns.includes("availability"), "public work never confirms availability");
  assert.ok(rest.every(({ counterpart }) => counterpart.id !== "at://ledger"), "an initiative is never its own partner");
});

test("an offer of a recording app is not offered to projects that make bioacoustic recordings", () => {
  const app = entry("app", "offer", "App for recording community work", "An offline app and dashboard.", ["intellectual"]);
  const ranked = rankPartners({ queries: [app], publicEvidence: corpus });
  assert.equal(ranked[0]!.counterpart.id, "at://hub");
  assert.equal(ranked[0]!.evidenceKind, "potential_use");
  assert.ok(!ranked.some(({ counterpart }) => counterpart.id === "at://birds"));
});

test("a need for money alone is answered only by a project that says it funds others", () => {
  const money = entry("money", "need", "Funding to keep running", "Money for batteries, internet and community support.", ["financial"]);
  assert.deepEqual(rankPartners({ queries: [money], publicEvidence: corpus }), []);
  const fund = evidence("at://fund", "Community fund", "We fund community groups doing regenerative work in Nigeria with small grants to communities.");
  assert.deepEqual(rankPartners({ queries: [money], publicEvidence: [...corpus, fund] }).map(({ counterpart }) => counterpart.id), ["at://fund"]);
});

test("an offer kept to here reaches only projects named in the same country", () => {
  const desks = entry("desks", "offer", "Free desk space", "Desks with power and internet for study and work.", ["material"], "here");
  const kenya = evidence("at://kenya", "Kenya hub", "A community hub in Nairobi, Kenya, where students learn and work.");
  const ranked = rankPartners({ queries: [desks], publicEvidence: [hub, kenya] });
  assert.deepEqual(ranked.map(({ counterpart }) => counterpart.id), ["at://hub"]);
});

test("the word matcher's own results keep their reasons and gain what links the two sides", () => {
  const record = entry("record", "need", "A record of what the hub delivers", "A simple app to record attendance and outcomes for funders.", ["intellectual"], "anywhere",
    { name: "Sun Hub", description: "We build solar-powered hubs in Nigeria.", locations: [], isGlobal: false, lenses: [], themes: [] });
  const ledger = evidence("at://ledger2", "Ledger", "Ledger is an open-source app that helps community groups record and review their work so funders can see outcomes.");
  const [match] = rankPartners({ queries: [{ ...record, initiativeId: "at://hub" }], publicEvidence: [ledger, hub] });
  assert.equal(match!.counterpart.id, "at://ledger2");
  assert.deepEqual(match!.reasons.map(({ type }) => type), ["shared_terms", "complement"]);
  assert.equal(match!.reasons.at(-1)!.terms[0], "a tool builder");
});

test("roles come from what a project says it is and does: using a sensor is not building a tool, and a university campus is a place", () => {
  const text = "We use AudioMoth sensors to monitor birds in a forest reserve.";
  assert.deepEqual([...projectRoles(text, readThemes(text), 0)].sort(), ["place", "research"]);
  const app = "We build an open-source platform for cooperatives.";
  assert.deepEqual([...projectRoles(app, readThemes(app), 0)], ["builder"]);
  assert.deepEqual([...neededRoles(entry("x", "need", "Partners to run workshops at the hub", "Experts to lead sessions.", ["experiential"]))], ["learning"]);
  assert.deepEqual([...neededRoles(entry("y", "need", "Uma ferramenta para registrar o trabalho", "Um aplicativo simples.", ["intellectual"]))], ["builder"]);
  assert.deepEqual([...neededRoles(entry("z", "need", "Communities to pilot our app", "Groups to test it.", ["social"]))], ["place"]);
});

test("review findings: seeking investors is not funding others, and volunteers to raise funds are not a need for money alone", () => {
  const money = entry("money", "need", "Funding to keep running", "Money for batteries and support.", ["financial"]);
  const seeking = evidence("at://kiosk", "Kiosks", "We are looking for investors to grow our solar kiosks. Our kiosks sell solar batteries in Nigeria.");
  assert.deepEqual(rankPartners({ queries: [money], publicEvidence: [seeking] }), []);
  const bake = entry("bake", "need", "Volunteers to help raise funds", "A bake sale for our school garden.", ["social"]);
  const club = evidence("at://bakers", "Neighbourhood Bake Club", "Our neighbourhood bake club runs bake sales for local school gardens.");
  assert.deepEqual(rankPartners({ queries: [bake], publicEvidence: [club] }).map(({ counterpart }) => counterpart.id), ["at://bakers"]);
});

test("review findings: a reason names only what the passage shown supports, and a shared theme alone is not enough", () => {
  const pilots = entry("pilots", "need", "Communities to pilot it", "Groups doing this kind of work.", ["social"]);
  // Nigeria is named only in the second passage, so a match shown on the first does not claim it.
  const split: ProjectEvidence[] = [
    { ...evidence("at://split", "Split hub", "We run free solar-powered hubs where students learn and work."), id: "s1" },
    { ...evidence("at://split", "Split hub", "Our home is a small town."), id: "s2", passage: "Our home is Awka, Nigeria." },
  ];
  const [match] = rankPartners({ queries: [pilots], publicEvidence: split });
  assert.equal(match!.evidence.type === "public" && match!.evidence.id, "s1");
  assert.ok(!match!.reasons.at(-1)!.terms.includes("Nigeria"));
  // One field from the initiative and the role, with no second field and no shared country, is a theme alone.
  const thin = evidence("at://thin", "Thin", "A village group that plants trees.");
  const app = { ...tool, description: "Ledger is an app for groups doing regenerative work, such as planting trees.", locations: [] };
  assert.deepEqual(rankPartners({ queries: [entry("p2", "need", "Communities to pilot it", "Groups to try it.", ["social"], "anywhere", app)], publicEvidence: [thin] }), []);
});

test("second review: a need kept to here still needs a field, and receiving or investing locally is not funding others", () => {
  const tryModel = entry("try", "need", "Communities to try our hub model", "Groups who will try it.", ["social"], "here");
  const local = evidence("at://local", "Local garden", "A village garden in Awka, Nigeria, where neighbours meet.");
  assert.deepEqual(rankPartners({ queries: [tryModel], publicEvidence: [local] }), []);
  const money = entry("money", "need", "Funding to keep running", "Money for batteries.", ["financial"]);
  for (const passage of ["We invest in our community and its gardens in Nigeria.", "We received grants to communities from the state."])
    assert.deepEqual(rankPartners({ queries: [money], publicEvidence: [evidence("at://x", "X", passage)] }), [], passage);
  const funder = evidence("at://fund", "Fund", "Communities apply and we fund local groups that address community needs in Nigeria.");
  assert.equal(rankPartners({ queries: [money], publicEvidence: [funder] })[0]?.counterpart.id, "at://fund");
});

test("Tech & Sun's impact-tracking need finds Green Goods' public capability and skips tool users and reports", () => {
  const need = entry("hub-impact", "need", "A tracking tool for solar hub impact",
    "We need a tool to document evidence, log activities and report the impact of our solar hubs. Our first pilot operates in Awka, Nigeria.",
    ["material"], "anywhere", { name: "Tech & Sun", description: "Solar-powered hubs for students and builders in Awka, Nigeria." });
  const projects = [
    evidence("at://green-goods", "Green Goods", "Communities can plan work, document evidence, review contributions and connect their activity with support."),
    evidence("at://trees", "Seeds of Hope", "Our school tree-planting report documents activities and evidence to track our impact."),
    evidence("at://sensors", "Nkhoma Mountain", "We use an open-source platform to log activities, document evidence and track impact."),
    evidence("at://aspiration", "Future dashboard", "We plan to build an app to log activities and document evidence."),
    evidence("at://negation", "No dashboard", "We provide no tool for impact tracking; our team documents evidence."),
  ];
  assert.deepEqual([...neededRoles(need)], ["builder"]);
  const ranked = rankPartners({ queries: [need], publicEvidence: projects });
  assert.deepEqual(ranked.map(({ counterpart, evidenceKind }) => [counterpart.name, evidenceKind]), [
    ["Green Goods", "inferred_capability"],
  ]);
  assert.ok(ranked[0]!.unknowns.includes("availability"));
});

test("a plain request for a record of hub work finds a tool for documenting and reviewing activities", () => {
  const need = entry("hub-record", "need", "A clear record of what the hub delivers",
    "A simple way to record attendance, uptime and outcomes that funders and partners can check.", ["intellectual"], "anywhere", {});
  const ledger = evidence("at://green-goods", "Green Goods", "Green Goods is an open-source app that helps community groups plan, record and review their regenerative work.");
  const decoy = evidence("at://decoy", "Generic platform", "We built a platform for community discussion and event invitations.");
  assert.deepEqual(rankPartners({ queries: [need], publicEvidence: [decoy, ledger] }).map(({ counterpart }) => counterpart.id), [ledger.projectUri]);
});

test("a biodiversity-data tool need requires the tool and its purpose in the cited evidence", () => {
  const need = entry("wildlife-data", "need", "Open tooling to record biodiversity", "Software for wildlife observations.", ["intellectual"], "anywhere", {});
  const genuine = evidence("at://tool", "Wildlife tools", "We build open tools for local groups to record their biodiversity data.");
  const generic = evidence("at://generic", "Platform", "We build a platform for supply chain traceability.");
  const fieldwork = evidence("at://users", "Field work", "We record biodiversity observations using open tools.");
  const separate = evidence("at://generic", "Platform", "Our team records wildlife observations as part of our annual volunteering day.");
  const matches = rankPartners({ queries: [need], publicEvidence: [generic, genuine, fieldwork, separate] });
  assert.deepEqual(matches.map(({ evidenceKind, counterpart }) => [evidenceKind, counterpart.id]), [["inferred_capability", genuine.projectUri]]);
  assert.ok(matches[0]!.reasons.some(({ terms }) => terms.includes("biodiversity data tools")));
});

test("explicit tutoring answers a French agroforestry need without joining unrelated claims", () => {
  const need = entry("tutor", "need", "Formation et accompagnement en agroforesterie", "Nous cherchons des formateurs.", ["experiential"], "anywhere", {});
  const genuine = evidence("at://tutors", "Field tutors", "We offer an agroforestry model adapted to local contexts, and provide tutoring and consultancy along the way.");
  const growers = evidence("at://growers", "Growers", "We grow trees in an agroforestry trial. We teach other groups how to build solar panels.");
  const request = evidence("at://seeking", "Seeking tutors", "We are looking for partners to provide agroforestry tutoring.");
  const denial = evidence("at://excluded", "Other tutors", "We provide tutoring, but none on agroforestry.");
  assert.deepEqual(rankPartners({ queries: [need], publicEvidence: [growers, request, denial, genuine] }).map(({ counterpart }) => counterpart.id), [genuine.projectUri]);
});

test("a request to borrow named recorders requires evidence of lending that equipment", () => {
  const need = entry("borrow", "need", "Loan of AudioMoth recorders", "We need to borrow AudioMoth units.", ["material"], "anywhere", {});
  const lender = evidence("at://lender", "Tool library", "Our AudioMoth recorders are available to borrow.");
  const financiers = evidence("at://finance", "Lenders", "We provide loans to buy AudioMoth equipment.");
  const other = evidence("at://other", "Other library", "Our Song Meter recorders are available to borrow.");
  assert.deepEqual(rankPartners({ queries: [need], publicEvidence: [birds, financiers, other, lender] }).map(({ counterpart }) => counterpart.id), [lender.projectUri]);
});

test("a local need uses resolved project and initiative countries and rejects unknown locations", () => {
  const need = entry("river", "need", "Local community groups for river restoration", "A community group for a pilot site.", ["social"], "here",
    { locations: ["Sofia"] });
  const local = evidence("at://sofia", "Sofia's rivers", "Rivers of Sofia: Reclaiming our city's waterways for local communities.");
  const foreign = evidence("at://foreign", "River work", "We work in Awka with local communities to restore the river.");
  const unknown = evidence("at://unknown", "River group", "Our local communities restore rivers.");
  const matches = rankPartners({ queries: [need], publicEvidence: [foreign, unknown, local] });
  assert.deepEqual(matches.map(({ counterpart }) => counterpart.id), [local.projectUri]);
  assert.ok(matches[0]!.reasons.some(({ terms }) => terms.includes("Bulgaria")));
});

test("a local need for childcare requires evidence of providing childcare", () => {
  const need = entry("care", "need", "Supervised childcare during training",
    "We need someone to provide childcare at sessions for parents.", ["social"], "here", { locations: ["Uganda"] });
  const provider = evidence("at://care", "Session childcare", "We provide supervised childcare during training sessions in Kampala, Uganda.");
  const trainers = evidence("at://farm", "Farmer training", "We run farm training with parents and young people in Uganda.");
  const funders = evidence("at://funder", "Caregiver training", "We fund supervised childcare training for caregivers in Uganda.");
  const request = evidence("at://seeking-care", "Parent workshop", "We are looking for supervised childcare during training sessions in Uganda.");
  const wrongPlace = evidence("at://kenya-care", "Kenya childcare", "We run supervised childcare at training sessions in Nairobi, Kenya.");
  assert.deepEqual(rankPartners({ queries: [need], publicEvidence: [trainers, funders, request, wrongPlace, provider] })
    .map(({ counterpart }) => counterpart.id), [provider.projectUri]);
});

test("a specific need rejects unrelated function-word overlap and evidence on adjacent topics", () => {
  const installation = entry("solar-fr", "need", "Installation de panneaux et batteries pour centres de santé",
    "Nous cherchons une équipe qui sait installer des systèmes solaires autonomes.", ["material"], "anywhere", {});
  const sharedWords = evidence("at://trees-fr", "Forêt", "Ce projet suit des forêts qui protègent une zone rurale.");
  const installer = evidence("at://solar-fr", "Centre solaire", "Nous installons des panneaux et des batteries dans les centres de santé ruraux.");
  const water = entry("greywater", "need", "Advice on greywater reuse in shared housing",
    "We need someone who has worked on greywater recovery for a shared residence.", ["experiential"], "anywhere", {});
  const housing = evidence("at://housing", "Shared housing", "We run shared housing and teach water conservation at our community day.");
  assert.deepEqual(rankPartners({ queries: [installation], publicEvidence: [sharedWords, installer] })
    .map(({ counterpart }) => counterpart.id), [installer.projectUri]);
  assert.deepEqual(rankPartners({ queries: [water], publicEvidence: [housing] }), []);
});

test("a food-scrap processing need finds an operating facility without matching conference or campaign copy", () => {
  const need = entry("scraps", "need", "Overflow processing for collected food scraps",
    "We need a partner that operates a community-scale composting facility.", ["material"], "anywhere", {});
  const facility = evidence("at://compost", "Community composting hub", "This project takes place weekly at the university.");
  const process = evidence("at://processing", "Scrap collection", "We collect food scraps and process them into compost at our local site.");
  const conference = evidence("at://conference", "Conference on composting", "At a composting conference, people discussed barriers to diverting food waste from landfills.");
  const seeking = evidence("at://seeking", "Compost of the future", "We plan to run a composting facility and accept food scraps.");
  const unrelated = evidence("at://unrelated", "Future composting hub", "Our yoga sessions run weekly.");
  const candidates = [conference, facility, seeking, unrelated, process];
  assert.deepEqual(new Set(rankPartners({ queries: [need], publicEvidence: candidates }).map(({ counterpart }) => counterpart.id)),
    new Set([facility.projectUri, process.projectUri]));
});

test("supported partial fits rank separately and disclose the gap without admitting adjacent projects", () => {
  const need = entry("plastic-lots", "need", "Traceability for recycled plastic lots",
    "We need software for tracing batches of recycled plastic.", ["intellectual"], "anywhere", {});
  const general = evidence("at://traceability", "Traceability platform", "It is a cloud-based Traceability Intelligence Platform for circular supply chains.");
  const exact = evidence("at://exact", "Plastic batch tracking", "We provide a traceability platform tracking recycled plastic lots in circular supply chains.");
  const theme = evidence("at://recycle", "Plastic cleanup", "We collect plastic for recycling and use a traceability app.");
  const denied = evidence("at://denied", "Other platform", "It is not a traceability platform for circular supply chains.");
  const matches = rankPartners({ queries: [need], publicEvidence: [general, theme, denied, exact], limitPerEntryAndKind: 1 });
  assert.deepEqual(matches.map(({ counterpart, partial }) => [counterpart.id, !!partial]),
    [[exact.projectUri, false], [general.projectUri, true]]);
  assert.match(matches[1]!.partial!.toCheck, /individual lots of recycled plastic/u);
});

test("partial public evidence honors place scope and proves more than a community topic", () => {
  const need = entry("peer-groups", "need", "Facilitators for displaced teenagers' peer groups",
    "We need a safe transferable model.", ["experiential"], "here", { locations: ["Nigeria"] });
  const local = evidence("at://youth", "Refugee Youth Center in Nigeria", "The garden houses youth programming each week.");
  const other = evidence("at://other", "Refugee Youth Center in Kenya", "The garden houses youth programming each week.");
  const theme = evidence("at://farm", "Refugee Youth Farm in Nigeria", "The garden grows vegetables and runs farming workshops.");
  const result = rankPartners({ queries: [need], publicEvidence: [other, theme, local] });
  assert.deepEqual(result.map(({ counterpart, partial }) => [counterpart.id, !!partial]), [[local.projectUri, true]]);
});
