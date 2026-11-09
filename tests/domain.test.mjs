import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ACCESS,
  fold,
  safeUrl,
  safeFundUrl,
  effectiveAccess,
  applicationTiming,
  filterFunds,
  sortFunds,
  profileAndSortFromUrl,
  emptySaved,
  readSaved,
  savedIds,
  toggleSaved,
  csvCell,
  favoritesCsv,
  listOptions,
  normalizeProject,
  upsertProject,
  removeProject,
  mergeSaved,
} from "../dist/domain.mjs";
const data = JSON.parse(
  fs.readFileSync(
    new URL("../dist/data/funders.json", import.meta.url),
    "utf8",
  ),
);
const funds = data.funds,
  now = new Date("2026-10-14T19:00:00Z");
const mit = funds.find((f) => f.displayName === "MIT Solve"),
  mellon = funds.find((f) => f.displayName === "Mellon Foundation");
const state = {
  q: "",
  region: "",
  theme: "",
  access: "",
  profile: "all",
  view: "explore",
  includeIncomplete: true,
};

test("snapshot retains all 593 original records plus 106 funders, research dispositions and original30 pilot funds", () => {
  assert.equal(funds.length, 699);
  assert.equal(new Set(funds.map((f) => f.id)).size, 699);
  assert.equal(funds.filter((f) => f.verifiedOn).length, data.reviewedCount);
  assert.equal(funds.filter((f) => f.enrichment).length, 699);
  assert.equal(funds.filter((f) => f.isPilot).length, 30);
  assert.equal(
    Object.values(data.researchCounts).reduce((a, b) => a + b, 0),
    699,
  );
  for (const f of funds) {
    assert.ok(ACCESS[f.access], f.name);
    assert.ok(f.description);
    assert.equal(f.matches, undefined);
  }
});
test("every source record can be reached without a profile or filter", () => {
  assert.equal(filterFunds(funds, state, [], now).length, 699);
  assert.equal(sortFunds(funds, "name")[0].displayName, "75inQ");
});
test("search is accent insensitive and can find relevant project locations", () => {
  assert.equal(fold("Fundação Árvore"), "fundacao arvore");
  assert.ok(
    filterFunds(funds, { ...state, q: "fundacao lemann" }, [], now).some(
      (f) => f.name === "Fundação Lemann",
    ),
  );
  assert.ok(
    filterFunds(funds, { ...state, q: "Nigeria" }, [], now).some(
      (f) => f.displayName === "Wikimedia Foundation",
    ),
  );
  assert.deepEqual(
    filterFunds(funds, { ...state, q: "xyz-no-such-funder" }, [], now),
    [],
  );
});
test("filters combine region, theme and research status", () => {
  const out = filterFunds(
    funds,
    {
      ...state,
      region: "Africa",
      theme: "Climate & environment",
      reviewed: true,
    },
    [],
    now,
  );
  assert.ok(out.length > 0);
  assert.ok(
    out.every(
      (f) =>
        f.regions.includes("Africa") &&
        f.sectors.includes("Climate & environment") &&
        f.verifiedOn,
    ),
  );
});
test("project selection organizes shortlists without excluding any source record", () => {
  const project = normalizeProject({
    id: "community-garden",
    name: "Community garden",
    description: "Food and skills",
    tags: ["food"],
  });
  assert.equal(
    filterFunds(funds, { ...state, profile: project.id }, [], now).length,
    699,
  );
  assert.equal(
    filterFunds(funds, { ...state, profile: "green-goods" }, [], now).length,
    699,
  );
});
test("dated calls expire without inventing future cycles", () => {
  assert.equal(effectiveAccess(mit, now), "open");
  assert.equal(mit.deadlineInstant, "2026-11-06T17:00:00Z");
  assert.equal(effectiveAccess(mit, new Date("2026-11-06T16:59:59Z")), "open");
  assert.equal(
    effectiveAccess(mit, new Date("2026-11-06T17:00:01Z")),
    "closed",
  );
  assert.equal(effectiveAccess(mellon, new Date("2028-01-01")), "inquiry");
  const sorted = sortFunds([mellon, mit], "deadline", now);
  assert.equal(sorted[0].id, mit.id);
});
test("application deadlines remain explicit when the source note describes project completion", () => {
  const f = {
    access: "open",
    deadlineDate: "2026-11-30",
    deadlineInstant: null,
    timing: "Projects due June 15, 2027.",
  };
  assert.match(
    applicationTiming(f, new Date("2026-10-15")),
    /Source deadline: 2026-11-30 \(exact time unverified\)/,
  );
  assert.match(applicationTiming(f, new Date("2026-12-01T12:00:00Z")), /^Cycle ended\./);
  assert.match(
    applicationTiming(f, new Date("2026-10-15")),
    /Projects due June 15, 2027/,
  );
});
test("existing country-restriction evidence remains visible without a hardcoded project exclusion", () => {
  const f = funds.find((f) => f.displayName === "Wikimedia Foundation");
  assert.match(JSON.stringify(f.enrichment.programs), /Nigeria/);
  assert.equal(
    filterFunds(funds, { ...state, profile: "any-project" }, [], now).length,
    699,
  );
});

test("source integrity concerns suppress affected links without removing records or export notes", () => {
  const affected = funds.find((f) => f.sourceWarnings?.length);
  assert.ok(affected);
  const warning = affected.sourceWarnings[0];
  assert.equal(safeFundUrl(affected, warning.url), "");
  assert.equal(
    safeFundUrl(affected, "https://example.org/independent-source"),
    "https://example.org/independent-source",
  );
  const saved = toggleSaved(emptySaved(), affected.id, "general");
  const csv = favoritesCsv(funds, saved);
  assert.ok(csv.includes(warning.reason));
  assert.equal(csv.includes(warning.url), false);
  assert.ok(csv.includes(affected.id));
});

test("expanded CSV keeps unavailable IDs aligned with its extended score header", () => {
  const saved = emptySaved();
  saved.lists.general = ["missing-record"];
  saved.notes["missing-record"] = "Retain note";
  const [header, row] = favoritesCsv(funds, saved)
    .trim()
    .split("\r\n")
    .map((line) => line.split(","));
  assert.equal(header.length, 40);
  assert.equal(row.length, header.length);
  assert.equal(header[18], "Source record ID");
  assert.equal(row[18], "missing-record");
  assert.equal(row[17], "Retain note");
});
test("favorites use stable IDs, separate lists and deduplicate the combined view", () => {
  let saved = upsertProject(emptySaved(), {
    id: "community-garden",
    name: "Community garden",
  });
  saved = toggleSaved(saved, mit.id, "general");
  saved = toggleSaved(saved, mit.id, "community-garden");
  assert.equal(savedIds(saved).length, 1);
  assert.equal(savedIds(saved, "community-garden").length, 1);
  saved = toggleSaved(saved, mit.id, "general");
  assert.equal(savedIds(saved).length, 1);
  saved = toggleSaved(saved, mit.id, "community-garden");
  assert.equal(savedIds(saved).length, 0);
});
test("storage round-trip preserves notes and IDs missing from a later snapshot", () => {
  const saved = emptySaved();
  saved.lists.general = ["missing-id", mit.id, mit.id];
  saved.notes[mit.id] = "Ask about the pilot.";
  const parsed = readSaved(JSON.stringify(saved));
  assert.deepEqual(parsed.lists.general, ["missing-id", mit.id]);
  assert.equal(parsed.notes[mit.id], "Ask about the pilot.");
  assert.throws(() => readSaved("{bad"));
  assert.throws(() => readSaved('{"version":2}'));
  assert.throws(() => readSaved('{"version":1,"lists":{},"notes":{}}'));
});
test("saved filters do not define the export scope", () => {
  let saved = toggleSaved(emptySaved(), mit.id, "general");
  saved = toggleSaved(saved, mellon.id, "general");
  assert.equal(
    filterFunds(
      funds,
      { ...state, view: "saved", q: "Mellon" },
      savedIds(saved),
      now,
    ).length,
    1,
  );
  const csv = favoritesCsv(funds, saved, "all", now);
  assert.ok(csv.includes("MIT Solve"));
  assert.ok(csv.includes("Andrew W. Mellon Foundation"));
  assert.equal(csv.split("\r\n").length, 4);
});
test("CSV escapes Unicode, commas, quotes, newlines and spreadsheet formula text", () => {
  assert.equal(csvCell('Yorùbá, "heritage"'), '"Yorùbá, ""heritage"""');
  assert.equal(csvCell("first\nsecond"), '"first\nsecond"');
  for (const text of ["=1+1", " +SUM(A1)", "-1", "@cmd", "\ttext", "\rtext"])
    assert.ok(csvCell(text).includes("'"));
  assert.equal(csvCell(50000), "50000");
  let saved = toggleSaved(emptySaved(), mit.id);
  saved.notes[mit.id] = '=HYPERLINK("bad")';
  const csv = favoritesCsv(funds, saved, "all", now);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes("'=HYPERLINK"));
});
test("unavailable saved records remain present in exports", () => {
  const saved = emptySaved();
  saved.lists.general = ["no-longer-listed"];
  assert.ok(
    favoritesCsv(funds, saved).includes("Unavailable record: no-longer-listed"),
  );
});
test("external links reject executable and local schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "not a url",
  ])
    assert.equal(safeUrl(url), "");
  assert.equal(safeUrl("https://example.org/fund"), "https://example.org/fund");
});

test("new visitors have no organization-specific profiles", () => {
  const s = emptySaved();
  assert.equal(s.version, 2);
  assert.deepEqual(s.projects, []);
  assert.deepEqual(listOptions(s), [{ id: "general", name: "General" }]);
});
test("v1 migration preserves all lists, missing records, deduplicated IDs and notes", () => {
  const old = {
    version: 1,
    lists: {
      general: [mit.id],
      "green-goods": [mit.id, "missing"],
      "tech-and-sun": [],
      "omo-yoruba": [mellon.id],
    },
    notes: { missing: "Retain this note", [mit.id]: "Useful" },
  };
  const migrated = readSaved(JSON.stringify(old));
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.lists, old.lists);
  assert.deepEqual(migrated.notes, old.notes);
  assert.deepEqual(
    migrated.projects.map((p) => p.name),
    ["Green Goods", "Tech and Sun", "Omo Yoruba"],
  );
  assert.deepEqual(readSaved(JSON.stringify(migrated)), migrated);
});
test("project validation accepts Unicode and rejects invalid funding ranges and currencies", () => {
  const p = normalizeProject({
    id: "garden-1",
    name: "Jardim Àṣẹ",
    description: "Community restoration",
    tags: "food, youth, food",
    goalMin: 10000,
    goalMax: 50000,
    currency: "brl",
  });
  assert.equal(p.currency, "BRL");
  assert.deepEqual(p.tags, ["food", "youth"]);
  for (const change of [
    { name: " " },
    { goalMin: -1 },
    { goalMin: 60000 },
    { goalMax: Infinity },
    { currency: "ZZZ" },
    { id: "__proto__" },
  ])
    assert.throws(() => normalizeProject({ ...p, ...change }));
});
test("editing project context preserves funds; removing a project moves them to General", () => {
  let s = upsertProject(emptySaved(), { id: "garden-1", name: "Garden" });
  s = toggleSaved(s, mit.id, "garden-1");
  s.notes[mit.id] = "Keep";
  s = upsertProject(s, {
    ...s.projects[0],
    name: "New garden",
    description: "New context",
  });
  assert.deepEqual(s.lists["garden-1"], [mit.id]);
  assert.equal(s.projects.length, 1);
  const removed = removeProject(s, "garden-1");
  assert.deepEqual(removed.lists.general, [mit.id]);
  assert.equal(removed.notes[mit.id], "Keep");
  assert.equal(removed.projects.length, 0);
});
test("backup merge restores arbitrary projects, legacy lists and unknown fund IDs", () => {
  let s = upsertProject(emptySaved(), { id: "garden-1", name: "Existing" });
  s = toggleSaved(s, mit.id, "garden-1");
  const incoming = upsertProject(emptySaved(), {
    id: "garden-2",
    name: "Another",
  });
  incoming.lists["garden-2"] = ["unavailable"];
  const merged = mergeSaved(s, incoming);
  assert.equal(merged.projects.length, 2);
  assert.deepEqual(merged.lists["garden-2"], ["unavailable"]);
  assert.deepEqual(mergeSaved(merged, incoming), merged);
  const bad = structuredClone(merged);
  bad.lists.orphan = [];
  assert.throws(() => readSaved(JSON.stringify(bad)));
});

test("research depth filters preserve an unfiltered 699-record catalog while ignoring the retired pilot filter", () => {
  assert.equal(filterFunds(funds, {}).length, 699);
  assert.equal(filterFunds(funds, { pilot: true }).length, 699);
  const terms = filterFunds(funds, { depth: "program_reviewed" });
  assert.ok(terms.length > 30);
  assert.ok(
    terms.every((f) => f.enrichment.reviewStatus === "program_reviewed"),
  );
  const unresolved = filterFunds(funds, { depth: "needs_research" });
  assert.ok(
    unresolved.every((f) =>
      ["unresolved", "unreachable"].includes(f.enrichment.reviewStatus),
    ),
  );
});
test("dated expressions of interest expire like dated open applications", () => {
  const f = {
    access: "inquiry",
    deadlineDate: "2026-10-30",
    deadlineInstant: null,
  };
  assert.equal(effectiveAccess(f, new Date("2026-10-30T12:00:00Z")), "inquiry");
  assert.equal(effectiveAccess(f, new Date("2026-10-31T12:00:00Z")), "closed");
});

test("open-or-rolling excludes inquiries; inquiry routes have their own filter", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  const f = funds[0];
  const cases = ["open", "rolling", "inquiry", "relationship"].map((access) => ({ ...f, id: access, access, openingDate: null, deadlineDate: null, deadlineInstant: null }));
  assert.deepEqual(filterFunds(cases, { access: "available" }, [], today).map((f) => f.id), ["open", "rolling"]);
  assert.deepEqual(filterFunds(cases, { access: "inquiry" }, [], today).map((f) => f.id), ["inquiry"]);
  assert.equal(effectiveAccess({ access: "open", openingDate: "2026-11-01" }, today), "future");
});

test("CSV carries the matched program's terms while retaining all programs in the research column", () => {
  const fund = structuredClone(funds.find((f) => f.enrichment.programs.length > 1));
  const chosen = structuredClone(fund.enrichment.programs[1]);
  chosen.name = "Chosen program";
  chosen.applicants.requirements = ["Chosen applicant condition"];
  chosen.applicants.exclusions = [];
  chosen.application.note = "Chosen next action";
  const view = { ...fund, program: chosen.name, amount: "Chosen award", accessDetail: chosen.application.note, deadlineDate: "2026-11-02" };
  const match = { fund: view, program: chosen, method: "baseline", shared: [], rank: 4, score: 38, breakdown: { topics: 27, geography: 2, access: 8, award: 1 }, limits: [], eligibility: { status: "needs_confirmation", programs: [] } };
  const saved = toggleSaved(emptySaved(), fund.id, "general");
  const csv = favoritesCsv([fund], saved, "general", new Date("2026-10-16T12:00:00Z"), new Map([[fund.id, match]]));
  assert.ok(csv.includes("Chosen program"));
  assert.ok(csv.includes("Chosen award"));
  assert.ok(csv.includes("Research priority (0-100)"));
  assert.ok(csv.includes(",4,38,27,2,8,1,"));
  assert.ok(csv.includes("Chosen applicant condition,Chosen next action"));
  assert.ok(csv.includes(fund.enrichment.programs[0].name));
});

test("closing fund details keeps the selected project's fit ranking", () => {
  // Closing details returns to a URL with sort=match but, by design, no project ID.
  const saved = upsertProject(emptySaved(), { id: "garden-1", name: "Garden" });
  assert.deepEqual(
    profileAndSortFromUrl(new URLSearchParams("?sort=match"), saved, "garden-1"),
    { profile: "garden-1", sort: "match" },
  );
});

test("project-fit sorting from a URL needs a current or named project", () => {
  const saved = upsertProject(emptySaved(), { id: "garden-1", name: "Garden" });
  const fit = new URLSearchParams("?sort=match");
  // A fresh visit has no current project; General is a list, not a project;
  // a project removed elsewhere no longer exists.
  assert.deepEqual(profileAndSortFromUrl(fit, saved, "all"), { profile: "all", sort: "recommended" });
  assert.deepEqual(profileAndSortFromUrl(fit, saved, "general"), { profile: "general", sort: "recommended" });
  assert.deepEqual(profileAndSortFromUrl(fit, saved, "deleted-1"), { profile: "all", sort: "recommended" });
  // A legacy URL that names a list wins; unknown sorts fall back to access order.
  assert.deepEqual(
    profileAndSortFromUrl(new URLSearchParams("?profile=general&sort=name"), saved, "garden-1"),
    { profile: "general", sort: "name" },
  );
  assert.deepEqual(
    profileAndSortFromUrl(new URLSearchParams("?sort=popular"), saved, "garden-1"),
    { profile: "garden-1", sort: "recommended" },
  );
});
