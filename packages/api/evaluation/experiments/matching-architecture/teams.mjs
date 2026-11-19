// Gap-driven teams (question 4). Prototype only: nothing in the app, API or live site imports this.
//
// For an initiative and a program: list what stands between them using the funding engine's own
// eligibility and readiness output, then look for the smallest set of shared initiatives whose
// confirmed offers and shared facts close those gaps. In reverse: for two initiatives that already
// fit each other, look for programs that suit the pair better than either alone.
//
// Rules this file enforces, each with a test in prototype.test.mjs:
// - Only an entry its owner shared can close a gap. Public work is listed as a lead to check and
//   never counted. An unshared initiative never appears, not even as a count.
// - A viewer who has shared nothing gets counts, never names or reasons (D27).
// - A partner can change who applies. A partner cannot change where the funded work happens,
//   who benefits, or the answers the applicant gave about itself.
// - Nothing here says a team is eligible. Every result repeats what still has to be confirmed.
import { checkEligibility, createLexicalIndex, rankFunds } from "../../../../../dist/matching.mjs";
import { rankPartnerMatches } from "../../../src/partner-matcher.ts";

const APPLICANT_FIELDS = new Set(["applicantType", "applicantBaseCountry", "registrationCountry"]);
const NO_TEAM_CAN_HELP = new Set(["resource", "closed", "preference"]);
const MAX_PARTNERS = 3;
export const CAVEAT = "This is a research lead, not an eligibility decision. Check the funder's published requirements and ask each partner before relying on it.";

/** One fund record per program, as packages/app/src/funding/engine.ts builds them. */
export function createFundingEngine(catalog) {
  const index = createLexicalIndex(catalog.funds);
  const split = catalog.funds.flatMap(fund => fund.enrichment.programs.length
    ? fund.enrichment.programs.map(program => ({ ...fund, enrichment: { ...fund.enrichment, programs: [program] } })) : [fund]);
  const byKey = new Map(split.filter(fund => fund.enrichment.programs.length).map(fund => [`${fund.id}::${fund.enrichment.programs[0].id}`, fund]));
  const fundOf = key => { const fund = byKey.get(key); if (!fund) throw Error(`unknown_program:${key}`); return fund; };
  return {
    fund: fundOf,
    one: (project, key, now) => rankFunds([fundOf(key)], project, index, catalog.rules, null, now, catalog.conditions)[0],
    all: (project, now) => rankFunds(split, project, index, catalog.rules, null, now, catalog.conditions),
    eligibility: (project, key, now) => { const fund = fundOf(key);
      return checkEligibility(project, fund, catalog.rules, now.toISOString().slice(0, 10), fund.enrichment.programs[0].id, catalog.conditions); },
  };
}

/**
 * The funding engine's project. The work, its places and its themes always come from the subject.
 * Only the applicant's own facts can come from someone else, and the subject's answers about
 * itself do not carry over to another applicant.
 */
export function projectOf(subject, applicant = null, text = null) {
  const own = subject.facts ?? subject.sharedFacts ?? {};
  const facts = applicant ?? own;
  return { id: subject.id, name: subject.name, description: text?.description ?? subject.description, tags: text?.themes ?? subject.themes ?? [],
    workCountries: own.workCountries ?? [], benefitCountries: own.benefitCountries ?? [], usWorkStates: own.usWorkStates ?? [], usBenefitStates: own.usBenefitStates ?? [],
    applicantType: facts.applicantType ?? "unknown", applicantBaseCountry: facts.applicantBaseCountry ?? "", registrationCountry: facts.registrationCountry ?? "",
    fundingInstruments: [], goalMin: null, goalMax: null, currency: "", programAnswers: applicant ? {} : subject.programAnswers ?? {} };
}

const conflicts = eligibility => eligibility.programs.flatMap(p => p.checks).filter(check => check.field !== "condition" && check.outcome === "conflict")
  .map(check => ({ type: "fact_conflict", id: `fact:${check.field}`, field: check.field, operator: check.operator, values: check.values,
    text: check.reason, sourceUrl: check.sourceUrl, checkedOn: check.checkedOn }));

/** Everything between one initiative applying alone and this program, sorted by what could change it. */
export function enumerateGaps(evaluation, asks = [], selfAnswers = {}) {
  const checks = evaluation.eligibility.programs.flatMap(p => p.checks);
  const closable = [], blockers = [], answerFirst = [], confirm = [];
  for (const gap of conflicts(evaluation.eligibility)) (APPLICANT_FIELDS.has(gap.field) ? closable : blockers).push(gap);
  for (const check of checks) {
    if (check.field !== "condition") { if (check.missing) answerFirst.push({ field: check.field, text: check.reason }); continue; }
    const item = { text: check.requirement, category: check.category ?? null, sourceUrl: check.sourceUrl, checkedOn: check.checkedOn };
    // "No" to a sourced partner requirement is a request for partners. "No" to anything else is the applicant's own answer.
    if (check.outcome === "conflict") (check.category === "partner" ? closable : blockers).push({ type: check.category === "partner" ? "team_ask" : "condition_conflict", id: `condition:${check.id}`, count: 1, role: "co_applicant", ...item });
    else if (check.kind === "prerequisite" && check.outcome === "needs_confirmation") confirm.push(item);
  }
  for (const ask of asks) if (selfAnswers[ask.id] !== "self") closable.push({ type: "team_ask", id: `ask:${ask.id}`, text: ask.text, role: ask.role ?? "co_applicant", count: ask.count ?? 1, requires: ask.requires ?? null });
  if (NO_TEAM_CAN_HELP.has(evaluation.readiness.status)) blockers.push({ type: "access", id: `access:${evaluation.readiness.status}`, text: evaluation.readiness.label });
  return { closable, blockers, answerFirst, confirm };
}

const dated = "2026-11-01T00:00:00Z";
const sharedOffers = initiative => initiative.shared ? (initiative.offers ?? []).filter(offer => offer.shared && (offer.status ?? "open") === "open") : [];
const asSharedEntry = (initiative, entry, kind) => ({ initiativeId: initiative.id, entryId: entry.id, revision: 1, kind,
  value: { title: entry.title, description: entry.description ?? null, status: "open", placeScope: "anywhere", capitalForms: entry.capitals ?? [] },
  summary: { name: initiative.name }, confirmedAt: initiative.confirmedAt ?? dated, expiresAt: null });
const asPublicEvidence = work => { const uri = `at://did:web:fixture.example/org.hypercerts.collection/${work.id}`;
  return { id: work.id, projectUri: uri, projectName: work.name, sourceUri: uri, sourceUrl: "https://fixture.example", cid: `fixture-${work.id}`,
    contentHash: `fixture-${work.id}`, fieldPath: "$.shortDescription", passage: work.passage, kind: "work", sourceCreatedAt: dated, sourceIndexedAt: dated,
    fetchedAt: dated, extractionVersion: "matching-architecture-experiment" }; };

/** An ask may put a condition on whoever fills it. Only a fact the partner shared can meet it; an unknown fact does not. */
const meetsCondition = (gap, initiative) => !gap.requires
  || [initiative.sharedFacts?.[gap.requires.field]].flat().filter(Boolean).some(value => gap.requires.values.includes(value));

/**
 * One matcher for every ask: the production partner matcher, given the ask as a need, then the ask's
 * own condition as a deterministic gate. `textOnly` skips that gate so the experiment can show what
 * keyword matching alone would let through.
 */
function matchAsk(gap, pool, publicWork, now, textOnly) {
  const query = { initiativeId: "subject", entryId: gap.id, revision: 1, kind: "need", value: { title: gap.text, status: "open", placeScope: "anywhere" }, summary: {} };
  const results = rankPartnerMatches({ queries: [query], now, limitPerEntryAndKind: 10,
    shared: pool.flatMap(initiative => sharedOffers(initiative).map(offer => asSharedEntry(initiative, offer, "offer"))),
    publicEvidence: publicWork.map(asPublicEvidence) });
  const role = (initiativeId, entryId) => pool.find(i => i.id === initiativeId).offers.find(o => o.id === entryId).role ?? null;
  return {
    // Whoever leads must have said so in the entry they shared.
    confirmed: results.filter(r => r.evidenceKind === "confirmed_offer" && (gap.role !== "lead_applicant" || role(r.counterpart.id, r.evidence.entryId) === "lead_applicant")
      && (textOnly || meetsCondition(gap, pool.find(i => i.id === r.counterpart.id))))
      .map(r => ({ initiativeId: r.counterpart.id, name: r.counterpart.name, entryId: r.evidence.entryId, title: r.evidence.title, passage: r.evidence.passage,
        confirmedAt: r.evidence.confirmedAt, reasons: r.reasons, unknowns: r.unknowns })),
    leads: results.filter(r => r.evidence.type === "public").map(r => ({ ask: gap.id, name: r.counterpart.name, evidenceKind: r.evidenceKind, passage: r.evidence.passage, unknowns: r.unknowns })),
  };
}

function* subsets(items, max) {
  const walk = function* (start, chosen) { yield chosen; if (chosen.length === max) return; for (let i = start; i < items.length; i++) yield* walk(i + 1, [...chosen, items[i]]); };
  yield* walk(0, []);
}

/**
 * The three-way match in the forward direction. `requested` means the person opened this program
 * and asked who could join; without it a team is only suggested for a program that already fits.
 */
export function suggestTeam({ engine, subject, programKey, asks = [], initiatives, publicWork = [], now, requested = false, textOnly = false }) {
  const fund = engine.fund(programKey), program = fund.enrichment.programs[0];
  const evaluation = engine.one(projectOf(subject), programKey, now);
  const solo = enumerateGaps(evaluation, asks, subject.selfAnswers?.[programKey] ?? {});
  const base = { program: { key: programKey, name: program.name, funder: fund.name }, subject: subject.id,
    fit: { band: evaluation.thematicFit.band, label: evaluation.thematicFit.label, sharedTerms: evaluation.thematicFit.evidenceTerms },
    readiness: evaluation.readiness.label, gaps: solo, team: null, leadsToCheck: [], caveat: CAVEAT };
  const nothing = reason => ({ ...base, status: "nothing_to_suggest", reason });
  if (solo.blockers.length) return nothing(`A partner cannot change this: ${solo.blockers.map(b => b.text).join(" ")}`);
  if (!solo.closable.length) return { ...base, status: "no_team_needed", reason: "Nothing found that a partner would need to cover." };
  if (!requested && !["strong", "relevant"].includes(evaluation.thematicFit.band))
    return nothing("The program is not a clear enough fit for your work to suggest a team around it.");

  // D27 and R16: only initiatives that shared an entry are in the pool at all.
  const pool = initiatives.filter(initiative => initiative.shared && initiative.id !== subject.id && sharedOffers(initiative).length);
  const teamAsks = solo.closable.filter(gap => gap.type === "team_ask");
  const matches = new Map(teamAsks.map(gap => [gap.id, matchAsk(gap, pool, publicWork, now, textOnly)]));
  const leadsToCheck = [...matches.values()].flatMap(match => match.leads);
  const has = (initiative, role) => sharedOffers(initiative).some(offer => offer.role === role);
  const hostAccepted = program.applicants.fiscalSponsorship === "accepted";
  const slots = gaps => gaps.reduce((n, gap) => n + (gap.open ?? 1), 0);
  const soloOpen = slots(solo.closable.map(gap => ({ open: gap.count ?? 1 })));

  let best = null;
  for (const members of subsets(pool, MAX_PARTNERS)) {
    if (!members.length) continue;
    const leadAsk = teamAsks.find(gap => gap.role === "lead_applicant");
    const leads = leadAsk ? members.filter(m => matches.get(leadAsk.id).confirmed.some(c => c.initiativeId === m.id))
      : [subject, ...members.filter(m => has(m, "lead_applicant"))];
    for (const lead of leads.length ? leads : [subject]) {
      for (const host of [null, ...(hostAccepted ? members.filter(m => m !== lead && has(m, "fiscal_host")) : [])]) {
        const leadFacts = lead === subject ? (subject.facts ?? {}) : lead.sharedFacts ?? {};
        // A fiscal host lends its legal form and registration; the lead still stands where it stands.
        const applicant = host ? { ...leadFacts, applicantType: host.sharedFacts?.applicantType, registrationCountry: host.sharedFacts?.registrationCountry } : leadFacts;
        const remaining = conflicts(engine.eligibility(projectOf(subject, lead === subject && !host ? null : applicant), programKey, now)).map(gap => ({ ...gap, open: 1 }));
        const covers = new Map(members.map(m => [m.id, []]));
        for (const gap of teamAsks) {
          const able = matches.get(gap.id).confirmed.filter(c => members.some(m => m.id === c.initiativeId) && (gap.role !== "lead_applicant" || c.initiativeId === lead.id));
          const used = able.slice(0, gap.count);
          for (const c of used) covers.get(c.initiativeId).push({ gap: gap.id, ask: gap.text, entryId: c.entryId, title: c.title, passage: c.passage, confirmedAt: c.confirmedAt, reasons: c.reasons, unknowns: c.unknowns });
          if (used.length < gap.count) remaining.push({ ...gap, open: gap.count - used.length });
        }
        const soloFacts = solo.closable.filter(gap => gap.type === "fact_conflict");
        const lifted = soloFacts.filter(gap => !remaining.some(r => r.id === gap.id));
        if (lead !== subject) covers.get(lead.id).push(...lifted.map(gap => ({ gap: gap.id, ask: gap.text, sharedFact: gap.field })));
        if (host) covers.get(host.id).push({ gap: "fiscal_host", ask: "Fiscal host for an applicant without the required legal form", sharedFact: "applicantType" });
        // Smallest set: nobody is on the team without closing something.
        if (members.some(m => !covers.get(m.id).length)) continue;
        if (host && !lifted.length) continue;
        const candidate = { lead, host, members, covers, remaining, open: slots(remaining) };
        const rank = c => [c.open, c.members.length, c.lead === subject ? 0 : 1, c.host ? 1 : 0, c.members.map(m => m.id).join()];
        if (!best || JSON.stringify(rank(candidate)) < JSON.stringify(rank(best))) best = candidate;
      }
    }
  }
  if (!best || best.open >= soloOpen) return { ...nothing("No shared entry closes any of these gaps yet."), leadsToCheck };
  const facts = member => Object.fromEntries(Object.entries(member.sharedFacts ?? {}).filter(([field]) => APPLICANT_FIELDS.has(field)));
  return { ...base, status: "team_suggested", leadsToCheck,
    reason: best.lead === subject ? "You would apply; these initiatives could cover what the program asks of a team."
      : `${best.lead.name} would be the applicant and you would join as a partner. That changes who the funder assesses.`,
    team: { lead: best.lead.id, leadIsYou: best.lead === subject, host: best.host?.id ?? null, covered: soloOpen - best.open, total: soloOpen,
      members: best.members.map(member => ({ id: member.id, name: member.name, sharedFacts: facts(member), covers: best.covers.get(member.id) })),
      stillOpen: best.remaining.map(gap => ({ id: gap.id, text: gap.text, open: gap.open })),
      // A new applicant brings its own unanswered requirements; the subject's answers do not transfer.
      toConfirmWithPartners: best.lead === subject ? [] : solo.confirm.map(item => item.text) } };
}

/** What a viewer may see. Without a shared entry of their own: counts only, no names, no reasons (D27). */
export function present(result, viewer) {
  if (viewer.shared) return result;
  return { ...result, team: result.team && { namesHidden: true, partners: result.team.members.length, covered: result.team.covered, total: result.team.total,
    leadIsYou: result.team.leadIsYou }, leadsToCheck: result.leadsToCheck.length,
    reason: result.team ? "Share an entry to see who could join." : result.reason };
}

/** Whether two initiatives already fit each other through entries both sides shared. */
export function confirmedFit(a, b, now) {
  const entries = (initiative, kind, list) => (initiative.shared ? list ?? [] : []).filter(e => e.shared).map(e => asSharedEntry(initiative, e, kind));
  const all = initiative => [...entries(initiative, "need", initiative.needs), ...entries(initiative, "offer", initiative.offers)];
  return rankPartnerMatches({ queries: all(a), shared: all(b), now, limitPerEntryAndKind: 5 })
    .map(match => ({ query: `${match.query.kind}:${match.query.entryId}`, with: `${match.evidence.entryId}`, reasons: match.reasons, reciprocal: match.reciprocal }));
}

/**
 * The reverse direction. For a pair that already fits, which programs suit the two together better
 * than either alone. Two separate reasons are kept apart because only the first rests on sourced gaps:
 *   gap    the partner closes something the subject cannot, by the forward rules above
 *   theme  the program's purpose is covered by the two descriptions together and by neither alone
 * The theme reason is uncalibrated: longer text shares more words. `checkPrecondition: false` exists
 * only so the experiment can show how often it fires for a pair with no fit.
 */
export function fundsForPair({ engine, subject, partner, asksByProgram = {}, initiatives, now, checkPrecondition = true }) {
  const fit = confirmedFit(subject, partner, now);
  if (checkPrecondition && !fit.length) return { status: "nothing_to_suggest", reason: "These two initiatives have no confirmed fit with each other, so no fund is suggested for them as a pair.", pairFit: [], funds: [], counts: { gap: 0, theme: 0 } };
  const key = match => match.documentId;
  const alone = new Map(engine.all(projectOf(subject), now).map(m => [key(m), m]));
  const partnerAlone = new Map(engine.all(projectOf(partner), now).map(m => [key(m), m]));
  const together = { description: `${subject.description} ${partner.description}`, themes: [...new Set([...(subject.themes ?? []), ...(partner.themes ?? [])])] };
  const funds = [];
  for (const pair of engine.all(projectOf(subject, null, together), now)) {
    const mine = alone.get(key(pair)), theirs = partnerAlone.get(key(pair));
    if (!pair.program || NO_TEAM_CAN_HELP.has(mine.readiness.status)) continue;
    const mineTerms = new Set(mine.thematicFit.evidenceTerms), theirTerms = new Set(theirs.thematicFit.evidenceTerms);
    const pairScore = pair.thematicFit.score ?? 0;
    const theme = pair.eligibility.status !== "conflict" && pair.access !== "closed" && pairScore >= 60 && pairScore > Math.max(mine.thematicFit.score ?? 0, theirs.thematicFit.score ?? 0)
      && pair.thematicFit.evidenceTerms.some(term => !mineTerms.has(term)) && pair.thematicFit.evidenceTerms.some(term => !theirTerms.has(term));
    const hasGap = conflicts(mine.eligibility).some(gap => APPLICANT_FIELDS.has(gap.field)) || asksByProgram[key(pair)];
    const team = hasGap ? suggestTeam({ engine, subject, programKey: key(pair), asks: asksByProgram[key(pair)]?.asks ?? [], initiatives: [partner], now }) : null;
    const gap = team?.status === "team_suggested";
    if (!gap && !theme) continue;
    funds.push({ program: key(pair), name: pair.program.name, funder: pair.fund.name, reasons: [...(gap ? ["gap"] : []), ...(theme ? ["theme"] : [])],
      fitAlone: mine.thematicFit.score, fitPartnerAlone: theirs.thematicFit.score, fitTogether: pair.thematicFit.score,
      termsOnlyTogether: pair.thematicFit.evidenceTerms.filter(term => !mineTerms.has(term) || !theirTerms.has(term)),
      gapsClosed: gap ? `${team.team.covered} of ${team.team.total}` : null, readiness: mine.readiness.label });
  }
  funds.sort((a, b) => b.reasons.includes("gap") - a.reasons.includes("gap") || (b.fitTogether ?? 0) - (a.fitTogether ?? 0) || a.program.localeCompare(b.program));
  return { status: funds.length ? "funds_suggested" : "nothing_to_suggest", reason: funds.length ? null : "No program suits the pair better than either alone.",
    pairFit: fit, counts: { gap: funds.filter(f => f.reasons.includes("gap")).length, theme: funds.filter(f => f.reasons.includes("theme")).length },
    funds: funds.slice(0, 8), caveat: CAVEAT };
}

/** Question 5: the financial need as the funding query. Amount and purpose come from the need, not a separate form. */
export function projectFromNeed(subject, need) {
  const project = projectOf(subject);
  return { ...project, description: `${subject.description} ${need.title}. ${need.description ?? ""}`.trim(),
    goalMin: need.amount?.min ?? null, goalMax: need.amount?.max ?? null, currency: need.amount?.currency ?? "" };
}
