// One shape for an initiative and a funding program (question 1). Prototype only.
//
// A party has entries. An entry is an offer or an ask, carries forms of capital, and may carry
// conditions on whoever takes it up. A condition is checked against the other party's facts.
// Every entry and condition says where it comes from:
//   confirmed   an owner reviewed and shared it in Weave
//   researched  a steward read it in an official funder source on a dated check
//   published   a source says it; nobody confirmed it to Weave
//   inferred    read out of described work; never a statement of availability
// Only `confirmed` can close a requirement. A researched program is an opportunity, never an
// eligibility decision.

/** Grant-like money is given; investment comes back to the funder. Anything else stays unknown. */
const TERMS = { grant: "gift", prize: "gift", fellowship: "gift", scholarship: "gift", investment: "paid" };
const STATUS = { open: "open", rolling: "open", inquiry: "ask_first", future: "not_open_yet", closed: "closed",
  relationship: "by_invitation", restricted: "by_invitation" };
const FACT_FIELDS = ["applicantType", "applicantBaseCountry", "registrationCountry", "workCountries", "benefitCountries", "usWorkStates", "usBenefitStates"];

export const programKey = (fund, program) => `${fund.id}::${program.id}`;

/** A catalog program as a party: one offer of money, the conditions on it, and what it asks for. */
export function programToParty(fund, program, rules, conditions, teamLabels = {}) {
  const key = programKey(fund, program);
  const mine = row => row.fundId === fund.id && row.programId === program.id;
  const evidence = { kind: "researched", sources: (program.evidence ?? []).map(e => ({ url: e.url, checkedOn: e.checkedOn })) };
  const structured = [
    ...rules.filter(mine).map(rule => ({ on: "fact", field: rule.field, operator: rule.operator, values: rule.values,
      strength: rule.kind ?? "prerequisite", text: rule.reason, sourceUrl: rule.sourceUrl, checkedOn: rule.checkedOn })),
    ...conditions.filter(mine).map(condition => ({ on: "statement", id: condition.id, category: condition.category ?? "uncategorised",
      strength: condition.kind, text: condition.requirement, sourceUrl: condition.sourceUrl, checkedOn: condition.checkedOn })),
  ];
  // Prose the catalog holds but nothing can check yet. It stays text; it is not turned into a gate.
  const prose = [
    ...program.applicants.types.map(text => ({ on: "prose", field: "applicants.types", text })),
    ...program.applicants.requirements.map(text => ({ on: "prose", field: "applicants.requirements", text })),
    ...program.applicants.exclusions.map(text => ({ on: "prose", field: "applicants.exclusions", text })),
    ...program.geography.exclusions.map(text => ({ on: "prose", field: "geography.exclusions", text })),
  ];
  const award = program.award;
  const offer = {
    id: `${key}#money`, side: "offer", capitals: ["financial"],
    text: [program.name, ...program.focus, ...program.beneficiaries].join(". "),
    amount: award.min == null && award.max == null ? null : { currency: award.currency, min: award.min, max: award.max, basis: award.basis },
    window: { opensOn: program.application.opensOn, closesOn: program.application.closesOn },
    terms: TERMS[program.instrument] ?? "unknown",
    status: STATUS[program.application.route] ?? "unverified",
    usableFor: program.costs?.supported ?? [],
    notUsableFor: program.costs?.excluded ?? [],
    conditions: [...structured, ...prose],
    evidence,
  };
  const asks = [
    // What the funder wants to see happen. Described work answers it; this is thematic fit.
    ...(program.focus.length ? [{ id: `${key}#work`, side: "ask", capitals: [], kind: "work", text: program.focus.join(". "), evidence }] : []),
    // What the funder requires of a team. Only sourced partner conditions count as structured.
    ...conditions.filter(c => mine(c) && c.category === "partner").map(c => ({ id: `${key}#team:${c.id}`, side: "ask", capitals: ["social"],
      kind: "team", text: c.requirement, evidence: { kind: "researched", sources: [{ url: c.sourceUrl, checkedOn: c.checkedOn }] } })),
  ];
  return { id: key, type: "program", name: program.name, steward: fund.name, offers: [offer], asks,
    teamRequirementInProse: teamLabels[key] ?? null,
    // Catalog content with no home in the shared shape.
    unmapped: { geographyScope: Boolean(program.geography.scope), awardNote: Boolean(award.note), applicationNote: Boolean(program.application.note),
      unknowns: program.unknowns?.length ?? 0, awardDurationMonths: award.durationMonths != null } };
}

/** A fixture initiative as a party. Only shared entries and shared facts are visible to matching. */
export function initiativeToParty(initiative) {
  const evidence = { kind: "confirmed", confirmedAt: initiative.confirmedAt ?? null };
  const entry = side => item => ({ id: `${initiative.id}#${item.id}`, side, capitals: item.capitals ?? [], text: [item.title, item.description].filter(Boolean).join(". "),
    amount: item.amount ?? null, window: item.timeframe ? { text: item.timeframe } : null, terms: item.terms ?? "unknown",
    status: item.status ?? "open", role: item.role ?? null, shared: Boolean(item.shared), conditions: [], evidence });
  return { id: initiative.id, type: "initiative", name: initiative.name, shared: Boolean(initiative.shared),
    facts: Object.fromEntries(FACT_FIELDS.filter(f => initiative.sharedFacts?.[f] !== undefined).map(f => [f, initiative.sharedFacts[f]])),
    offers: (initiative.offers ?? []).map(entry("offer")), asks: (initiative.needs ?? []).map(entry("ask")) };
}

/** How much of each part of the shape the catalog can fill today. */
export function catalogCoverage(parties) {
  const count = test => parties.filter(test).length;
  const offer = party => party.offers[0];
  const conditionsOf = (party, on) => offer(party).conditions.filter(c => c.on === on);
  const tally = values => Object.fromEntries([...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
  return {
    programs: parties.length,
    offer: {
      termsKnown: count(p => offer(p).terms !== "unknown"),
      amountStated: count(p => offer(p).amount),
      amountCurrentOffer: count(p => offer(p).amount?.basis === "current_offer"),
      closingDate: count(p => offer(p).window.closesOn),
      usableForStated: count(p => offer(p).usableFor.length),
      status: tally(parties.map(p => offer(p).status)),
    },
    conditions: {
      programsWithFactRules: count(p => conditionsOf(p, "fact").length),
      programsWithSourcedStatements: count(p => conditionsOf(p, "statement").length),
      programsWithEither: count(p => conditionsOf(p, "fact").length + conditionsOf(p, "statement").length),
      programsWithProseOnly: count(p => !conditionsOf(p, "fact").length && !conditionsOf(p, "statement").length && conditionsOf(p, "prose").length),
      programsWithNone: count(p => !offer(p).conditions.length),
      factRulesByField: tally(parties.flatMap(p => conditionsOf(p, "fact").map(c => c.field))),
      statementsByCategory: tally(parties.flatMap(p => conditionsOf(p, "statement").map(c => c.category))),
      proseStrings: parties.reduce((n, p) => n + conditionsOf(p, "prose").length, 0),
    },
    asks: {
      programsWithWorkAsk: count(p => p.asks.some(a => a.kind === "work")),
      programsWithStructuredTeamAsk: count(p => p.asks.some(a => a.kind === "team")),
      structuredTeamAsks: parties.reduce((n, p) => n + p.asks.filter(a => a.kind === "team").length, 0),
      teamWordingInProse: tally(parties.map(p => p.teamRequirementInProse).filter(Boolean)),
    },
    unmapped: {
      geographyScopeProse: count(p => p.unmapped.geographyScope), awardNote: count(p => p.unmapped.awardNote),
      programsListingUnknowns: count(p => p.unmapped.unknowns), awardDuration: count(p => p.unmapped.awardDurationMonths),
    },
  };
}
