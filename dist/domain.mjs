import { listOptions, savedIds } from "./storage.mjs";
export {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  emptySaved,
  readSaved,
  savedIds,
  toggleSaved,
  listOptions,
  normalizeProject,
  upsertProject,
  removeProject,
  mergeSaved,
} from "./storage.mjs";
export const ACCESS = {
  open: { label: "Open call", tone: "green" },
  rolling: { label: "Rolling applications", tone: "green" },
  inquiry: { label: "Inquiry route", tone: "amber" },
  relationship: { label: "By relationship", tone: "purple" },
  restricted: { label: "Partner call", tone: "amber" },
  future: { label: "Future cycle", tone: "neutral" },
  closed: { label: "Intake closed", tone: "neutral" },
  unverified: { label: "Access unverified", tone: "neutral" },
  unconfirmed: { label: "Intake unconfirmed", tone: "neutral" },
  directory: { label: "Directory registration", tone: "purple" },
  mismatch: { label: "Outside project area", tone: "neutral" },
  conflicting: { label: "Needs confirmation", tone: "amber" },
};
export const RESEARCH = {
  program_reviewed: "Program terms reviewed",
  source_reviewed: "Official overview checked",
  unresolved: "Identity unresolved",
  unreachable: "Source unavailable",
  not_a_funder: "Other funding resource",
};
export const researchStatus = (fund) =>
  fund.enrichment?.reviewStatus ||
  (fund.enrichment
    ? "program_reviewed"
    : fund.verifiedOn
      ? "source_reviewed"
      : "unresolved");
export const fold = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function safeFundUrl(fund, value) {
  const safe = safeUrl(value);
  if (!safe) return "";
  const host = new URL(safe).hostname.replace(/^www\./, "");
  return (fund.sourceWarnings || fund.enrichment?.sourceWarnings || []).some(
    (w) => new URL(w.url).hostname.replace(/^www\./, "") === host,
  )
    ? ""
    : safe;
}
export function effectiveAccess(fund, now = new Date()) {
  if (["open", "restricted", "inquiry", "rolling"].includes(fund.access)) {
    if (fund.openingDate && localDate(now) < fund.openingDate) return "future";
    if (
      fund.deadlineInstant &&
      now.getTime() > Date.parse(fund.deadlineInstant)
    )
      return "closed";
    if (
      !fund.deadlineInstant &&
      fund.deadlineDate &&
      localDate(now) > fund.deadlineDate
    )
      return "closed";
  }
  return fund.access;
}
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function applicationTiming(fund, now = new Date()) {
  const deadline = fund.deadlineInstant || fund.deadlineDate;
  return [
    deadline && effectiveAccess(fund, now) === "closed" ? "Cycle ended." : "",
    deadline
      ? `Source deadline: ${deadline}${fund.deadlineInstant ? "" : " (exact time unverified)"}.`
      : "",
    fund.timing,
  ]
    .filter(Boolean)
    .join(" ");
}
export function accessGroup(access) {
  if (["open", "rolling"].includes(access)) return "available";
  if (access === "inquiry") return "inquiry";
  if (["relationship", "restricted", "directory"].includes(access))
    return "relationship";
  if (["future", "closed"].includes(access)) return "future";
  return "unverified";
}
export function filterFunds(funds, state, savedIds = [], now = new Date()) {
  const words = fold(state.q || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
    saved = new Set(savedIds);
  return funds.filter((f) => {
    if (state.view === "saved" && !saved.has(f.id)) return false;
    if (state.includeIncomplete === false && f.fieldsFilled <= 2) return false;
    if (state.region && !f.regions.includes(state.region)) return false;
    if (state.theme && !f.sectors.includes(state.theme)) return false;
    if (state.access && accessGroup(effectiveAccess(f, now)) !== state.access)
      return false;
    if (state.reviewed && !f.verifiedOn) return false;
    const depth = researchStatus(f);
    if (
      state.depth &&
      (state.depth === "needs_research"
        ? !["unresolved", "unreachable"].includes(depth)
        : depth !== state.depth)
    )
      return false;
    const hay = fold(
      [
        f.name,
        f.displayName,
        f.program,
        f.description,
        ...f.sectors,
        ...f.regions,
        ...f.approaches,
        ...(f.enrichment?.focus || []),
        ...(f.enrichment?.themes || []),
        ...(f.enrichment?.programs || []).flatMap((p) => [
          p.name,
          ...p.focus,
          ...p.beneficiaries,
          p.geography.scope,
          ...p.geography.workCountries,
          ...p.applicants.requirements,
          ...p.applicants.exclusions,
        ]),
      ].join(" "),
    );
    return words.every((w) => hay.includes(w));
  });
}
// Orders that rank funds for a project: next-step priority and thematic fit.
export const PROJECT_SORTS = ["match", "fit"];
// Project identity stays off shared URLs, so a URL without `profile` keeps the
// current list. Resolve that list first: project-fit sorting needs a project.
export function profileAndSortFromUrl(params, saved, currentProfile) {
  let profile = listOptions(saved).some((l) => l.id === params.get("profile"))
    ? params.get("profile")
    : "all";
  if (!params.has("profile") && Object.hasOwn(saved.lists, currentProfile))
    profile = currentProfile;
  let sort = [...PROJECT_SORTS, "recommended", "name", "deadline"].includes(
    params.get("sort"),
  )
    ? params.get("sort")
    : "recommended";
  if (PROJECT_SORTS.includes(sort) && !saved.projects.some((p) => p.id === profile))
    sort = "recommended";
  return { profile, sort };
}
export function sortFunds(funds, sort = "recommended", now = new Date()) {
  const accessOrder = {
    open: 0,
    rolling: 1,
    inquiry: 2,
    restricted: 3,
    relationship: 4,
    directory: 5,
    future: 6,
    unconfirmed: 7,
    conflicting: 7,
    closed: 8,
    mismatch: 9,
    unverified: 10,
  };
  return [...funds].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "deadline") {
      const date = (f) =>
        ["open", "restricted", "inquiry", "rolling"].includes(
          effectiveAccess(f, now),
        ) && f.deadlineDate
          ? Date.parse(f.deadlineDate)
          : Infinity;
      const delta = date(a) - date(b);
      if (Number.isFinite(delta) && delta !== 0) return delta;
      if (date(a) !== date(b)) return date(a) < date(b) ? -1 : 1;
    }
    const delta =
      (accessOrder[effectiveAccess(a, now)] ?? 10) -
      (accessOrder[effectiveAccess(b, now)] ?? 10);
    return delta || a.name.localeCompare(b.name);
  });
}
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
export function favoritesCsv(
  funds,
  saved,
  list = "all",
  now = new Date(),
  matches = new Map(),
) {
  const byId = new Map(funds.map((f) => [f.id, f]));
  const headers = [
    "Funder",
    "Program",
    "Saved lists",
    "Description",
    "Themes",
    "Regions (directory tags)",
    "Access",
    "Access detail",
    "Award / term",
    "Deadline / timing",
    "Deadline date",
    "Exact deadline (UTC)",
    "Listed website",
    "Evidence URL",
    "Verified on",
    "Eligibility to confirm",
    "Next action",
    "Notes",
    "Source record ID",
    "Source URL",
    "Matching method",
    "Shared topics",
    "Program eligibility screen",
    "Eligibility evidence",
    "Research depth",
    "All official sources",
    "Program terms and deadlines",
    "Source integrity concerns",
    "Project match rank", "Research priority (0-100)", "Purpose points (0-70)",
    "Geography points (0-10)", "Access points (0-15)", "Award points (0-5)",
    "Score limits", "Programme condition answers (self-reported)",
    "Thematic fit (0-100)", "Thematic fit label", "Readiness", "Scoring version",
  ];
  const rows = savedIds(saved, list).map((id) => {
    const f = matches.get(id)?.fund || byId.get(id),
      lists = listOptions(saved)
        .filter((l) => saved.lists[l.id].includes(id))
        .map((l) => l.name)
        .join("; ");
    if (!f) {
      const row = Array(headers.length).fill("");
      row[0] = `Unavailable record: ${id}`;
      row[2] = lists;
      row[3] = "Record no longer present in this snapshot";
      row[6] = "Unavailable";
      row[17] = saved.notes[id] || "";
      row[18] = id;
      return row;
    }
    const programs = f.enrichment?.programs || [];
    const match = matches.get(f.id);
    const selectedPrograms = match?.program ? [match.program] : programs;
    return [
      f.name,
      f.program,
      lists,
      f.description,
      f.sectors.join("; "),
      f.regions.join("; "),
      ACCESS[effectiveAccess(f, now)].label,
      f.accessDetail,
      f.amount,
      applicationTiming(f, now),
      f.deadlineDate,
      f.deadlineInstant,
      safeFundUrl(f, f.website),
      safeFundUrl(f, f.evidenceUrl),
      f.verifiedOn,
      selectedPrograms
        .flatMap((p) => [
          ...p.applicants.requirements,
          ...p.applicants.exclusions,
        ])
        .join(" | "),
      selectedPrograms.map((p) => p.application.note).join(" | "),
      saved.notes[id] || "",
      f.id,
      safeUrl(f.sourceUrl),
      match?.method || "No active project",
      match?.shared.join("; ") || "",
      match
        ? match.eligibility.status === "conflict"
          ? "Known conflict in researched program; review source"
          : "Needs confirmation; no eligibility approval"
        : "Not assessed",
      match?.eligibility.programs
        .flatMap((p) =>
          p.checks.map(
            (c) => `${c.outcome}: ${c.reason} ${safeUrl(c.sourceUrl)}`,
          ),
        )
        .join(" | ") || "",
      RESEARCH[researchStatus(f)],
      (f.enrichment?.sources || [])
        .map((s) => safeFundUrl(f, s.url))
        .filter(Boolean)
        .join(" | "),
      programs
        .map(
          (p) =>
            `${p.name}: ${p.award.note || "See numeric award fields in full record"}; ${p.application.note}; ${p.application.closesOn ? "Source deadline: " + p.application.closesOn : "No dated deadline verified"}; ${safeFundUrl(f, p.application.url)}`,
        )
        .join(" | "),
      (f.sourceWarnings || []).map((w) => w.reason).join(" | "),
      match?.rank ?? "", match?.score ?? "", match?.breakdown?.topics ?? "",
      match?.breakdown?.geography ?? "", match?.breakdown?.access ?? "", match?.breakdown?.award ?? "",
      match?.limits?.map((l) => `Maximum ${l.maximum}: ${l.reason}`).join(" | ") || "",
      match?.eligibility.programs.flatMap((p) => p.checks.filter((c) => c.field === "condition").map((c) => `${c.requirement}: ${c.answer || "unknown"}; ${safeUrl(c.sourceUrl)}; checked ${c.checkedOn}`)).join(" | ") || "",
      match?.thematicFit?.score ?? "", match?.thematicFit?.label || "", match?.readiness?.label || "", match?.thematicFit?.version || "",
    ];
  });
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
