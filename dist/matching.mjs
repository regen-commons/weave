import { fold, effectiveAccess } from "./domain.mjs";

// Eligibility text is deliberately excluded: a prohibition is not a thematic signal.
export function fundText(fund) {
  const programs = fund.enrichment?.programs || [];
  const officialFocus = [
    ...(fund.enrichment?.focus || []),
    ...programs.flatMap((p) => [...p.focus, ...p.beneficiaries]),
  ];
  return (
    [
      ...(officialFocus.length
        ? [...programs.map((p) => p.name), ...officialFocus]
        : [...fund.sectors, ...fund.approaches]),
    ]
      .filter(Boolean)
      .join(". ")
      .slice(0, 5000) || "Funding focus not specified"
  );
}
export function projectText(project) {
  // Names, finances and eligibility identifiers don't define a project's subject.
  return [project.description, ...project.tags]
    .filter(Boolean)
    .join(". ")
    .slice(0, 6000);
}
const STOP = new Set(
  "a an and are as at be by for from has in is it of on or our that the their this to we with work project funding fund support people community communities organization organisations organizations nonprofit grants grant programmes programs programme program global led".split(
    " ",
  ),
);
export const terms = (value) => [
  ...new Set(
    (fold(value).match(/[a-z0-9]{3,}/g) || []).filter((t) => !STOP.has(t)),
  ),
];
// One document per named program; overview-only records retain a fallback document.
export const documentId = (fund, program) => program ? `${fund.id}::${program.id}` : fund.id;
function programFocus(fund, program) {
  const topics = [...(program?.focus || []), ...(program?.beneficiaries || [])];
  if (topics.length) return topics;
  return fund.enrichment?.focus?.length ? fund.enrichment.focus : [...(fund.sectors || []), ...(fund.approaches || [])];
}
const BROAD_PURPOSE_WORDS = new Set("community communities rooted led development stewardship partnership partnerships collaboration collaborations relationship relationships listening local locally social impact change systems systemic support supporting initiatives projects organizations organisations networks leadership capacity building action".split(" "));
function specificPurposeAvailable(fund, program) {
  return terms(programFocus(fund, program).join(" ")).some((word) => !BROAD_PURPOSE_WORDS.has(word));
}
export function programText(fund, program) {
  if (!program) return fundText(fund);
  return [program.name, ...programFocus(fund, program)]
    .filter(Boolean).join(". ").slice(0, 5000) || "Funding focus not specified";
}
export function corpusDocuments(funds) {
  return funds.flatMap((fund) => {
    const programs = fund.enrichment?.programs || [];
    return (programs.length ? programs : [null]).map((program) => ({
      id: documentId(fund, program), text: programText(fund, program),
    }));
  });
}
export function createLexicalIndex(funds) {
  const documents = corpusDocuments(funds);
  const words = documents.map((d) => terms(d.text));
  const counts = new Map();
  for (const doc of words)
    for (const term of doc) counts.set(term, (counts.get(term) || 0) + 1);
  const idf = (term) => Math.log(1 + documents.length / (1 + (counts.get(term) || 0)));
  return new Map(documents.map((d, i) => [d.id, { terms: words[i], idf }]));
}
export function lexicalMatch(project, entry) {
  const query = terms(projectText(project));
  const shared = entry.terms.filter((t) => query.includes(t));
  const tags = new Set(terms(project.tags.join(". ")));
  const queryWeight = (t) => entry.idf(t) * (tags.has(t) ? 3 : 1);
  const total = query.reduce((n, t) => n + queryWeight(t), 0);
  const documentTotal = entry.terms.reduce((n, t) => n + entry.idf(t), 0);
  const overlap = shared.reduce((n, t) => n + entry.idf(t), 0);
  return {
    score: total && documentTotal ? Math.sqrt((shared.reduce((n, t) => n + queryWeight(t), 0) / total) * (overlap / documentTotal)) : 0,
    shared: shared.sort((a, b) => entry.idf(b) - entry.idf(a)).slice(0, 5),
    allShared: shared,
  };
}

// Theme alignment and shortlist priority answer different questions. This rubric
// grades supported topical evidence; it is not a percentage chance of funding.
export const THEMATIC_SCORE_VERSION = "thematic-readiness-v1";
const SEMANTIC_FIT_ANCHORS = [[0.25, 0], [0.35, 40], [0.45, 60], [0.55, 80], [0.7, 95], [1, 100]];
const TERM_FIT_ANCHORS = [0, 30, 50, 65, 75, 80, 85];
export const THEMATIC_FIT_RUBRIC = {
  version: THEMATIC_SCORE_VERSION, semanticAnchors: SEMANTIC_FIT_ANCHORS, sharedTermGrades: TERM_FIT_ANCHORS,
};
const TERM_FAMILIES = {
  art: "arts", artistic: "arts", cultural: "culture", cultures: "culture",
  ecosystems: "ecosystem", restoring: "restoration", restore: "restoration",
  educational: "education", forests: "forest", farmers: "farmer",
};
function semanticGrade(cosine) {
  if (cosine == null) return null;
  if (cosine <= SEMANTIC_FIT_ANCHORS[0][0]) return 0;
  for (let i = 1; i < SEMANTIC_FIT_ANCHORS.length; i++) {
    const [x, y] = SEMANTIC_FIT_ANCHORS[i], [previousX, previousY] = SEMANTIC_FIT_ANCHORS[i - 1];
    if (cosine <= x) return previousY + (cosine - previousX) / (x - previousX) * (y - previousY);
  }
  return 100;
}
export function thematicFit(match, lexical) {
  const evidenceTerms = [...new Set((lexical.allShared || lexical.shared).filter((word) =>
    /^[a-z]/.test(word) && !BROAD_PURPOSE_WORDS.has(word) && !["public", "general", "challenge", "challenges", "round", "cycle", "annual", "initiative"].includes(word)
  ).map((word) => TERM_FAMILIES[word] || word))];
  const semantic = semanticGrade(match.cosine);
  const keywords = TERM_FIT_ANCHORS[Math.min(evidenceTerms.length, TERM_FIT_ANCHORS.length - 1)];
  const assessed = match.focusAvailable && match.specificPurposeAvailable && !match.resourceOnly;
  const uncapped = Math.round(Math.max(keywords, semantic ?? 0));
  const score = assessed ? Math.min(uncapped, match.specificPurposeEvidence ? 100 : 59) : null;
  const band = score == null ? "unknown" : score >= 80 ? "strong" : score >= 60 ? "relevant" : score >= 40 ? "partial" : "limited";
  const label = { unknown: "Fit not assessed", strong: "Strong thematic fit", relevant: "Relevant themes", partial: "Partial thematic overlap", limited: "Limited thematic overlap" }[band];
  return { version: THEMATIC_SCORE_VERSION, score, band, label, semanticGrade: semantic == null ? null : Math.round(semantic), keywordGrade: keywords, evidenceTerms,
    basis: "The stronger supported signal from distinct specific shared terms and local semantic similarity sets the fit grade. Eligibility, access, award size and missing applicant details do not change thematic fit." };
}
export function readiness(match) {
  const checks = match.eligibility.programs.flatMap((p) => p.checks);
  const missing = checks.filter((c) => c.field === "condition" && c.kind === "prerequisite" && c.outcome === "needs_confirmation");
  if (match.resourceOnly) return { status: "resource", label: "Funding resource, not an application route" };
  if (match.eligibility.status === "conflict") return { status: "conflict", label: "Known eligibility conflict" };
  if (!match.program) return { status: "unverified", label: "Funding offer unverified" };
  if (match.instrument.status === "mismatch") return { status: "preference", label: "Outside funding preferences" };
  if (match.access === "closed") return { status: "closed", label: "Application cycle closed" };
  if (match.access === "future") return { status: "future", label: "Applications not open yet" };
  if (!match.conditionsLoaded) return { status: "screening", label: "Eligibility screening unavailable" };
  if (checks.some((c) => c.stale) || (match.program && match.evidenceStale)) return { status: "stale", label: "Recheck the published requirements" };
  if (match.geographic.needsConfirmation || match.geographic.countryMismatch) return { status: "geography", label: "Check geographic scope" };
  const applicant = missing.some((c) => c.category === "applicant_model");
  const beneficiary = missing.some((c) => c.category === "beneficiary");
  if (applicant || beneficiary) return { status: "requirements", label: `Confirm ${applicant && beneficiary ? "applicant and beneficiary" : applicant ? "applicant" : "beneficiary"} requirements` };
  if (checks.some((c) => c.field !== "condition" && c.missing)) return { status: "profile", label: "Add missing applicant details" };
  if (match.instrument.status === "unconfirmed") return { status: "instrument", label: "Confirm funding type" };
  if (match.program?.application.capacity === "limited") return { status: "capacity", label: "Limited funder capacity" };
  if (missing.length) return { status: "requirements", label: `Confirm ${missing.length} requirement${missing.length === 1 ? "" : "s"}` };
  if (["relationship", "restricted"].includes(match.access)) return { status: "relationship", label: "Invitation or partner route" };
  if (!match.program || ["unverified", "unconfirmed", "conflicting", "directory", "mismatch"].includes(match.access)) return { status: "unverified", label: "Application route needs checking" };
  return { status: match.access === "inquiry" ? "inquiry" : "open", label: match.access === "inquiry" ? "Inquiry first; proposal may need an invitation" : "Open route; verify eligibility" };
}

// Screens apply to one researched program, not the whole institution.
export function checkEligibility(
  project,
  fund,
  rules,
  today = new Date().toISOString().slice(0, 10),
  selectedProgramId = null,
  conditions = [],
) {
  const relevant = rules.filter((r) => r.fundId === fund.id);
  const programIds = [
    ...new Set([
      ...(fund.enrichment?.programs || []).map((p) => p.id),
      ...relevant.map((r) => r.programId),
    ]),
  ];
  const programs = programIds.filter((id) => !selectedProgramId || id === selectedProgramId).map((programId) => {
    const checks = relevant
      .filter((r) => r.programId === programId)
      .map((r) => {
        const fields = [r.field, ...(r.alternativeField ? [r.alternativeField] : [])];
        const supplied = fields.map((field) => {
          const value = project[field];
          const values = Array.isArray(value) ? value : value && value !== "unknown" ? [value] : [];
          return { values, present: values.length > 0 };
        });
        // Alternative fields mean OR, never independent mandatory gates.
        const satisfies = ({ values }) => values.some((v) => r.values.includes(v));
        const overlap = supplied.some(satisfies);
        const complete = supplied.every((s) => s.present);
        const missing = !complete && !(r.operator === "only" && overlap);
        const stale = !r.checkedOn || !Number.isFinite(Date.parse(r.checkedOn)) || Date.parse(today) - Date.parse(r.checkedOn) > 180 * 86400000;
        const mismatch = !stale && complete && (r.operator === "only"
          ? !overlap : supplied.every(({ values }) => values.every((v) => r.values.includes(v))));
        const conflict = mismatch && r.kind !== "priority";
        return {
          ...r,
          outsidePriority: mismatch && r.kind === "priority",
          partial: Boolean(!conflict && overlap && supplied.some(({ values }) => values.some((v) => !r.values.includes(v)))),
          outcome: conflict ? "conflict" : "needs_confirmation",
          missing,
          stale,
        };
      });
    checks.push(...checkConditions(project, fund.id, programId, conditions, today));
    return {
      programId,
      checks,
      status: checks.some((c) => c.outcome === "conflict")
        ? "conflict"
        : "needs_confirmation",
    };
  });
  return {
    status:
      programs.length && programs.every((p) => p.status === "conflict")
        ? "conflict"
        : "needs_confirmation",
    programs,
  };
}
function programAwardContext(project, award) {
  if (
    !award ||
    award.basis === "historical" ||
    (award.min == null && award.max == null)
  )
    return "Current award range is not verified; no budget fit assumed.";
  if (award.currency !== project.currency)
    return `Award is in ${award.currency}; your goal is in ${project.currency}. No currency conversion applied.`;
  if (project.goalMin == null && project.goalMax == null)
    return "Add a fundraising range to compare published award terms.";
  if (
    award.max != null &&
    project.goalMin != null &&
    award.max < project.goalMin
  )
    return "Published award may fund part of your total goal; a smaller grant is not an eligibility conflict.";
  if (
    award.min != null &&
    project.goalMax != null &&
    award.min > project.goalMax
  )
    return "Published minimum exceeds your total goal; confirm whether a smaller request is allowed.";
  return "Published award and total fundraising ranges overlap; request rules still need checking.";
}
export function awardContext(project, fund) {
  const programs = fund.enrichment?.programs || [];
  if (!programs.length)
    return "Current award range is not verified; no budget fit assumed.";
  return programs
    .map(
      (p) =>
        `${p.name ? p.name + ": " : ""}${programAwardContext(project, p.award)}`,
    )
    .join(" ");
}
export function programFund(fund, program) {
  if (!program) return fund;
  const award = program.award;
  const number = (n) => `${award.currency} ${new Intl.NumberFormat("en-US").format(n)}`;
  const awardText = award.note || (award.min != null && award.max != null
    ? `${number(award.min)}–${number(award.max)}`
    : award.max != null ? `Up to ${number(award.max)}`
    : award.min != null ? `From ${number(award.min)}` : "Current award range not verified");
  return {
    ...fund, displayProgramId: program.id, program: program.name,
    access: program.application.route, accessDetail: program.application.note,
    amount: `${award.basis === "historical" ? "Historical terms: " : ""}${awardText}`, timing: program.application.note, openingDate: program.application.opensOn,
    deadlineDate: program.application.closesOn,
    deadlineInstant: program.application.deadlineInstant,
    evidenceUrl: program.application.url || program.evidence?.[0]?.url || fund.evidenceUrl,
  };
}
export function validConditions(data, funds) {
  if (data?.version !== 1 || !Array.isArray(data.conditions)) return false;
  const keys = new Set();
  return data.conditions.every((c) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    const fund = funds.find((f) => f.id === c.fundId);
    const key = conditionKey(c);
    if (keys.has(key)) return false;
    keys.add(key);
    return /^[a-zA-Z0-9_-]+$/.test(c.id) && ["prerequisite", "priority"].includes(c.kind) &&
      typeof c.requirement === "string" && c.requirement.trim().length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.checkedOn) && Number.isFinite(Date.parse(c.checkedOn)) && new Date(c.checkedOn).toISOString().slice(0, 10) === c.checkedOn &&
      typeof c.sourceUrl === "string" && c.sourceUrl.startsWith("https://") &&
      fund?.enrichment?.programs.some((p) => p.id === c.programId) &&
      fund.enrichment.sources.some((s) => s.url === c.sourceUrl) &&
      fund.enrichment.programs.find((p) => p.id === c.programId).evidence.some((e) => e.url === c.sourceUrl && e.checkedOn >= c.checkedOn);
  });
}
export const conditionKey = (condition) => `${condition.fundId}::${condition.programId}::${condition.id}`;
export function checkConditions(project, fundId, programId, conditions, today) {
  return conditions.filter((c) => c.fundId === fundId && c.programId === programId).map((c) => {
    const stale = !c.checkedOn || !Number.isFinite(Date.parse(c.checkedOn)) || Date.parse(today) - Date.parse(c.checkedOn) > 180 * 86400000;
    const saved = project.programAnswers?.[conditionKey(c)];
    const answer = !stale && saved?.sourceCheckedOn === c.checkedOn ? saved.answer : null;
    return { ...c, key: conditionKey(c), field: "condition", reason: c.requirement,
      stale, missing: !answer, answer,
      outcome: c.kind === "prerequisite" && answer === "no" ? "conflict" : answer === "yes" ? "self_reported" : "needs_confirmation" };
  });
}
const compareMatches = (a, b) =>
  Number(a.resourceOnly) - Number(b.resourceOnly) ||
  Number(a.eligibility.status === "conflict") - Number(b.eligibility.status === "conflict") ||
  b.score - a.score || b.fitScore - a.fitScore || b.breakdown.access - a.breakdown.access ||
  a.fund.name.localeCompare(b.fund.name) || a.documentId.localeCompare(b.documentId);
function mentionedCountryMismatch(project, program) {
  const mentioned = program?.geography?.workCountries || [];
  return Boolean(mentioned.length && project.workCountries?.length && !project.workCountries.some((c) => mentioned.includes(c)));
}
export function geographicContext(project, program, eligibility) {
  const checks = eligibility.programs.flatMap((p) => p.checks).filter((c) =>
    ["workCountries", "benefitCountries", "applicantBaseCountry", "registrationCountry", "usWorkStates", "usBenefitStates"].includes(c.field));
  const manual = eligibility.programs.flatMap((p) => p.checks).filter((c) => c.field === "condition");
  const confirmedLocal = (c) => c.localRequirement && manual.some((m) =>
    m.requirement === c.localRequirement && m.sourceUrl === c.sourceUrl && m.outcome === "self_reported");
  const pendingLocal = checks.filter((c) => c.localRequirement && !confirmedLocal(c));
  const pendingChecks = checks.filter((c) => c.stale || (!confirmedLocal(c) && (c.outsidePriority || c.missing || c.partial)));
  const pendingConditions = manual.filter((c) => c.category === "geography" && c.kind === "prerequisite" && c.outcome !== "self_reported");
  const countryMismatch = mentionedCountryMismatch(project, program);
  const missingMentionedCountries = Boolean(program?.geography?.workCountries?.length && !project.workCountries?.length);
  const reasons = [];
  if (missingMentionedCountries) reasons.push("The program names specific work countries, but this project has no funded-work countries to compare. Country mentions may be priorities rather than exclusions.");
  if (pendingChecks.length)
    reasons.push("A sourced geographic condition needs missing details, a local funded component or a fresh check.");
  for (const c of checks.filter((c) => c.outsidePriority)) reasons.push(`Outside the published geographic priority: ${c.reason} Exceptions may be possible; this is not an eligibility exclusion.`);
  for (const c of pendingConditions) reasons.push(`Confirm geographic scope: ${c.requirement}`);
  for (const c of pendingLocal)
    reasons.push(`Local eligibility is not established by country overlap: ${c.localRequirement}`);
  if (countryMismatch)
    reasons.push("Your work countries do not overlap countries mentioned in this program’s research. Those mentions may be priorities or examples, so this is a ranking caution, not an exclusion.");
  const evidenced = checks.length && !pendingChecks.length && !pendingLocal.length && !pendingConditions.length && checks.every((c) => c.outcome !== "conflict");
  if (!checks.length) reasons.push("No executable geographic rule for this program; country mentions alone do not confirm eligibility.");
  return { pendingLocal: pendingLocal.length > 0, needsConfirmation: Boolean(missingMentionedCountries || pendingChecks.length || pendingLocal.length || pendingConditions.length), countryMismatch, points: evidenced ? 10 : reasons.length && checks.length ? 3 : 2, reasons: [...new Set(reasons)] };
}
export function instrumentContext(project, program) {
  const preferred = project.fundingInstruments || [];
  const instrument = program?.instrument;
  if (!preferred.length) return { status: "any", reason: "All funding types are being considered." };
  if (!instrument || ["mixed", "unknown"].includes(instrument))
    return { status: "unconfirmed", reason: "This program's funding type is mixed or unverified; confirm that it offers your selected type." };
  if (preferred.includes(instrument)) return { status: "match", reason: "Matches a funding type selected for this project." };
  return { status: "mismatch", reason: `This program offers ${instrument} funding, outside your selected funding types. This is a preference mismatch, not an eligibility decision.` };
}
const ACCESS_POINTS = { open: 15, rolling: 14, inquiry: 8, restricted: 4, relationship: 3, unconfirmed: 2, unverified: 1, conflicting: 0, future: 1, directory: 0, closed: 0, mismatch: 0 };
function awardPoints(project, award) {
  if (!award || award.basis !== "current_offer" || award.currency !== project.currency ||
      (award.min == null && award.max == null) || (project.goalMin == null && project.goalMax == null)) return 1;
  if (award.min != null && project.goalMax != null && award.min > project.goalMax) return 0;
  if (award.max != null && project.goalMin != null && award.max < project.goalMin) return 3;
  return 5;
}
function scoreMatch(match, project, today) {
  const { fitScore, program, access, eligibility, geographic, focusAvailable, resourceOnly } = match;
  const checks = eligibility.programs.flatMap((p) => p.checks);
  const unknown = checks.filter((c) => c.field === "condition" && c.kind === "prerequisite" && c.outcome === "needs_confirmation");
  const breakdown = {
    topics: Math.round(fitScore * 70), geography: geographic.points,
    access: ACCESS_POINTS[access] ?? 1, award: awardPoints(project, program?.award),
  };
  const rawScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const limits = [];
  const limit = (maximum, reason) => limits.push({ maximum, reason });
  if (!match.conditionsLoaded) limit(29, "Eligibility screening data could not load; score is provisional and all requirements need manual review.");
  if (!focusAvailable) limit(0, "No documented focus to match.");
  if (!match.specificPurposeAvailable) limit(24, "The documented purpose is too broad to establish a specific project match. Shared organizational language alone is not a research lead.");
  if (resourceOnly) limit(0, "Funding resource, not a verified grantmaking opportunity.");
  if (eligibility.status === "conflict") limit(0, "A sourced requirement conflicts with supplied project facts.");
  if (match.instrument.status === "mismatch") limit(0, match.instrument.reason);
  if (match.instrument.status === "unconfirmed") limit(29, match.instrument.reason);
  if (fitScore < 0.25) limit(24, "Limited evidence of shared program purpose; access cannot compensate for weak topics.");
  if (!match.specificPurposeEvidence) limit(29, "Only broad or sparse shared topics support this match. More specific purpose evidence is needed before shortlisting.");
  if (unknown.length) limit(39, `${unknown.length} mandatory prerequisite${unknown.length === 1 ? " is" : "s are"} unconfirmed; review the official conditions.`);
  if (unknown.some((c) => ["applicant_model", "beneficiary", "leadership", "history", "partner"].includes(c.category)))
    limit(29, "A required applicant model, beneficiary scope, leadership, funding history or partner arrangement is unconfirmed; thematic similarity cannot establish it.");
  if (geographic.needsConfirmation)
    limit(24, "Geographic scope or an eligible local component needs confirmation before shortlisting.");
  if (geographic.countryMismatch)
    limit(24, "Documented country mentions do not overlap your work. This lowers priority without asserting ineligibility.");
  if (!program) limit(9, "No verified funding offer or researched program terms. Keep this overview for further research, below documented program candidates.");
  if (["unverified", "unconfirmed", "conflicting", "directory", "mismatch"].includes(access)) limit(29, "Current application access is not verified.");
  if (access === "closed") limit(19, "This application cycle is closed; retain it for a future-cycle watchlist.");
  if (access === "future") limit(29, "The application period has not opened.");
  if (program?.application.capacity === "limited") limit(29, "The official source reports limited capacity for new partnerships; keep this as a lower-priority inquiry.");
  if (["restricted", "relationship"].includes(access)) limit(29, "An invitation, nomination or existing relationship may be required.");
  const sourceDates = program?.evidence?.map((e) => e.checkedOn).filter(Boolean) || [];
  const evidenceStale = !sourceDates.length || sourceDates.every((d) => !Number.isFinite(Date.parse(d)) || Date.parse(today) - Date.parse(d) > 180 * 86400000);
  if (evidenceStale)
    limit(39, "Program evidence is missing or more than 180 days old; recheck current terms.");
  const score = Math.max(0, Math.min(100, rawScore, ...limits.map((l) => l.maximum)));
  const activeLimits = limits.filter((l) => l.maximum < rawScore);
  return { score, rawScore, breakdown, limits, activeLimits, evidenceStale,
    scoreLabel: !focusAvailable ? "Focus not specified" : resourceOnly ? "Other funding resource" : eligibility.status === "conflict" ? "Known conflict" : match.instrument.status === "mismatch" ? "Outside funding preferences" : geographic.needsConfirmation || geographic.countryMismatch ? "Check geographic scope" : match.instrument.status === "unconfirmed" ? "Check funding type" : access === "closed" ? "Closed cycle" : program?.application.capacity === "limited" ? "Limited funder capacity" : unknown.length ? "Prerequisites unconfirmed" : score >= 70 ? "Strong research lead" : score >= 50 ? "Promising research lead" : score >= 30 ? "Explore the fit" : "Limited match evidence" };
}
export const MATCH_GROUPS = {
  lead: "Research leads", check: "Check scope, funding type or access",
  unverified: "Unverified funding offers",
  limited: "Limited relevance", outside: "Conflicts or funding preferences",
};
// A ranked project lists every record until someone picks a group to narrow it.
export const matchViewFromUrl = (params) =>
  Object.hasOwn(MATCH_GROUPS, params.get("matches")) ? params.get("matches") : "all";
// The thematic-fit order: highest grade first and unassessed fit last. Equal grades
// keep next-step priority order. Readiness and eligibility checks are unchanged.
export const compareThematicFit = (a, b) =>
  (b.thematicFit.score ?? -1) - (a.thematicFit.score ?? -1) || compareMatches(a, b);
function matchGroup(match) {
  if (match.eligibility.status === "conflict" || match.instrument.status === "mismatch") return "outside";
  if (!match.program && !match.resourceOnly) return "unverified";
  if (match.fitScore < 0.25 || !match.specificPurposeAvailable || match.resourceOnly || match.thematicFit.score == null || match.thematicFit.score < 40) return "limited";
  return match.score >= 30 && match.thematicFit.score >= 60 ? "lead" : "check";
}
export function rankFunds(funds, project, index, rules = [], semantic = null, now = new Date(), conditions = []) {
  // Partial or old fund-level results must fall back for the complete directory.
  const documents = corpusDocuments(funds);
  const useSemantic = semantic && documents.every(({ id }) =>
    Number.isFinite(semantic[id]) && semantic[id] >= -1.001 && semantic[id] <= 1.001);
  const today = now.toISOString().slice(0, 10);
  const conditionsLoaded = Array.isArray(conditions);
  const screeningConditions = conditionsLoaded ? conditions : [];
  return funds.map((fund) => {
    const programs = fund.enrichment?.programs || [];
    const candidates = (programs.length ? programs : [null]).map((program) => {
      const id = documentId(fund, program);
      const lexical = lexicalMatch(project, index.get(id));
      const cosine = useSemantic ? semantic[id] : null;
      const focusAvailable = programFocus(fund, program).length > 0;
      // Cosine has a broad positive background. A fixed transparent scale removes that
      // background; it is a heuristic relevance scale, never a calibrated probability.
      const semanticFit = useSemantic ? Math.max(0, Math.min(1, (cosine - 0.2) / 0.65)) : null;
      const fitScore = !focusAvailable ? 0 : useSemantic
        ? 0.5 * semanticFit + 0.5 * lexical.score : lexical.score;
      const specificShared = lexical.shared.filter((word) => !BROAD_PURPOSE_WORDS.has(word));
      const view = programFund(fund, program);
      const access = effectiveAccess(view, now);
      const eligibility = checkEligibility(project, fund, rules, today, program?.id, screeningConditions);
      const geographic = geographicContext(project, program, eligibility);
      const match = {
        fund: view, program, documentId: id, fitScore, conditionsLoaded,
        cosine, focusAvailable, geographic, lexicalScore: lexical.score,
        specificPurposeAvailable: specificPurposeAvailable(fund, program),
        specificPurposeEvidence: specificShared.length >= 2 || lexical.score >= 0.5 || (semanticFit != null && semanticFit >= 0.6),
        instrument: instrumentContext(project, program),
        resourceOnly: fund.enrichment?.reviewStatus === "not_a_funder",
        shared: focusAvailable ? lexical.shared : [],
        method: useSemantic ? "semantic" : "baseline",
        label: !focusAvailable ? "Focus not specified" : useSemantic ? "Program purpose + evidence" : lexical.shared.length ? "Shared topics + evidence" : "Little keyword evidence",
        eligibility,
        award: program ? programAwardContext(project, program.award) : awardContext(project, fund),
        geography: program?.geography?.scope || "Geographic scope is not verified. Check the official requirements.",
        access,
      };
      const scored = { ...match, ...scoreMatch(match, project, today) };
      const assessed = { ...scored, thematicFit: thematicFit(scored, lexical), readiness: readiness(scored) };
      return { ...assessed, group: matchGroup(assessed) };
    }).sort(compareMatches);
    return { ...candidates[0], alternatives: candidates.slice(1).map((m) => ({
      programId: m.program.id, name: m.program.name, access: m.access,
      score: m.score, fitScore: m.fitScore, eligibility: m.eligibility.status,
      thematicFit: m.thematicFit, readiness: m.readiness,
    })) };
  }).sort(compareMatches);
}
