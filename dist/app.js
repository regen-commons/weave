import {
  listOptions,
  normalizeProject,
  upsertProject,
  removeProject,
  mergeSaved,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  ACCESS,
  RESEARCH,
  researchStatus,
  fold,
  safeUrl as httpUrl,
  effectiveAccess,
  applicationTiming,
  localDate,
  filterFunds,
  sortFunds,
  PROJECT_SORTS,
  profileAndSortFromUrl,
  emptySaved,
  readSaved,
  savedIds,
  toggleSaved,
  favoritesCsv,
} from "./domain.mjs";
import { COUNTRIES, US_STATES, FUNDING_INSTRUMENTS } from "./storage.mjs";
import {
  programFund,
  createLexicalIndex,
  rankFunds,
  projectText,
  corpusDocuments,
  validConditions,
  MATCH_GROUPS,
  matchViewFromUrl,
  compareThematicFit,
  THEMATIC_FIT_RUBRIC,
} from "./matching.mjs";
import { upcomingWindows, deadlineLabel } from "./deadlines.mjs";
import { MODEL } from "./semantic-config.mjs";
import { LocalMatcher } from "./matching-client.mjs";

let eligibilityRules = [],
  programConditions = [],
  conditionsAvailable = false,
  eligibilityAvailable = false,
  lexicalIndex,
  matchResults = new Map(),
  matchKey = "",
  modelCatalog = null,
  aiEnabled = false,
  blockedSourceHosts = new Set();
const matcher = new LocalMatcher((next) => {
  if (!snapshot) return;
  if (next.status === "loading")
    renderMatching(saved.projects.find((p) => p.id === state.profile));
  else render();
});
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryOptions = COUNTRIES.map((code) => ({
  code,
  name: countryNames.of(code),
})).sort((a, b) => a.name.localeCompare(b.name));
for (const id of [
  "project-workCountries",
  "project-benefitCountries",
  "project-applicantBaseCountry",
  "project-registrationCountry",
]) {
  document.getElementById(id).innerHTML =
    (["project-workCountries", "project-benefitCountries"].includes(id)
      ? ""
      : '<option value="">Not specified</option>') +
    countryOptions
      .map(({ code, name }) => `<option value="${code}">${name}</option>`)
      .join("");
}

for (const id of ["project-usWorkStates", "project-usBenefitStates"])
  document.getElementById(id).innerHTML = Object.entries(US_STATES)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
document.getElementById("project-instruments").innerHTML = Object.entries(FUNDING_INSTRUMENTS)
  .map(([value, label]) => `<label><input type="checkbox" name="fundingInstruments" value="${value}"> ${label}</label>`).join("");

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const baseState = {
  q: "",
  region: "",
  theme: "",
  access: "",
  profile: "all",
  sort: "recommended",
  view: "explore",
  reviewed: false,
  depth: "",
  includeIncomplete: true,
  limit: 24,
  matchGroup: "all",
};
let state = { ...baseState },
  snapshot = null,
  funds = [],
  byId = new Map(),
  saved = emptySaved(),
  selected = [],
  currentFund = null,
  detailList = "general",
  detailProgramId = null;
let returnFocus = null,
  undoState = null,
  toastTimer,
  announceTimer,
  searchTimer,
  noteTimer,
  storageReadable = true,
  editingProject = null;
const fundDialog = $("fund-dialog"),
  compareDialog = $("compare-dialog"),
  aboutDialog = $("about-dialog"),
  projectDialog = $("project-dialog");
// Known compromised or unrelated source hosts stay as research data, not links.
function safeUrl(value) {
  const url = httpUrl(value);
  if (!url) return "";
  const host = new URL(url).hostname.replace(/^www\./, "");
  return blockedSourceHosts.has(host) ? "" : url;
}
const lists = () => listOptions(saved);
const profiles = () => [{ id: "all", name: "All projects" }, ...lists()];

function storageWarning(message) {
  $("storage-message").textContent = message;
  $("storage-warning").hidden = false;
}
try {
  const current = localStorage.getItem(STORAGE_KEY);
  const legacy =
    current === null ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
  saved = readSaved(current ?? legacy);
  if (legacy !== null) {
    persist();
    notify(
      "Your existing lists and notes are now editable projects. The original backup is retained.",
    );
  }
} catch {
  storageReadable = false;
  storageWarning(
    "Saved lists could not be read. New changes will stay in this session. Export a backup before closing.",
  );
}
function persist() {
  if (!storageReadable) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    $("storage-warning").hidden = true;
    return true;
  } catch {
    storageWarning(
      "Browser storage is unavailable. Changes are kept for this session; export a backup to keep them.",
    );
    return false;
  }
}
function notify(message, canUndo = false) {
  clearTimeout(toastTimer);
  $("toast-message").textContent = message;
  $("undo-button").hidden = !canUndo;
  $("toast").hidden = false;
  toastTimer = setTimeout(
    () => ($("toast").hidden = true),
    canUndo ? 7500 : 4500,
  );
}
function announce(message) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => ($("announcer").textContent = message), 220);
}
function activeList() {
  return state.profile === "all" ? "general" : state.profile;
}
function activeSavedIds() {
  return savedIds(saved, state.profile === "all" ? "all" : state.profile);
}
function isSaved(id, list = activeList()) {
  return saved.lists[list]?.includes(id) || false;
}
function isCardSaved(id) {
  return state.view === "saved" && state.profile === "all"
    ? savedIds(saved).includes(id)
    : isSaved(id);
}
function removeOrToggle(id, list, all = false) {
  undoState = structuredClone(saved);
  const removing = all ? savedIds(saved).includes(id) : isSaved(id, list);
  if (all && removing) {
    for (const l of lists())
      saved.lists[l.id] = saved.lists[l.id].filter((x) => x !== id);
  } else saved = toggleSaved(saved, id, list);
  const persisted = persist();
  render();
  updateDetailSave();
  const name = byId.get(id)?.displayName || "Fund";
  notify(
    removing
      ? `${name} removed${all ? " from all lists" : ""}.`
      : `Saved to ${lists().find((l) => l.id === list).name}${persisted ? "" : " for this session"}.`,
    true,
  );
}
function collectState() {
  const p = new URLSearchParams(location.search),
    next = { ...baseState };
  next.q = p.get("q") || "";
  next.region = p.get("region") || "";
  next.theme = p.get("theme") || "";
  next.access = ["available", "inquiry", "relationship", "future", "unverified"].includes(
    p.get("access"),
  )
    ? p.get("access")
    : "";
  Object.assign(next, profileAndSortFromUrl(p, saved, state.profile));
  next.view = p.get("view") === "saved" ? "saved" : "explore";
  next.reviewed = p.get("reviewed") === "1";
  next.depth = [
    "program_reviewed",
    "source_reviewed",
    "needs_research",
    "not_a_funder",
  ].includes(p.get("depth"))
    ? p.get("depth")
    : "";
  next.matchGroup = matchViewFromUrl(p);
  next.includeIncomplete = p.get("incomplete") !== "0";
  return next;
}
function updateUrl() {
  const url = new URL(location.href);
  for (const k of [
    "q",
    "region",
    "theme",
    "access",
    "profile",
    "sort",
    "view",
    "reviewed",
    "pilot",
    "matches",
    "incomplete",
    "depth",
  ])
    url.searchParams.delete(k);
  for (const k of ["q", "region", "theme", "access"])
    if (state[k]) url.searchParams.set(k, state[k]);
  // Project identity and descriptions stay off shared URLs.

  if (state.matchGroup !== "all") url.searchParams.set("matches", state.matchGroup);
  if (state.sort !== "recommended") url.searchParams.set("sort", state.sort);
  if (state.view !== "explore") url.searchParams.set("view", state.view);
  if (state.reviewed) url.searchParams.set("reviewed", "1");
  if (state.depth) url.searchParams.set("depth", state.depth);
  if (!state.includeIncomplete) url.searchParams.set("incomplete", "0");
  history.replaceState(history.state, "", url);
}
function setState(patch, { scroll = false } = {}) {
  state = { ...state, ...patch, limit: 24 };
  updateUrl();
  syncControls();
  render();
  if (scroll)
    $("workspace-title").scrollIntoView({ block: "start", behavior: "auto" });
}
// Ranking starts at next-step priority and keeps a project order someone chose.
const projectSort = () => (PROJECT_SORTS.includes(state.sort) ? state.sort : "match");
function syncControls() {
  $("search-input").value = state.q;
  $("region-filter").value = state.region;
  $("theme-filter").value = state.theme;
  $("access-filter").value = state.access;
  $("reviewed-filter").checked = state.reviewed;
  $("research-depth").value = state.depth;
  $("incomplete-filter").checked = state.includeIncomplete;
  $("sort-select").value = state.sort;
  $("match-group").value = state.matchGroup;
}
const shortTheme = (t) =>
  ({
    "Climate & environment": "Climate & nature",
    "Education & childhood development": "Education",
    "Employment & livelihoods": "Livelihoods",
    "Gender & racial equity": "Equity",
    "Science & technology": "Technology",
    "Governance & civic engagement": "Civic participation",
    "Children & youth": "Youth",
    "Food & agriculture": "Food & farming",
    "Health & wellbeing": "Wellbeing",
    "Arts & culture": "Arts & culture",
  })[t] || t;
function monogram(f) {
  if (f.displayName === "MIT Solve") return "MIT";
  return f.displayName
    .split(/\s+/)
    .filter((w) => !["the", "for", "and", "of", "&"].includes(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
function avatar(f) {
  const n = [...f.id].reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
  return `<span class="fund-monogram tone-${n}" aria-hidden="true">${escape(monogram(f))}</span>`;
}
function badge(f) {
  const a = ACCESS[effectiveAccess(f)];
  return `<span class="status-badge ${a.tone}">${escape(a.label)}</span>`;
}
function dueLabel(f) {
  if (
    !f.deadlineDate ||
    !["open", "restricted", "inquiry", "rolling"].includes(effectiveAccess(f))
  )
    return "";
  const d = new Date(f.deadlineDate + "T12:00:00Z");
  return `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d)}`;
}
function amountLabel(
  f,
  award = (
    f.enrichment?.programs.find((p) => p.id === f.displayProgramId) ||
    f.enrichment?.programs[0]
  )?.award,
) {
  if (f.enrichment) {
    const a = award;
    if (!a) return "No verified award range";
    if (a.basis === "historical") return "Historical terms · see details";
    const fmt = (n) =>
      `${a.currency} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)}`;
    if (a.min != null && a.max != null)
      return a.min === a.max ? fmt(a.min) : `${fmt(a.min)}–${fmt(a.max)}`;
    if (a.max != null) return `Up to ${fmt(a.max)}`;
    if (a.min != null) return `From ${fmt(a.min)}`;
    return "Award varies or unverified · see details";
  }
  const labels = {
    "MIT Solve": "$10,000 base award",
    "DRK Foundation": "Up to $300,000 · 3 years",
    "Agroecology Fund": "$50,000–$150,000",
    "Internet Society Foundation": "Up to $50,000 · Catalyst",
    "Wikimedia Foundation": "$500–$5,000",
    "National Performance Network": "From $15,000 · project",
    "Nathan Cummings Foundation": "Up to $100,000 · venture grants",
    "Global Greengrants Fund": "Up to $5,000 · partner call",
    "Panta Rhea Foundation": "Historical awards · see details",
  };
  return labels[f.displayName] || "Amount not verified";
}
function regionLabel(f) {
  if (f.regions.length >= 6) return "Multiple regions · check eligibility";
  if (f.regions.length > 2)
    return f.regions.slice(0, 2).join(", ") + ` +${f.regions.length - 2}`;
  return f.regions.join(", ") || "Geography not specified";
}
function card(f) {
  const checked = selected.includes(f.id),
    star = isCardSaved(f.id),
    allRemoval = state.view === "saved" && state.profile === "all";
  const saveLabel = star
    ? `Remove ${f.displayName} from ${allRemoval ? "all saved lists" : lists().find((l) => l.id === activeList()).name}`
    : `Save ${f.displayName} to ${lists().find((l) => l.id === activeList()).name}`;
  const allThemes = f.sectors.length ? f.sectors : f.enrichment?.focus || [];
  const themes = allThemes.slice(0, 2);
  return `<article class="fund-card${checked ? " selected" : ""}" data-fund="${escape(f.id)}">
    <div class="card-body"><div class="card-top">${avatar(f)}<div class="card-identity"><h4 class="fund-name"><button type="button" data-action="details" data-id="${escape(f.id)}">${escape(f.displayName)}</button></h4>${f.program ? `<p class="program-name">${escape(f.program)}</p>` : ""}</div><button type="button" class="save-button" data-action="save" data-id="${escape(f.id)}" aria-label="${escape(saveLabel)}" aria-pressed="${star}">${icon("heart")}</button></div>
    <div class="card-badges">${badge(f)}${dueLabel(f) ? `<span class="due-label">${escape(dueLabel(f))}</span>` : ""}</div>
    ${cardMatch(f)}<p class="card-description">${escape(f.description)}</p>
    <ul class="tag-list" role="list">${themes.map((t) => `<li class="tag">${escape(shortTheme(t))}</li>`).join("")}${allThemes.length > 2 ? `<li class="tag more" aria-label="${allThemes.length - 2} more themes">+${allThemes.length - 2}</li>` : ""}${!themes.length ? '<li class="tag">Focus not specified</li>' : ""}</ul>
    <div class="card-facts"><div class="fact-line amount"><span class="amount-symbol" aria-hidden="true">↗</span>${escape(amountLabel(f))}</div><div class="fact-line">${icon("globe")}<span class="region-text" title="${escape(f.regions.join(", "))}">${escape(regionLabel(f))}</span></div></div></div>
    <div class="card-research-line"><span class="card-research" title="Source review ${escape(f.enrichment.researchedOn)}">${f.verifiedOn ? icon("check") : ""} ${escape(RESEARCH[researchStatus(f)])}</span></div><div class="card-footer"><button type="button" class="compare-toggle" data-action="select" data-id="${escape(f.id)}" aria-label="${checked ? "Remove" : "Add"} ${escape(f.displayName)} ${checked ? "from" : "to"} comparison" aria-pressed="${checked}"><span class="check-box">${icon("check")}</span>Compare</button><span class="card-links"><button type="button" class="details-button" data-action="details" data-id="${escape(f.id)}" aria-label="View ${escape(f.displayName)} details">Details ${icon("arrow")}</button>${safeUrl(f.evidenceUrl || f.website) ? `<a class="card-website" href="${escape(safeUrl(f.evidenceUrl || f.website))}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${escape(f.displayName)} ${f.evidenceUrl ? "official source" : "listed website"} (opens in a new tab)" title="${f.evidenceUrl ? "Official source" : "Listed website"}">${icon("external")}</a>` : ""}</span></div>
  </article>`;
}
function renderMatching(project) {
  $("matching-panel").hidden = !project || state.view === "saved";
  for (const sort of PROJECT_SORTS)
    $("sort-select").querySelector(`[value="${sort}"]`).disabled = !project;
  if (!project) return;
  const hasText = Boolean(projectText(project).trim());
  $("matching-status").textContent = !hasText
    ? "Add a project description or tags to start matching."
    : matcher.state.message;
  $("enable-ai-button").disabled =
    !hasText ||
    matcher.state.status === "loading" ||
    matcher.state.status === "ready";
  $("enable-ai-button").textContent =
    matcher.state.status === "error"
      ? "Retry local AI · 40 MB"
      : matcher.state.status === "ready"
        ? "Local AI enabled"
        : matcher.state.status === "loading"
          ? "Loading local AI…"
          : "Use local AI · 40 MB";
  $("stop-ai-button").hidden = !["loading", "ready"].includes(
    matcher.state.status,
  );
  $("match-project-button").disabled = !hasText;
  $("match-project-button").textContent =
    PROJECT_SORTS.includes(state.sort)
      ? "View ranked funds"
      : "Rank for this project";
  $("eligibility-status").textContent = eligibilityAvailable
    ? "Each executable check shows its research date and becomes advisory after 180 days. Always recheck the linked official program terms."
    : "Sourced eligibility checks could not load. Every program needs manual eligibility review.";
}
function cardMatch(f) {
  const m = matchResults.get(f.id);
  if (!m) return "";
  const fit = m.thematicFit;
  const evidence = fit.evidenceTerms.slice(0, 5);
  const numeric = fit.score == null ? '<strong class="fit-unassessed">Not assessed</strong>' : `<strong class="match-score">${fit.score}<span> / 100</span></strong>`;
  const meter = fit.score == null ? "" : `<meter class="match-meter" min="0" max="100" value="${fit.score}" aria-label="Thematic fit">${fit.score} out of 100 thematic fit</meter>`;
  return `<div class="match-card"><div class="match-score-row"><div><span class="fit-score-label">Thematic fit</span>${numeric}</div><span>${state.sort === "match" ? `Priority #${m.rank} · ` : ""}${m.method === "semantic" ? "On-device AI" : "Keywords"}</span></div><p><strong>${escape(fit.label)}</strong></p>${meter}<p>${!m.focusAvailable || !m.specificPurposeAvailable ? "More specific focus information is needed to assess fit." : evidence.length ? `Shared topics: ${escape(evidence.join(", "))}` : "Semantic alignment only; review the program’s purpose."}</p><p class="match-group-label">${escape(MATCH_GROUPS[m.group])}</p><span class="eligibility-label ${m.eligibility.status === "conflict" ? "conflict" : ""}"><strong>Readiness:</strong> ${escape(m.readiness.label)}</span>${m.instrument.status === "mismatch" || m.instrument.status === "unconfirmed" ? `<small>${escape(m.instrument.reason)}</small>` : ""}<small>${m.program ? escape(m.program.instrument) + " · " : ""}Fit measures theme alignment. Eligibility and application access are separate checks.</small></div>`;
}
function matchDetails(f) {
  const m = matchResults.get(f.id);
  if (!m || m.program?.id !== f.displayProgramId) return "";
  const conditions = m.eligibility.programs.flatMap((p) => p.checks).filter((c) => c.field === "condition");
  const automated = m.eligibility.programs.flatMap((p) => p.checks).filter((c) => c.field !== "condition");
  return `<section class="detail-section match-explanation"><h3>Why this appears for your project</h3>${cardMatch(f)}<p>${m.program ? `Matched program: <strong>${escape(m.program.name)}</strong>. ` : "This overview has no verified program terms. "}Thematic fit compares your description and tags with documented program focus. It does not include geography, legal status, funding preferences, award size, deadlines or unconfirmed prerequisites.</p><details class="quality-details"><summary>How the fit grade is calculated</summary><p>${escape(m.thematicFit.basis)} Related word forms count once, and broad organizational language does not count as specific topic evidence. Sparse evidence is limited to Partial overlap. ${m.method === "semantic" ? `Raw on-device cosine similarity: ${m.cosine.toFixed(3)}. The local semantic signal grades ${m.thematicFit.semanticGrade}/100 on the disclosed relevance rubric.` : "Keyword mode uses the specific shared terms only. AI and keyword grades may differ."}</p><p>Shared-term evidence grade: ${m.thematicFit.keywordGrade}/100. ${m.thematicFit.score == null ? "There is not enough specific documented focus for a numeric fit assessment." : `Final thematic fit: <strong>${m.thematicFit.score}/100</strong>.`}</p><p>80–100: Strong thematic fit; 60–79: Relevant themes; 40–59: Partial thematic overlap; below 40: Limited thematic overlap. These are heuristic evidence bands, not measured funding probabilities. They need validation against human-reviewed matches.</p><p>Specific shared terms: ${THEMATIC_FIT_RUBRIC.sharedTermGrades.slice(1).map((grade, i, all) => `${i + 1}${i === all.length - 1 ? "+" : ""} → ${grade}`).join(", ")}. Word forms such as culture/cultural and art/arts count once. Semantic cosine anchors: ${THEMATIC_FIT_RUBRIC.semanticAnchors.map(([cosine, grade]) => `${cosine.toFixed(2)} → ${grade}`).join(", ")}. The higher supported signal sets the fit grade. Broad-only focus is left unassessed; sparse purpose evidence cannot exceed 59. No score is based on a fund’s rank among the 593 records.</p></details><h4>Readiness and shortlist priority</h4><p><strong>${escape(m.readiness.label)}.</strong> Ranking considers the documented application route and the checks below. A high thematic fit can still have an eligibility conflict or a closed application cycle. Research leads need relevant thematic fit and the existing shortlist checks; a fit grade never overrides those checks.</p>${m.limits.length ? `<ul>${[...new Set(m.limits.map((l) => l.reason))].map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>` : ""}<p>${escape(m.award)}</p><p><strong>Geographic scope:</strong> ${escape(m.geography)}</p>${m.geographic.reasons.length ? `<ul>${m.geographic.reasons.map((r) => `<li>${escape(r)}</li>`).join("")}</ul>` : ""}<h4>Country and applicant checks</h4>${automated.length ? `<ul>${automated.map((c) => `<li><strong>${c.outcome === "conflict" ? "Conflict with your profile" : c.stale ? "Source needs rechecking" : c.missing ? "Profile detail missing" : c.outsidePriority ? "Outside published priority; exceptions may apply" : c.partial ? "Only part of your scope overlaps" : "No conflict found in this check"}:</strong> ${escape(c.reason)} ${link(c.sourceUrl, "Official rule")} <small>Checked ${escape(c.checkedOn)}</small></li>`).join("")}</ul>` : "<p>No executable country/applicant checks for this program. Review the official scope.</p>"}<h4>Program prerequisites and priorities</h4><p>Answer for this project only. Answers stay in this browser and its backups. “Yes” is self-reported, not funder approval. Changing project details clears these answers; a changed source date requires confirmation again.</p>${conditions.length ? conditions.map((c) => `<div class="condition-check"><label for="condition-${escape(c.id)}"><strong>${c.kind === "priority" ? "Selection priority" : "Required condition"}:</strong> ${escape(c.requirement)}</label><p>${link(c.sourceUrl, "Official condition")} · checked ${escape(c.checkedOn)}${c.stale ? " · source needs rechecking" : ""}</p><select id="condition-${escape(c.id)}" data-condition-key="${escape(c.key)}" data-source-date="${escape(c.checkedOn)}"${c.stale ? " disabled" : ""}><option value="">Not confirmed</option><option value="yes"${c.answer === "yes" ? " selected" : ""}>Yes, this project meets it</option><option value="no"${c.answer === "no" ? " selected" : ""}>No, this project does not meet it</option></select><small>${c.outcome === "conflict" ? "Known prerequisite conflict: research priority is 0; thematic fit is unchanged." : c.outcome === "self_reported" ? "Self-reported; verify before applying." : c.kind === "priority" ? "A priority is not a hard exclusion." : "Unconfirmed prerequisites limit ranking; the applicable limits appear above."}</small></div>`).join("") : "<p>No structured prerequisites for this program yet. This does not mean there are none. Read all requirements below.</p>"}<p>Country overlap does not establish city, county, partner or sponsor eligibility. All documented requirements still need review.</p>${m.alternatives.length ? `<h4>Other researched programs</h4><ul>${m.alternatives.map((p) => `<li>${escape(p.name)} · ${p.thematicFit.score == null ? "fit not assessed" : p.thematicFit.score + "/100 thematic fit"} · ${escape(ACCESS[p.access]?.label || p.access)} · ${escape(p.readiness.label)}</li>`).join("")}</ul><p>Each program is scored using its own purpose and terms. All program sources remain below.</p>` : ""}</section>`;
}
function missingCard(id) {
  return `<article class="fund-card"><div class="card-body"><h4 class="fund-name">Saved record unavailable</h4><p class="card-description">This source record is not in the current snapshot. It stays in your list and exports until you remove it.</p><p class="description-note">${escape(id)}</p></div><div class="card-footer"><button type="button" class="button button-text" data-action="save" data-id="${escape(id)}">Remove from saved</button></div></article>`;
}
let deadlineHorizon = 21;
let showAllDeadlines = false;
let deadlineSignature = "";
function renderDeadlines() {
  if (!snapshot) return;
  const section = $("deadline-pulse");
  section.hidden = state.view === "saved";
  const windows = upcomingWindows(funds, new Date(), deadlineHorizon);
  const signature = JSON.stringify([deadlineHorizon, showAllDeadlines, windows.map(w => [w.fund.id, w.program.id, w.days, w.instant])]);
  if (signature === deadlineSignature) return;
  deadlineSignature = signature;
  const focused = document.activeElement;
  const focusProgram = focused?.dataset?.action === "deadline-program" ? focused.dataset.program : null;
  $("deadline-count").textContent = `${windows.length} program windows`;
  const shown = showAllDeadlines ? windows : windows.slice(0, 3);
  $("deadline-windows").innerHTML = shown.length ? shown.map((w) => {
    const urgency = w.days === 0 ? "Due today" : w.days === 1 ? "Due tomorrow" : `Due in ${w.days} days`;
    return `<li class="deadline-card"><div class="deadline-card-top"><span class="deadline-urgency${w.days <= 3 ? " soon" : ""}">${escape(urgency)}</span><span class="deadline-route">${escape(ACCESS[w.fund.access].label)}</span></div><h4>${escape(w.program.name)}</h4><p class="deadline-funder">${escape(w.fund.displayName)}</p><p class="deadline-date"><time datetime="${escape(w.fund.deadlineInstant || w.date)}">${escape(deadlineLabel(w))}</time></p><p class="deadline-precision">${w.instant !== null ? "Shown in your timezone" : "Cutoff time or timezone unverified"}</p><p class="deadline-scope">${escape(w.program.geography.scope || "Geographic eligibility needs review.")}</p><div class="deadline-card-bottom"><span>Source checked ${escape(w.checkedOn)}</span><button type="button" class="button button-text" data-action="deadline-program" data-id="${escape(w.fund.id)}" data-program="${escape(w.program.id)}">Review terms <span aria-hidden="true">↗</span><span class="sr-only"> for ${escape(w.program.name)}</span></button></div></li>`;
  }).join("") : '<li class="deadline-empty">No sourced, currently available program windows close in this period. Explore the directory for rolling routes and future calls.</li>';
  const more = $("deadline-more");
  more.hidden = windows.length <= 3;
  more.textContent = showAllDeadlines ? "Show fewer windows" : `View all ${windows.length} windows`;
  more.setAttribute("aria-expanded", String(showAllDeadlines));
  if (focusProgram) {
    const replacement = [...$("deadline-windows").querySelectorAll("button")].find(b => b.dataset.program === focusProgram);
    (replacement || $("deadline-title")).focus({ preventScroll: true });
  }
}
$("deadline-horizon").addEventListener("change", (event) => {
  deadlineHorizon = Number(event.target.value);
  showAllDeadlines = false;
  renderDeadlines();
});
// Refresh the pulse when returning to a tab, and while it remains open.
window.addEventListener("focus", renderDeadlines);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderDeadlines();
});
setInterval(() => { if (!document.hidden) renderDeadlines(); }, 60000);

function render() {
  if (!snapshot) return;
  renderDeadlines();
  const focused = document.activeElement,
    focusKey = focused?.dataset?.action,
    focusId = focused?.dataset?.id;
  $("saved-count").textContent = savedIds(saved).length;
  document.querySelectorAll("[data-view]").forEach((b) => {
    const active = b.dataset.view === state.view;
    b.classList.toggle("active", active);
    active
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current");
  });
  $("workspace-title").textContent =
    state.view === "saved" ? "Your saved funds" : "Explore the directory";
  $("project-select").innerHTML = profiles()
    .map(
      (p) =>
        `<option value="${escape(p.id)}">${escape(p.id === "all" ? (state.view === "saved" ? "All saved lists" : "All funds · save to General") : p.name)}</option>`,
    )
    .join("");
  if (!profiles().some((p) => p.id === state.profile)) state.profile = "all";
  $("project-select").value = state.profile;
  const project = saved.projects.find((p) => p.id === state.profile);
  if (!project && PROJECT_SORTS.includes(state.sort)) {
    state.sort = "recommended";
    $("sort-select").value = state.sort;
    updateUrl();
  }
  const key = project ? project.id + ":" + projectText(project) : "";
  if (key !== matchKey) {
    matchKey = key;
    if (!project || !projectText(project).trim()) {
      aiEnabled = false;
      // cancel emits synchronously; key is updated first to avoid recursive work.
      matcher.cancel();
    } else if (aiEnabled && modelCatalog) {
      matcher.match(projectText(project), modelCatalog.corpusHash);
    } else if (matcher.state.status !== "off") matcher.cancel();
  }
  matchResults = new Map(
    project
      ? rankFunds(
          funds,
          project,
          lexicalIndex,
          eligibilityRules,
          matcher.state.scores,
          new Date(),
          conditionsAvailable && eligibilityAvailable ? programConditions : null,
        ).map((m, i) => [m.fund.id, { ...m, rank: i + 1 }])
      : [],
  );
  renderMatching(project);
  document.body.classList.toggle("project-active", Boolean(project));
  document.body.classList.toggle("saved-view", state.view === "saved");
  $("edit-project-button").hidden = !project;
  $("workspace-hint").hidden = Boolean(project);
  $("workspace-hint").textContent = state.view === "saved"
    ? "Choose a project to see its shortlist, or view every saved list together."
    : "Add your project to rank funds for your work, or browse and save to General.";
  $("project-summary").hidden = !project;
  if (project)
    $("project-summary").innerHTML =
      `<summary>Project details <span>${escape(projectGoal(project))}</span></summary>${project.description ? `<p>${escape(project.description)}</p>` : "<p>Add a description and funding goal to complete this migrated project.</p>"}<div class="tag-list">${project.tags.map((t) => `<span class="tag">${escape(t)}</span>`).join("")}</div><p class="description-note">Funding types: ${project.fundingInstruments.length ? escape(project.fundingInstruments.map((i) => FUNDING_INSTRUMENTS[i]).join(", ")) : "All types"}. ${project.usWorkStates.length ? "US work states: " + escape(project.usWorkStates.map((s) => US_STATES[s]).join(", ")) + ". " : ""}${project.usBenefitStates.length ? "US benefit states: " + escape(project.usBenefitStates.map((s) => US_STATES[s]).join(", ")) + ". " : ""}All funds remain available. ${project.benefitCountries.length ? "Benefit countries: " + escape(project.benefitCountries.map((c) => countryNames.of(c)).join(", ")) + ". " : "Benefit countries not specified. "}${project.workCountries.length ? "Funded work: " + escape(project.workCountries.map((c) => countryNames.of(c)).join(", ")) : "Add locations and applicant details for sourced eligibility checks."}</p>`;
  const grouping = Boolean(project && PROJECT_SORTS.includes(state.sort) && state.view === "explore");
  $("match-view").hidden = !grouping;
  if (grouping) {
    const counts = Object.fromEntries(Object.keys(MATCH_GROUPS).map((g) => [g, [...matchResults.values()].filter((m) => m.group === g).length]));
    $("match-summary").textContent = `${counts.lead} research lead${counts.lead === 1 ? "" : "s"} · ${counts.check} need scope, funding type or access checks · ${counts.unverified} have unverified funding offers · ${counts.limited} have limited relevance · ${counts.outside} with conflicts or funding preference mismatches. All ${funds.length} records remain available. Leads still need eligibility review.`;
  }
  const savedAll = activeSavedIds();
  const filtered = sortFunds(filterFunds(funds.map((f) => matchResults.get(f.id)?.fund || f), state, savedAll), state.sort).filter((f) => !grouping || state.matchGroup === "all" || matchResults.get(f.id).group === state.matchGroup);
  if (state.sort === "match" && project)
    filtered.sort(
      (a, b) => matchResults.get(a.id).rank - matchResults.get(b.id).rank,
    );
  if (state.sort === "fit" && project)
    filtered.sort((a, b) =>
      compareThematicFit(matchResults.get(a.id), matchResults.get(b.id)),
    );
  const unavailable =
    state.view === "saved" &&
    !state.q &&
    !state.theme &&
    !state.region &&
    !state.access &&
    !state.reviewed &&
    !state.depth
      ? savedAll.filter((id) => !byId.has(id))
      : [];
  const total = filtered.length + unavailable.length;
  $("result-count").textContent =
    `${total.toLocaleString()} ${state.view === "saved" ? "saved " : ""}fund${total === 1 ? "" : "s"}`;
  $("result-context").textContent =
    state.view === "saved"
      ? "Saved in this browser"
      : state.profile === "all"
        ? "for a world of good work"
        : PROJECT_SORTS.includes(state.sort)
          ? `${matcher.state.scores ? "Local AI" : "Keyword"} · ${state.matchGroup === "all" ? "all match groups" : MATCH_GROUPS[state.matchGroup]} · sorted by ${state.sort === "fit" ? "thematic fit" : "next-step priority"}`
          : "for your project shortlist · all funds remain available";
  $("backup-button").hidden = state.view !== "saved";
  $("saved-guide").hidden = state.view !== "saved";
  $("saved-guide").textContent = `${savedAll.length} saved across ${state.profile === "all" ? "all your lists" : lists().find((l) => l.id === activeList()).name}. Choose Compare on 2–4 funds. CSV includes this entire shortlist, even when filtered. Backups include all projects and private notes.`;
  $("export-button").hidden = state.view !== "saved";
  $("export-button").disabled = savedAll.length === 0;
  $("export-button").querySelector("span").textContent =
    `Export ${savedAll.length} saved as CSV`;
  const visible = filtered.slice(0, state.limit);
  if (total) {
    $("results").innerHTML =
      visible.map(card).join("") +
      (state.limit >= filtered.length
        ? unavailable.map(missingCard).join("")
        : "");
  } else {
    const isEmptySaved = state.view === "saved" && savedAll.length === 0;
    if (grouping && state.matchGroup !== "all") {
      $("results").innerHTML = `<div class="empty-state"><h4>No funds in this match view.</h4><p>Try another match view or clear your search and filters. You can review candidates needing checks or explore all records.</p><button type="button" class="button button-primary" data-action="check-matches">Review candidates needing checks</button><button type="button" class="button button-secondary" data-action="all-matches">Show all match groups</button><button type="button" class="button button-text" data-action="clear-filters">Clear search &amp; filters</button></div>`;
    } else {
      $("results").innerHTML =
      `<div class="empty-state${isEmptySaved ? " saved-empty" : ""}"><div class="empty-illustration" aria-hidden="true">${isEmptySaved ? "♡" : "✳"}</div><h4>${isEmptySaved ? "A little possibility, saved for later." : "No funds found. Let’s widen the search."}</h4><p>${isEmptySaved ? "Tap the heart on a fund to start your shortlist. Choose a project above to keep its funds together." : "Try a broader theme, another region, or fewer filters. Many records still need their eligibility checked."}</p><button type="button" class="button button-primary" data-action="${isEmptySaved ? "explore" : "clear-filters"}">${isEmptySaved ? "Explore funds" : "Clear search & filters"} ${icon("arrow")}</button></div>`;
    }
  }
  $("results").setAttribute("aria-busy", "false");
  $("pagination").hidden = filtered.length <= state.limit;
  $("page-progress").textContent =
    `Showing ${visible.length} of ${filtered.length} funds`;
  renderActiveFilters(grouping);
  renderTray();
  if (focusKey && focusId && !focused.isConnected) {
    const target = document.querySelector(
      `[data-action="${CSS.escape(focusKey)}"][data-id="${CSS.escape(focusId)}"]`,
    );
    target?.focus({ preventScroll: true });
  }
  if (fundDialog.open && currentFund) openFund(currentFund.id, false, true);
  announce(`${total} fund${total === 1 ? "" : "s"} found`);
}
function renderActiveFilters(matchView = false) {
  const chips = [];
  for (const [key, label] of [
    [
      "matchGroup",
      matchView && state.matchGroup !== "all"
        ? $("match-group").selectedOptions[0].textContent
        : "",
    ],
    ["q", state.q ? `Search: ${state.q}` : ""],
    ["region", state.region],
    ["theme", state.theme ? shortTheme(state.theme) : ""],
    [
      "access",
      state.access ? $("access-filter").selectedOptions[0].textContent : "",
    ],
    ["reviewed", state.reviewed ? "Primary research only" : ""],
    [
      "depth",
      state.depth ? $("research-depth").selectedOptions[0].textContent : "",
    ],
    [
      "includeIncomplete",
      !state.includeIncomplete ? "Incomplete records hidden" : "",
    ],
  ])
    if (label)
      chips.push(
        `<button type="button" class="filter-chip" data-action="remove-filter" data-filter="${key}" aria-label="Remove ${escape(label)} filter">${escape(label)} ${icon("close")}</button>`,
      );
  $("active-filters").hidden = !chips.length;
  $("active-filters").innerHTML =
    chips.join("") +
    (chips.length
      ? '<button type="button" class="clear-filters" data-action="clear-filters">Clear all</button>'
      : "");
}
function renderTray() {
  $("compare-tray").hidden = selected.length === 0;
  $("tray-count").textContent =
    `${selected.length} fund${selected.length === 1 ? "" : "s"} selected`;
  $("compare-button").disabled = selected.length < 2;
  $("compare-button").innerHTML =
    (selected.length < 2 ? "Select one more fund" : "Compare funds") +
    icon("arrow");
  $("tray-funds").innerHTML = selected
    .map(
      (id) =>
        `<span class="tray-fund"><span>${escape(byId.get(id).displayName)}</span><button type="button" data-action="select" data-id="${escape(id)}" aria-label="Remove ${escape(byId.get(id).displayName)} from comparison">${icon("close")}</button></span>`,
    )
    .join("");
}
function selectFund(id) {
  if (selected.includes(id)) selected = selected.filter((x) => x !== id);
  else {
    if (selected.length === 4) {
      notify("Compare up to 4 funds. Remove one to add another.");
      return;
    }
    selected.push(id);
  }
  render();
  updateDetailCompare();
  if (compareDialog.open) renderComparison();
  announce(`${selected.length} funds selected for comparison`);
}
function link(url, label, cls = "source-link") {
  const safe = safeUrl(url);
  return safe
    ? `<a class="${cls}" href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${escape(label)} ${icon("external")}<span class="sr-only"> (opens in a new tab)</span></a>`
    : "";
}
function openFund(id, push = true, refresh = false, programId = null) {
  if (refresh) programId = detailProgramId;
  else detailProgramId = programId;
  const priorFocusId = refresh ? document.activeElement?.id : null;
  const priorScroll = fundDialog.scrollTop;
  const priorList = detailList;
  const noteSelection = refresh && priorFocusId === "fund-notes" ? [$("fund-notes").selectionStart, $("fund-notes").selectionEnd] : null;
  const base = byId.get(id);
  const program = base?.enrichment?.programs.find((p) => p.id === programId);
  const f = program ? programFund(base, program) : matchResults.get(id)?.fund || base;
  if (!f) {
    notify("That record is not in this directory snapshot.");
    if (push) return;
    const u = new URL(location.href);
    u.searchParams.delete("fund");
    u.searchParams.delete("program");
    history.replaceState(history.state, "", u);
    return;
  }
  if (compareDialog.open) compareDialog.close();
  if (!fundDialog.open) returnFocus = document.activeElement;
  currentFund = f;
  detailList = refresh ? priorList : activeList();
  const notes = saved.notes[f.id] || "";
  $("fund-content").innerHTML =
    `<div class="dialog-header"><div class="dialog-topline"><p class="eyebrow">FUND DETAILS</p><button type="button" class="icon-button" data-action="close-fund" aria-label="Close fund details">${icon("close")}</button></div><div class="dialog-identity">${avatar(f)}<div><h2 id="fund-title" tabindex="-1">${escape(f.displayName)}</h2>${f.program ? `<p class="program-name">${escape(f.program)}</p>` : ""}</div></div><div class="card-badges">${badge(f)}${dueLabel(f) ? `<span class="due-label">${escape(dueLabel(f))}</span>` : ""}</div><nav class="fund-section-nav" aria-label="Fund details sections"><button type="button" data-action="fund-section" data-section="fund-overview">Overview</button><button type="button" data-action="fund-section" data-section="fund-research">Research & terms</button><button type="button" data-action="fund-section" data-section="fund-sources">Sources</button><button type="button" data-action="fund-section" data-section="fund-private-notes">Your notes</button></nav></div>
    <div class="dialog-body"><div id="fund-overview" class="fund-section-anchor" tabindex="-1"></div><p class="dialog-summary">${escape(f.description)}</p>${f.descriptionBasis === "directory-tags" ? '<p class="description-note">This summary uses directory tags. Its mission and current grant terms need checking.</p>' : ""}
    <dl class="detail-grid"><div><dt>Award & term</dt><dd>${escape(f.amount)}</dd></div><div><dt>Application timing</dt><dd>${escape(applicationTiming(f))}${f.deadlineDate && !f.deadlineInstant ? '<br><span class="description-note">The source gives a date; the exact deadline time is unverified.</span>' : ""}</dd></div><div><dt>Application route</dt><dd>${escape(f.accessDetail)}</dd></div><div><dt>Region tags</dt><dd>${escape(f.regions.join(" · ") || "Not specified")}<br><span class="description-note">Broad coverage tags; check country eligibility.</span></dd></div></dl>
    <section class="detail-section"><h3>What it focuses on</h3><ul class="tag-list" role="list">${f.sectors.map((t) => `<li class="tag">${escape(t)}</li>`).join("") || '<li class="tag">Focus not specified</li>'}</ul>${f.approaches.length ? `<p><strong>Funding approach:</strong> ${escape(f.approaches.join(" · "))}</p>` : ""}${f.grantBands.length ? `<p class="description-note">Directory size bands: ${escape(f.grantBands.join(", "))}. These labels have no verified dollar equivalent.</p>` : ""}</section>
    ${matchDetails(f)}<div id="fund-research" class="fund-section-anchor" tabindex="-1"></div>${enrichmentDetails(f)}
    <section class="detail-section fund-section-anchor" id="fund-sources" tabindex="-1"><h3>Sources & freshness</h3><div class="evidence-block">${f.evidenceUrl ? link(f.evidenceUrl, "View the primary research source") : link(f.website, "Visit the listed website")}<p>${f.verifiedOn ? `Official sources researched ${f.verifiedOn}. Recheck details before applying.` : "Current application information has not been independently verified."}</p>${link(f.sourceUrl, f.origin?.kind === "supplemental-research" ? "Supplemental research source" : "Original Fito directory")}<p>${f.origin?.kind === "supplemental-research" ? "Local catalog record" : "Source record"}: ${escape(f.id)}</p></div>${f.additionalSources.length ? `<details class="quality-details"><summary>More official sources</summary><ul>${f.additionalSources.map((s, i) => `<li>${link(s, `Official source ${i + 2}`)}</li>`).join("")}</ul></details>` : ""}${f.aliasNote ? `<p class="description-note">Possible related/duplicate record: ${escape(f.aliasNote)}. Source rows are retained separately.</p>` : ""}${f.qualityFlags.length ? `<details class="quality-details"><summary>Directory quality notes (${f.qualityFlags.length})</summary><ul>${f.qualityFlags.map((q) => `<li>${escape(q)}</li>`).join("")}</ul></details>` : ""}</section>
    <section class="detail-section fund-section-anchor" id="fund-private-notes" tabindex="-1"><h3>Your private notes</h3><label class="note-box" for="fund-notes">What would you like to remember?<textarea id="fund-notes" maxlength="5000" placeholder="A project angle, eligibility question, or next step…">${escape(notes)}</textarea></label><p class="note-caption">Stored in this browser · included in your exports</p></section></div>
    <div class="dialog-actions"><label class="save-list-control" for="detail-list">Save for <select id="detail-list">${lists()
      .map(
        (l) =>
          `<option value="${l.id}"${l.id === detailList ? " selected" : ""}>${escape(l.name)}</option>`,
      )
      .join(
        "",
      )}</select></label><button type="button" class="button button-secondary" id="detail-compare" data-action="detail-compare"></button><button type="button" class="button button-primary dialog-save" id="detail-save" data-action="detail-save"></button>${safeUrl(f.evidenceUrl || f.website) ? link(f.evidenceUrl || f.website, f.verifiedOn ? "Reviewed source" : "Listed website", "button button-secondary") : `<span class="unavailable-link">${f.sourceWarnings?.length ? "Source link disabled after review" : "No listed website"}</span>`}</div>`;
  $("detail-list").addEventListener("change", (e) => {
    detailList = e.target.value;
    updateDetailSave();
  });
  $("fund-notes").addEventListener("input", (e) => {
    const text = e.target.value;
    saved.notes[id] = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(persist, 350);
  });
  updateDetailSave();
  updateDetailCompare();
  if (!fundDialog.open) fundDialog.showModal();
  if (refresh) {
    if (priorFocusId) (document.getElementById(priorFocusId) || $("fund-title")).focus({ preventScroll: true });
    if (noteSelection) $("fund-notes").setSelectionRange(...noteSelection);
    fundDialog.scrollTop = priorScroll;
  } else {
    $("fund-title").focus({ preventScroll: true });
    fundDialog.scrollTop = 0;
  }
  if (push) {
    const before = new URL(location.href);
    history.replaceState(
      { ...history.state, scrollY: window.scrollY },
      "",
      before,
    );
    before.searchParams.set("fund", id);
    if (program) before.searchParams.set("program", program.id);
    else before.searchParams.delete("program");
    history.pushState({ fundOverlay: true }, "", before);
  }
}
function updateDetailSave() {
  if (!currentFund || !$("detail-save")) return;
  if (!Object.hasOwn(saved.lists, detailList)) detailList = "general";
  if ($("detail-list")) {
    $("detail-list").innerHTML = lists()
      .map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`)
      .join("");
    $("detail-list").value = detailList;
  }
  const on = isSaved(currentFund.id, detailList),
    b = $("detail-save");
  b.innerHTML = icon(on ? "check" : "heart") + (on ? "Saved" : "Save fund");
  b.setAttribute("aria-pressed", String(on));
  b.classList.toggle("saved", on);
}
function updateDetailCompare() {
  if (!currentFund || !$("detail-compare")) return;
  const on = selected.includes(currentFund.id),
    b = $("detail-compare");
  b.innerHTML = icon("compare") + (on ? "In comparison" : "Compare");
  b.setAttribute("aria-pressed", String(on));
}
function restoreFocus() {
  if (
    returnFocus?.isConnected &&
    (!returnFocus.closest("dialog") || returnFocus.closest("dialog").open)
  )
    returnFocus.focus({ preventScroll: true });
  else $("results-title").focus({ preventScroll: true });
}
function closeFund(fromHistory = false) {
  clearTimeout(noteTimer);
  persist();
  if (fundDialog.open) fundDialog.close();
  currentFund = null;
  detailProgramId = null;
  if (!fromHistory) {
    const url = new URL(location.href);
    if (url.searchParams.has("fund")) {
      if (history.state?.fundOverlay) history.back();
      else {
        url.searchParams.delete("fund");
        url.searchParams.delete("program");
        history.replaceState(history.state, "", url);
      }
    }
  }
  restoreFocus();
}
function renderComparison() {
  const scroll = $("comparison-content").querySelector(".compare-scroll");
  const position = { top: scroll?.scrollTop || 0, left: scroll?.scrollLeft || 0 };
  const focused = document.activeElement;
  const focusAction = compareDialog.contains(focused) ? focused.dataset.action : null;
  const focusId = focused?.dataset.id;
  const items = selected.map((id) => matchResults.get(id)?.fund || byId.get(id));
  const row = (label, fn) =>
    `<tr><th scope="row" class="row-label">${label}</th>${items.map((f) => `<td>${fn(f)}</td>`).join("")}</tr>`;
  $("comparison-content").innerHTML =
    `<div class="comparison-header"><div class="dialog-topline"><p class="eyebrow">SIDE BY SIDE</p><button type="button" class="icon-button" data-action="close-compare" aria-label="Close comparison">${icon("close")}</button></div><h2 id="comparison-title" tabindex="-1">Find your best next step.</h2><p>${items.length < 2 ? "Add another fund from the directory to compare." : "Compare access, requirements and timing. Scroll the table to see every fund."}</p><p class="comparison-saving">Hearts save to ${escape(lists().find((l) => l.id === activeList()).name)} · on this device</p></div>${
      items.length
        ? `<div class="compare-scroll" tabindex="0" aria-label="Funding comparison table; scroll horizontally for more columns"><table class="compare-table" style="min-width:${145 + items.length * 220}px"><caption class="sr-only">Comparison of ${items.length} selected funders</caption><thead><tr><th scope="col" class="row-label">The essentials</th>${items.map((f) => `<th scope="col"><h3>${escape(f.displayName)}</h3><button type="button" class="button button-secondary" data-action="compare-save" data-id="${f.id}" aria-pressed="${isSaved(f.id)}">${icon(isSaved(f.id) ? "check" : "heart")}${isSaved(f.id) ? "Saved" : "Save"}</button><button type="button" class="remove-comparison" data-action="select" data-id="${f.id}" aria-label="Remove ${escape(f.displayName)} from comparison">Remove</button></th>`).join("")}</tr></thead><tbody>${matchResults.size ? row("Thematic fit & readiness", (f) => cardMatch(f) + "<p>" + escape(matchResults.get(f.id).award) + "</p>") : ""}${row("Application access", (f) => badge(f) + "<p>" + escape(f.accessDetail) + "</p>")}${row("Award & term", (f) => escape(f.amount))}${row("Deadline / timing", (f) => escape(applicationTiming(f)))}${row("Purpose", (f) => escape(f.description))}${row("Region tags", (f) => escape(f.regions.join(" · ") || "Not specified"))}${row(
            "Eligibility to confirm",
            (f) => {
              return escape(
                (matchResults.get(f.id)?.program ? [matchResults.get(f.id).program] : f.enrichment?.programs || [])
                  .flatMap((p) => [
                    p.geography.scope,
                    ...p.applicants.requirements,
                    ...p.applicants.exclusions,
                  ])
                  .join(" · ") ||
                  "Read the source; program requirements are not yet structured.",
              );
            },
          )}${row("Next action", (f) => escape((matchResults.get(f.id)?.program ? [matchResults.get(f.id).program] : f.enrichment?.programs || []).map((p) => p.application.note).join(" · ") || "Read the official requirements and verify the application route."))}${row("Last researched", (f) => escape(f.verifiedOn || "Unverified"))}${row("Sources", (f) => link(f.evidenceUrl || f.website, "Official source") || "No official link available")}${row("Full record", (f) => `<button type="button" class="button button-text" data-action="details" data-id="${f.id}">View fund details ${icon("arrow")}</button>`)}</tbody></table></div>`
        : '<div class="empty-state"><p>No funds selected.</p><button type="button" class="button button-primary" data-action="close-compare">Back to the directory</button></div>'
    }<p class="comparison-note">Amounts may describe different instruments, periods or historical awards. Unknown information is not a zero. Check geography and eligibility at the source.</p>`;
  const nextScroll = $("comparison-content").querySelector(".compare-scroll");
  if (nextScroll) {
    nextScroll.scrollTop = position.top;
    nextScroll.scrollLeft = position.left;
  }
  if (focusAction && !focused.isConnected) {
    const next = $("comparison-content").querySelector(
      `[data-action="${CSS.escape(focusAction)}"]${focusId ? `[data-id="${CSS.escape(focusId)}"]` : ""}`,
    );
    (next || $("comparison-title")).focus({ preventScroll: true });
  }
}
function openComparison() {
  if (selected.length < 2) return;
  renderComparison();
  compareDialog.showModal();
  $("comparison-title").focus({ preventScroll: true });
}
function download(content, type, filename) {
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportSaved() {
  const list = state.profile === "all" ? "all" : state.profile,
    ids = savedIds(saved, list);
  if (!ids.length) {
    notify("Save a fund to start your export.");
    return;
  }
  download(
    favoritesCsv(funds, saved, list, new Date(), matchResults),
    "text/csv;charset=utf-8",
    `saved-funds-${localDate()}.csv`,
  );
  notify(
    `Exported ${ids.length} saved fund${ids.length === 1 ? "" : "s"} with sources and notes.`,
  );
}
function backup() {
  download(
    JSON.stringify(saved, null, 2),
    "application/json",
    `funding-commons-backup-${localDate()}.json`,
  );
  notify("Projects, saved lists and notes exported as a backup.");
}
function clearFilters() {
  setState({
    q: "",
    region: "",
    theme: "",
    access: "",
    reviewed: false,
      depth: "",
    includeIncomplete: true,
    matchGroup: "all",
  });
}

function projectGoal(project) {
  const fmt = (n) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: project.currency,
      maximumFractionDigits: 2,
    }).format(n);
  if (project.goalMin != null && project.goalMax != null)
    return `Total fundraising goal: ${fmt(project.goalMin)}–${fmt(project.goalMax)}`;
  if (project.goalMin != null)
    return `Total fundraising goal: from ${fmt(project.goalMin)}`;
  if (project.goalMax != null)
    return `Total fundraising goal: up to ${fmt(project.goalMax)}`;
  return "Funding goal not specified";
}
function openProject(id = null) {
  editingProject = id;
  const project = saved.projects.find((p) => p.id === id);
  $("project-form").reset();
  $("project-error").hidden = true;
  $("project-dialog-title").textContent = project
    ? "Edit your project"
    : "Tell us about your project";
  for (const key of ["name", "description", "goalMin", "goalMax", "currency"])
    $("project-" + key).value =
      project?.[key] ?? (key === "currency" ? "USD" : "");
  $("project-tags").value = project?.tags.join(", ") || "";
  for (const input of $("project-instruments").querySelectorAll("input"))
    input.checked = project?.fundingInstruments?.includes(input.value) || false;
  for (const key of [
    "applicantBaseCountry",
    "registrationCountry",
    "applicantType",
  ])
    $("project-" + key).value =
      project?.[key] ?? (key === "applicantType" ? "unknown" : "");
  for (const key of ["workCountries", "benefitCountries", "usWorkStates", "usBenefitStates"])
    for (const option of $("project-" + key).options)
      option.selected = project?.[key]?.includes(option.value) || false;
  $("project-eligibility").open = Boolean(project && (
    project.workCountries.length || project.benefitCountries.length || project.applicantBaseCountry ||
    project.registrationCountry || project.applicantType !== "unknown"
  ));
  $("delete-project-button").hidden = !project;
  projectDialog.showModal();
  $("project-name").focus();
}
$("project-select").addEventListener("change", (e) =>
  setState({
    profile: e.target.value,
    sort: saved.projects.some((p) => p.id === e.target.value)
      ? projectSort()
      : "recommended",
  }),
);
$("project-form").addEventListener("input", () => {
  $("project-error").hidden = true;
});
$("project-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const amount = (key) =>
      $("project-" + key).value === ""
        ? null
        : Number($("project-" + key).value);
    const project = normalizeProject({
      id: editingProject || "project-" + crypto.randomUUID(),
      name: $("project-name").value,
      description: $("project-description").value,
      tags: $("project-tags").value,
      currency: $("project-currency").value,
      goalMin: amount("goalMin"),
      goalMax: amount("goalMax"),
      fundingInstruments: [...$("project-instruments").querySelectorAll("input:checked")].map((input) => input.value),
      usWorkStates: [...$("project-usWorkStates").selectedOptions].map((o) => o.value),
      usBenefitStates: [...$("project-usBenefitStates").selectedOptions].map((o) => o.value),
      workCountries: [...$("project-workCountries").selectedOptions].map(
        (o) => o.value,
      ),
      benefitCountries: [...$("project-benefitCountries").selectedOptions].map((o) => o.value),
      applicantBaseCountry: $("project-applicantBaseCountry").value,
      registrationCountry: $("project-registrationCountry").value,
      applicantType: $("project-applicantType").value,
    });
    undoState = structuredClone(saved);
    saved = upsertProject(saved, project);
    const durable = persist();
    projectDialog.close();
    setState({ profile: project.id, sort: projectSort() });
    notify(
      durable
        ? "Project saved in this browser."
        : "Project saved for this session. Export a backup to keep it.",
      true,
    );
    $("project-select").focus();
  } catch (error) {
    $("project-error").textContent = error.message;
    $("project-error").hidden = false;
    $("project-error").focus();
  }
});
function enrichmentDetails(f) {
  const r = f.enrichment;
  if (!r)
    return '<section class="detail-section"><h3>Research not available</h3><p>Check the official source before planning an application.</p></section>';
  const bullets = (items) =>
    items?.length
      ? `<ul>${items.map((t) => `<li>${escape(t)}</li>`).join("")}</ul>`
      : '<p class="description-note">Not established by the reviewed sources.</p>';
  const status = researchStatus(f);
  const reviewed = [
    "program_reviewed",
    "source_reviewed",
    "not_a_funder",
  ].includes(status);
  const followUp = f.followUp
    ? `<details class="quality-details"><summary>Additional policy review · ${escape(f.followUp.checkedOn)}</summary><p>${escape(f.followUp.notes)}</p><p>${f.followUp.remainingGaps.length ? "Still to confirm: " + escape(f.followUp.remainingGaps.map((field) => ({ eligibility: "applicant eligibility", award: "award terms", deadline: "current deadline or timing" })[field]).join(", ")) + "." : "Review the named program conditions and dates before applying."}</p></details>`
    : "";
  const unknownTerms = `<dl class="detail-grid"><div><dt>Applicant eligibility</dt><dd>No program eligibility verified.</dd></div><div><dt>Award range</dt><dd>No current per-award range verified.</dd></div><div><dt>Application deadline</dt><dd>No dated deadline verified. This does not establish rolling intake.</dd></div><div><dt>Next step</dt><dd>${status === "not_a_funder" ? "Review this as a funding resource or service; an external grant route has not been established." : "Check an official program or grantmaking policy before applying."}</dd></div></dl>`;
  return `<section class="detail-section"><h3>${escape(RESEARCH[status])}</h3><p class="description-note">${reviewed ? "Official sources checked" : "Source resolution attempted"} ${escape(r.researchedOn)}. Program coverage is limited to the named streams; a reviewed source does not confirm eligibility or an open call.</p>${(f.sourceWarnings || []).length ? `<div class="source-warning"><strong>Source integrity concern</strong><ul>${f.sourceWarnings.map((w) => `<li>${escape(w.reason)} Affected address: ${escape(w.url)}</li>`).join("")}</ul><p>Links to this source are disabled while the record remains available for review.</p></div>` : ""}${r.researchNotes ? `<p>${escape(r.researchNotes)}</p>` : ""}${followUp}${r.focus.length ? `<h4>Source-backed mission and focus</h4>${bullets(r.focus)}` : ""}${!r.programs.length ? unknownTerms : ""}
  ${r.programs.map((p) => `<article class="program-research" id="program-${escape(p.id)}" tabindex="-1"><h4>${escape(p.name)}</h4><p>${escape(p.instrument)} · ${escape(ACCESS[p.application.route]?.label || p.application.route)}</p><h5>Focus and beneficiaries</h5>${bullets([...p.focus, ...p.beneficiaries])}<h5>Where work and applicants can be based</h5><p>${escape(p.geography.scope || "Geographic eligibility not established.")}</p>${p.geography.workCountries.length ? `<p>Work countries mentioned: ${escape(p.geography.workCountries.join(", "))}</p>` : ""}${p.geography.applicantCountries.length ? `<p>Applicant countries mentioned: ${escape(p.geography.applicantCountries.join(", "))}</p>` : ""}${p.geography.exclusions.length ? bullets(p.geography.exclusions) : ""}<h5>Applicant requirements</h5>${bullets([...p.applicants.types, ...p.applicants.requirements])}<p>Fiscal sponsorship: ${escape({ accepted: "Explicitly accepted", not_accepted: "Explicitly not accepted", unknown: "Not verified" }[p.applicants.fiscalSponsorship])}.</p>${p.applicants.exclusions.length ? `<p><strong>Exclusions</strong></p>${bullets(p.applicants.exclusions)}` : ""}<h5>Award and timing</h5><p><strong>${escape(amountLabel(f, p.award))}</strong></p><p>${escape(p.award.note || "Award size not established.")}</p><p>${escape(p.application.note)}</p>${p.application.opensOn ? `<p>Source opening date: ${escape(p.application.opensOn)}</p>` : ""}${p.application.closesOn ? `<p>Source closing date: ${escape(p.application.closesOn)}${p.application.deadlineInstant ? " · " + escape(p.application.deadlineInstant) : " · exact time not verified"}</p>` : ""}${link(p.application.url, "Application information")}<h5>Supported costs</h5>${bullets(p.costs.supported)}${p.costs.excluded.length ? `<p><strong>Excluded costs</strong></p>${bullets(p.costs.excluded)}` : ""}<h5>Information still to confirm</h5>${bullets(p.unknowns)}<details class="quality-details"><summary>Evidence behind this program</summary><ul>${p.evidence.map((e) => `<li><p>${escape(e.note)}</p>${link(e.url, "Official evidence")} <span class="description-note">Checked ${escape(e.checkedOn)}</span></li>`).join("")}</ul></details></article>`).join("")}
  ${r.evidence.length ? `<details class="quality-details"><summary>Evidence behind the overview</summary><ul>${r.evidence.map((e) => `<li><p>${escape(e.note)}</p>${link(e.url, "Official evidence")} <span class="description-note">Checked ${escape(e.checkedOn)}</span></li>`).join("")}</ul></details>` : ""}
  ${r.sources.length ? `<details class="quality-details"><summary>All reviewed official sources (${r.sources.length})</summary><ul>${r.sources.map((source) => `<li>${link(source.url, source.title)} <span class="description-note">Checked ${escape(source.checkedOn)}</span></li>`).join("")}</ul></details>` : "<p>No official source could be verified in this pass. This record remains available for further research.</p>"}</section>`;
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button,[data-action]");
  if (!target) return;
  const { action, id, view } = target.dataset;
  if (view) {
    setState({ view }, { scroll: true });
    return;
  }
  switch (action) {
    case "deadline-more":
      showAllDeadlines = !showAllDeadlines;
      renderDeadlines();
      break;
    case "deadline-program": {
      openFund(id, true, false, target.dataset.program);
      const section = $("program-" + target.dataset.program);
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "start" });
      break;
    }
    case "fund-section": {
      const section = $(target.dataset.section);
      if (section && fundDialog.contains(section)) {
        section.style.scrollMarginTop = `${fundDialog.querySelector(".dialog-header").offsetHeight + 16}px`;
        section.scrollIntoView({ block: "start" });
        section.focus({ preventScroll: true });
      }
      break;
    }
    case "match-project":
      setState({ sort: projectSort() });
      $("results-title").scrollIntoView({ block: "start" });
      $("results-title").focus({ preventScroll: true });
      break;
    case "enable-ai": {
      const project = saved.projects.find((p) => p.id === state.profile);
      if (!project || !projectText(project).trim()) break;
      if (!modelCatalog) await loadMatchingData();
      if (!modelCatalog) {
        notify(
          "The AI index could not load. Keyword matching is available; try again later.",
        );
        break;
      }
      aiEnabled = true;
      matcher.match(projectText(project), modelCatalog.corpusHash);
      setState({ sort: projectSort() });
      break;
    }
    case "stop-ai":
      aiEnabled = false;
      matcher.cancel();
      break;
    case "new-project":
      openProject();
      break;
    case "edit-project":
      openProject(state.profile);
      break;
    case "close-project":
      projectDialog.close();
      break;
    case "delete-project":
      undoState = structuredClone(saved);
      saved = removeProject(saved, editingProject);
      state.profile = "all";
      persist();
      projectDialog.close();
      render();
      notify("Project removed. Its saved funds were moved to General.", true);
      break;
    case "details":
      openFund(id);
      break;
    case "save":
      removeOrToggle(
        id,
        activeList(),
        state.view === "saved" && state.profile === "all",
      );
      break;
    case "detail-save":
      removeOrToggle(currentFund.id, detailList);
      break;
    case "compare-save":
      removeOrToggle(id, activeList());
      if (compareDialog.open) renderComparison();
      break;
    case "select":
      selectFund(id);
      break;
    case "detail-compare":
      selectFund(currentFund.id);
      break;
    case "compare":
      openComparison();
      break;
    case "clear-compare":
      selected = [];
      render();
      updateDetailCompare();
      break;
    case "close-fund":
      closeFund();
      break;
    case "close-compare":
      compareDialog.close();
      break;
    case "about":
      aboutDialog.showModal();
      $("about-title").focus();
      break;
    case "close-about":
      aboutDialog.close();
      break;
    case "export":
      exportSaved();
      break;
    case "backup":
      backup();
      break;
    case "undo":
      if (undoState) {
        saved = undoState;
        undoState = null;
        persist();
        render();
        updateDetailSave();
        if (compareDialog.open) renderComparison();
        notify("Change undone.");
      }
      break;
    case "check-matches":
      setState({ matchGroup: "check" });
      break;
    case "all-matches":
      setState({ matchGroup: "all" });
      break;
    case "clear-filters":
      clearFilters();
      break;
    case "remove-filter":
      setState({
        [target.dataset.filter]:
          { includeIncomplete: true, reviewed: false, matchGroup: "all" }[
            target.dataset.filter
          ] ?? "",
      });
      break;
    case "explore":
      setState({ view: "explore" });
      break;
    case "load-more": {
      const old = state.limit;
      state.limit += 24;
      render();
      const next = $("results")
        .querySelectorAll(".fund-card")
        [old]?.querySelector(".fund-name button");
      next?.focus({ preventScroll: true });
      break;
    }
    case "more-filters": {
      const open = $("more-filters").hidden;
      $("more-filters").hidden = !open;
      $("more-filter-button").setAttribute("aria-expanded", String(open));
      break;
    }
    case "retry":
      load();
      break;
  }
});
$("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value;
  searchTimer = setTimeout(() => setState({ q }), 120);
});
for (const [id, key] of [
  ["region-filter", "region"],
  ["theme-filter", "theme"],
  ["access-filter", "access"],
  ["sort-select", "sort"],
  ["match-group", "matchGroup"],
  ["research-depth", "depth"],
])
  $(id).addEventListener("change", (e) => setState({ [key]: e.target.value }));
for (const [id, key] of [
  ["reviewed-filter", "reviewed"],
  ["incomplete-filter", "includeIncomplete"],
])
  $(id).addEventListener("change", (e) =>
    setState({ [key]: e.target.checked }),
  );
fundDialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeFund();
});
for (const dialog of [fundDialog, compareDialog, aboutDialog, projectDialog])
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    ) {
      dialog === fundDialog ? closeFund() : dialog.close();
    }
  });
window.addEventListener("popstate", () => {
  const next = collectState(),
    same = Object.keys(baseState)
      .filter((k) => k !== "limit")
      .every((k) => next[k] === state[k]);
  if (!same) {
    state = next;
    syncControls();
    render();
  }
  const fund = new URLSearchParams(location.search).get("fund");
  if (fund) {
    const programId = new URLSearchParams(location.search).get("program");
    if (!fundDialog.open || currentFund?.id !== fund || (programId && currentFund?.displayProgramId !== programId)) openFund(fund, false, false, programId);
  } else if (fundDialog.open) closeFund(true);
});
window.addEventListener("storage", (e) => {
  if (e.key !== STORAGE_KEY) return;
  try {
    saved = readSaved(e.newValue);
    storageReadable = true;
    render();
    updateDetailSave();
    if (compareDialog.open) renderComparison();
    announce("Saved lists updated from another tab.");
  } catch {
    storageWarning(
      "Another tab contains saved data that could not be read. Your current lists are still available.",
    );
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    $("search-input").focus();
  }
});
$("import-backup").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const incoming = readSaved(await file.text());
    undoState = structuredClone(saved);
    saved = mergeSaved(saved, incoming);
    storageReadable = true;
    persist();
    render();
    notify("Backup merged with your saved lists.", true);
  } catch {
    notify(
      "That file is not a valid Funding Commons backup. Your lists have not changed.",
    );
  }
  e.target.value = "";
});
async function load() {
  $("results").setAttribute("aria-busy", "true");
  try {
    const response = await fetch("./data/funders.json");
    if (!response.ok)
      throw new Error(`Data request failed: ${response.status}`);
    const data = await response.json();
    if (
      data.schemaVersion !== 2 ||
      !Array.isArray(data.funds) ||
      data.funds.length !== data.recordCount ||
      new Set(data.funds.map((f) => f.id)).size !== data.recordCount
    )
      throw new Error("The directory snapshot is incomplete.");
    snapshot = data;
    funds = data.funds;
    blockedSourceHosts = new Set(
      funds
        .flatMap((f) => f.sourceWarnings || [])
        .map((w) => new URL(w.url).hostname.replace(/^www\./, "")),
    );
    lexicalIndex = createLexicalIndex(funds);
    $("research-count").textContent = data.reviewedCount;
    $("program-review-count").textContent =
      data.researchCounts?.program_reviewed ?? 0;
    $("research-note").textContent =
      `All ${data.funds.length} records have a research disposition: ${data.researchCounts?.program_reviewed || 0} with program terms and ${data.researchCounts?.source_reviewed || 0} with official overviews. Unresolved and unavailable sources remain visible.`;
    $("research-label-help").textContent =
      `Research depth: ${data.researchCounts?.program_reviewed || 0} program reviews, ${data.researchCounts?.source_reviewed || 0} official overviews, ${data.researchCounts?.not_a_funder || 0} other resources, and ${(data.researchCounts?.unresolved || 0) + (data.researchCounts?.unreachable || 0)} unresolved or unavailable sources. A checked overview does not establish eligibility, award size or a deadline.`;
    if (data.followUpSummary) {
      const followUp = data.followUpSummary;
      $("followup-note").hidden = false;
      $("followup-download").hidden = false;
      $("followup-note").textContent =
        `The latest policy follow-up covered ${followUp.targetCount} overview-only or unresolved records, adding ${followUp.programReviewsAdded} program review${followUp.programReviewsAdded === 1 ? "" : "s"} and recovering ${followUp.sourcesRecovered} previously unresolved or unavailable sources. Across the directory, ${data.fieldCoverage.upcomingDatedDeadline} records have a dated upcoming deadline in the researched intake as of ${(data.compiledAt || data.researchCheckedOn).slice(0, 10)}. Rolling intake and closed calls are recorded separately.`;
    }
    const history = (data.followUpHistory || []).filter((pass) =>
      /^\.\/data\/research-followup-round-\d+\.json$/.test(pass.reportUrl),
    );
    $("followup-history").hidden = !history.length;
    $("followup-history-links").replaceChildren(
      ...history.map((pass, index) => {
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = pass.reportUrl;
        anchor.download = `funding-commons-policy-followup-round-${index + 1}.json`;
        anchor.textContent = `Policy review ${index + 1} · ${pass.checkedOn} · ${pass.targetCount} records`;
        item.append(anchor);
        return item;
      }),
    );
    byId = new Map(funds.map((f) => [f.id, f]));
    const regions = [...new Set(funds.flatMap((f) => f.regions))].sort(),
      themes = [...new Set(funds.flatMap((f) => f.sectors))].sort();
    $("region-filter").innerHTML =
      '<option value="">All regions</option>' +
      regions.map((r) => `<option>${escape(r)}</option>`).join("");
    $("theme-filter").innerHTML =
      '<option value="">All themes</option>' +
      themes
        .map(
          (t) =>
            `<option value="${escape(t)}">${escape(shortTheme(t))}</option>`,
        )
        .join("");
    state = collectState();
    if (!regions.includes(state.region)) state.region = "";
    if (!themes.includes(state.theme)) state.theme = "";
    syncControls();
    updateUrl();
    render();
    loadMatchingData();
    const id = new URLSearchParams(location.search).get("fund");
    if (id) openFund(id, false, false, new URLSearchParams(location.search).get("program"));
  } catch (error) {
    $("result-count").textContent = "Directory unavailable";
    $("results").setAttribute("aria-busy", "false");
    $("results").innerHTML =
      `<div class="error-state"><h4>The directory couldn’t load.</h4><p>Your saved lists are still in this browser. Please try loading the research snapshot again.</p><button type="button" class="button button-primary" data-action="retry">Try again ${icon("arrow")}</button></div>`;
  }
}
async function loadMatchingData() {
  const read = async (path) => {
    const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Matching metadata unavailable.");
    return response.json();
  };
  const results = await Promise.allSettled([
    read("./data/eligibility-rules.json"),
    read("./data/fund-vectors.json"),
    read("./data/program-conditions.json"),
  ]);
  if (results[0].status === "fulfilled") {
    const data = results[0].value;
    if (
      data.version === 1 &&
      Array.isArray(data.rules) &&
      data.rules.every(
        (r) =>
          byId.has(r.fundId) &&
          [
            "workCountries",
            "benefitCountries",
            "applicantBaseCountry",
            "registrationCountry",
            "applicantType", "usWorkStates", "usBenefitStates",
          ].includes(r.field) &&
          (r.kind == null || ["prerequisite", "priority"].includes(r.kind)) &&
          ["only", "exclude"].includes(r.operator) &&
          Array.isArray(r.values) &&
          r.values.length &&
          /^\d{4}-\d{2}-\d{2}$/.test(r.checkedOn) &&
          safeUrl(r.sourceUrl),
      )
    ) {
      eligibilityRules = data.rules;
      eligibilityAvailable = true;
      $("screening-coverage").textContent =
        `${data.rules.length} executable checks cover ${new Set(data.rules.map((r) => r.fundId + ":" + r.programId)).size} programs; other documented requirements remain manual.`;
    }
  }
  if (results[2].status === "fulfilled" && validConditions(results[2].value, funds)) {
    programConditions = results[2].value.conditions;
    conditionsAvailable = true;
  }
  $("screening-coverage").textContent = `${eligibilityRules.length} country/applicant checks and ${programConditions.length} sourced programme conditions. Coverage is partial; other requirements need manual review.`;
  if (results[1].status === "fulfilled") {
    try {
      const catalog = results[1].value;
      const documents = corpusDocuments(funds);
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          model: MODEL,
          texts: documents,
        }),
      );
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (
        hash === catalog.corpusHash &&
        catalog.ids?.length === documents.length &&
        catalog.ids.every((id, i) => id === documents[i].id)
      )
        modelCatalog = catalog;
    } catch {
      modelCatalog = null;
    }
  }
  if (snapshot) render();
}
window.addEventListener("pagehide", () => matcher.cancel());
load();

// Condition answers never leave local project storage or enter model text.
document.addEventListener("change", (event) => {
  const target = event.target.closest("[data-condition-key]");
  if (!target || !["", "yes", "no"].includes(target.value)) return;
  const project = saved.projects.find((p) => p.id === state.profile);
  const condition = programConditions.find((c) => `${c.fundId}::${c.programId}::${c.id}` === target.dataset.conditionKey);
  if (!project || !condition || target.dataset.sourceDate !== condition.checkedOn) return;
  const programAnswers = { ...project.programAnswers };
  if (target.value) programAnswers[target.dataset.conditionKey] = { answer: target.value, sourceCheckedOn: condition.checkedOn };
  else delete programAnswers[target.dataset.conditionKey];
  saved = upsertProject(saved, { ...project, programAnswers });
  const durable = persist();
  render();
  if (!durable) notify("Answer saved for this session. Download a backup to keep it.");
});
