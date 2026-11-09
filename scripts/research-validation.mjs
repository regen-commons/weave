import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
export function validateSchema(value, schema, path = "$") {
  const fail = (message) => {
    throw new Error(`${path}: ${message}`);
  };
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (
    schema.type &&
    !(Array.isArray(schema.type) ? schema.type : [schema.type]).includes(type)
  )
    fail(`expected ${schema.type}, received ${type}`);
  if (schema.enum && !schema.enum.includes(value)) fail("unknown enum value");
  if (type === "string") {
    if (value.length < (schema.minLength || 0)) fail("text is required");
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail("invalid format");
    if (
      schema.format === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail("invalid date");
    if (
      schema.format === "date-time" &&
      (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
        !Number.isFinite(Date.parse(value)))
    )
      fail("invalid timestamp");
    if (schema.format === "uri") {
      try {
        if (!["https:", "http:"].includes(new URL(value).protocol))
          fail("expected a public HTTP URL");
      } catch {
        fail("invalid HTTP URL");
      }
    }
  }
  if (
    type === "number" &&
    (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity))
  )
    fail("invalid numeric value");
  if (type === "array") {
    if (value.length < (schema.minItems || 0)) fail("not enough entries");
    value.forEach((v, i) => validateSchema(v, schema.items, `${path}[${i}]`));
  }
  if (type === "object") {
    for (const key of schema.required || [])
      if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key])
        validateSchema(v, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false)
        fail(`unexpected field ${key}`);
    }
  }
}
export function validateResearch(record, schema) {
  validateSchema(record, schema);
  const hasPath = (value, path) =>
    path.split(".").every((part) => {
      if (value == null || !Object.hasOwn(value, part)) return false;
      value = value[part];
      return true;
    });
  const sources = new Set(record.sources.map((s) => s.url));
  const reviewed = [
    "program_reviewed",
    "source_reviewed",
    "not_a_funder",
  ].includes(record.reviewStatus);
  if (reviewed && !sources.size)
    throw new Error("A reviewed source needs official evidence");
  if (record.reviewStatus === "program_reviewed" && !record.programs.length)
    throw new Error("Program review requires a researched program");
  if (record.reviewStatus !== "program_reviewed" && record.programs.length)
    throw new Error(
      "Non-program dispositions cannot imply reviewed program terms",
    );
  if (
    ["unresolved", "unreachable"].includes(record.reviewStatus) &&
    record.focus.length
  )
    throw new Error("Unresolved sources cannot supply verified matching focus");
  for (const e of record.evidence) {
    if (!sources.has(e.url) || !e.fields.length)
      throw new Error(
        "Overview evidence must reference a retained source and fields",
      );
    if (e.fields.some((field) => !hasPath(record, field)))
      throw new Error("Overview evidence references an unknown field");
  }
  if (record.focus.length && !record.evidence.length)
    throw new Error("Matching focus requires source evidence");
  if (
    reviewed &&
    !record.evidence.length &&
    !record.programs.some((p) => p.evidence.length)
  )
    throw new Error("Review requires field evidence");
  if (new Set(record.programs.map((p) => p.id)).size !== record.programs.length)
    throw new Error("Duplicate program ID");
  for (const p of record.programs) {
    const a = p.award;
    if (a.min != null && a.max != null && a.min > a.max)
      throw new Error("Invalid award range");
    if ((a.min != null || a.max != null) && !a.currency)
      throw new Error("Numeric awards require an explicit currency");
    if (a.basis === "not_stated" && (a.min != null || a.max != null))
      throw new Error("Unstated award cannot have numeric bounds");
    for (const e of p.evidence) {
      if (!sources.has(e.url))
        throw new Error("Program evidence must reference a retained source");
      if (!e.fields.length)
        throw new Error("Evidence must identify the supported fields");
      if (
        e.fields.some((field) => !hasPath(p, field) && !hasPath(record, field))
      )
        throw new Error("Program evidence references an unknown field");
    }
  }
}
export function validateFollowup(baseline, audits, researchById) {
  const statuses = new Set(["source_reviewed", "unresolved", "unreachable"]);
  const outcomes = {
    program_terms_added: "program_reviewed",
    overview_only: "source_reviewed",
    identity_unresolved: "unresolved",
    source_unavailable: "unreachable",
    other_resource: "not_a_funder",
  };
  const targets = new Map(baseline.records.map((r) => [r.sourceRecordId, r]));
  const expectedCount = [...statuses].reduce(
    (n, status) => n + (baseline.researchCounts[status] || 0),
    0,
  );
  if (
    targets.size !== baseline.records.length ||
    targets.size !== baseline.targetCount ||
    expectedCount !== targets.size ||
    baseline.records.some(
      (r) =>
        !statuses.has(r.previousStatus) || !researchById.has(r.sourceRecordId),
    )
  )
    throw new Error(
      "Follow-up baseline must retain the exact overview and unresolved target inventory",
    );
  const rows = audits.flatMap((audit) => {
    if (
      audit.version !== 1 ||
      audit.passId !== baseline.passId ||
      audit.checkedOn !== baseline.checkedOn ||
      !Array.isArray(audit.records)
    )
      throw new Error("Follow-up audit pass mismatch");
    return audit.records;
  });
  if (
    rows.length !== targets.size ||
    new Set(rows.map((r) => r.sourceRecordId)).size !== targets.size
  )
    throw new Error(
      "Every follow-up target needs one audit, without duplicates",
    );
  for (const row of rows) {
    const target = targets.get(row.sourceRecordId),
      research = researchById.get(row.sourceRecordId);
    if (
      !target ||
      row.previousStatus !== target.previousStatus ||
      outcomes[row.outcome] !== research.reviewStatus
    )
      throw new Error(
        "Follow-up outcome must match the target and final research disposition",
      );
    if (
      typeof row.notes !== "string" ||
      !row.notes.trim() ||
      !Array.isArray(row.sources) ||
      !Array.isArray(row.remainingGaps) ||
      row.remainingGaps.some(
        (field) => !["eligibility", "award", "deadline"].includes(field),
      )
    )
      throw new Error("Follow-up findings and remaining gaps are required");
    for (const source of row.sources) {
      validateSchema(source.url, { type: "string", format: "uri" });
      if (
        !source.title?.trim() ||
        ![
          "policy",
          "overview",
          "historical",
          "unavailable",
          "unrelated",
          "identity",
        ].includes(source.outcome)
      )
        throw new Error(
          "Follow-up source needs a title and retrieval/review outcome",
        );
    }
  }
  return rows;
}
function followupSummary(baseline, rows) {
  return {
    passId: baseline.passId,
    checkedOn: baseline.checkedOn,
    targetCount: rows.length,
    previousResearchCounts: baseline.researchCounts,
    previousFieldCoverage: baseline.fieldCoverage,
    programReviewsAdded: rows.filter((r) => r.outcome === "program_terms_added")
      .length,
    sourcesRecovered: rows.filter(
      (r) =>
        ["unresolved", "unreachable"].includes(r.previousStatus) &&
        ["program_terms_added", "overview_only", "other_resource"].includes(
          r.outcome,
        ),
    ).length,
    outcomes: rows.reduce((counts, row) => {
      counts[row.outcome] = (counts[row.outcome] || 0) + 1;
      return counts;
    }, {}),
  };
}
export function validateSnapshot(root) {
  const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), "utf8"));
  const data = read("dist/data/funders.json"),
    schema = read("dist/data/enrichment.schema.json"),
    ids = read("research/source-record-ids.json");
  const manifest = read("research/supplemental-funders.json");
  const supplemental = manifest.funds;
  const extras = supplemental.map(row => row.fund.id);
  if (ids.length !== 593 || new Set(ids).size !== 593 || new Set(extras).size !== extras.length || extras.some(id => !/^local-[a-z0-9][a-z0-9-]*$/.test(id) || ids.includes(id)))
    throw new Error("Invalid baseline or supplemental identities");
  const catalogIds = [...ids, ...extras];
  if (
    data.schemaVersion !== 2 ||
    data.funds.length !== catalogIds.length ||
    new Set(data.funds.map((f) => f.id)).size !== catalogIds.length ||
    [...catalogIds].sort().join() !==
      data.funds
        .map((f) => f.id)
        .sort()
        .join()
  )
    throw new Error("All 593 original source IDs must be retained");
  const sourceFiles = fs
    .readdirSync(new URL("research/", root))
    .filter((p) => /^(pilot-.*|expanded-\d+)\.json$/.test(p));
  const normalize = (r) => ({
    ...r,
    reviewStatus: r.reviewStatus || "program_reviewed",
    focus: r.focus || [],
    evidence: r.evidence || [],
  });
  const sourceRecords = sourceFiles
    .flatMap((p) => read("research/" + p))
    .map(normalize);
  const researchById = new Map(sourceRecords.map((r) => [r.sourceRecordId, r]));
  if (sourceRecords.length !== 593 || researchById.size !== 593)
    throw new Error(
      "Research sources must cover all593 distinct original records",
    );
  for (const row of supplemental) {
    if (row.fund.id !== row.enrichment.sourceRecordId || row.fund.name !== row.enrichment.name) throw new Error("Supplemental identity mismatch");
    researchById.set(row.fund.id, row.enrichment);
  }
  for (const addition of manifest.programAdditions || []) {
    const target = researchById.get(addition.sourceRecordId);
    if (!ids.includes(addition.sourceRecordId) || !target) throw new Error("Program addition has no original target");
    if (target.programs.some(p => p.id === addition.program.id)) throw new Error("Program addition would overwrite prior research");
    target.programs.push(addition.program);
    const urls = new Set(target.sources.map(s => s.url));
    for (const source of addition.sources) {
      if (!urls.has(source.url)) { target.sources.push(source); urls.add(source.url); }
    }
  }
  if (
    data.funds.filter((f) => f.isPilot).length !== 30 ||
    data.pilotCount !== 30
  )
    throw new Error("Original pilot identities must remain available");
  const counts = {};
  for (const f of data.funds) {
    if (!f.enrichment)
      throw new Error(
        "Every original record needs an explicit research disposition",
      );
    if (f.enrichment.sourceRecordId !== f.id || f.enrichment.name !== f.name)
      throw new Error("Enrichment identity mismatch");
    validateResearch(f.enrichment, schema);
    if (!isDeepStrictEqual(f.enrichment, researchById.get(f.id)))
      throw new Error(
        "Generated enrichment is stale; run python3 scripts/import-data.py",
      );
    const status = f.enrichment.reviewStatus;
    counts[status] = (counts[status] || 0) + 1;
  }
  if (data.reviewedCount !== data.funds.filter((f) => f.verifiedOn).length)
    throw new Error("Research count is incorrect");
  if (
    data.enrichedCount !== catalogIds.length ||
    !isDeepStrictEqual(counts, data.researchCounts)
  )
    throw new Error("Research disposition counts are inconsistent");
  const coverage = read("dist/data/research-coverage.json");
  if (
    coverage.records.length !== catalogIds.length ||
    !isDeepStrictEqual(coverage.researchCounts, counts) ||
    [...new Set(coverage.records.map((r) => r.sourceRecordId))]
      .sort()
      .join() !== [...catalogIds].sort().join()
  )
    throw new Error("Coverage report must describe all593 source IDs");
  for (const row of coverage.records) {
    const r = researchById.get(row.sourceRecordId);
    if (
      row.reviewStatus !== r.reviewStatus ||
      row.sourceCount !== r.sources.length ||
      row.programCount !== r.programs.length
    )
      throw new Error("Coverage detail differs from canonical research");
  }
  const baselinePath = new URL("research/deepening-targets.json", root);
  if (fs.existsSync(baselinePath)) {
    const baseline = read("research/deepening-targets.json");
    const expectedHistory = [];
    const latestById = new Map();
    let previousDispositions;
    const historyRoot = new URL("research/followup-history/", root);
    for (const directory of fs.existsSync(historyRoot)
      ? fs
          .readdirSync(historyRoot)
          .filter((name) => /^round-\d+$/.test(name))
          .sort()
      : []) {
      const prefix = "research/followup-history/" + directory + "/";
      const historicBaseline = read(prefix + "deepening-targets.json");
      const historicAudits = fs
        .readdirSync(new URL(prefix, root))
        .filter((name) => /^deepening-review-\d+\.json$/.test(name))
        .sort()
        .map((name) => read(prefix + name));
      const dispositions = read(prefix + "dispositions.json");
      if (
        dispositions.length !== 593 ||
        new Set(dispositions.map((r) => r.sourceRecordId)).size !== 593 ||
        dispositions.some((r) => !ids.includes(r.sourceRecordId))
      )
        throw new Error(
          "Historical dispositions must retain all original identities",
        );
      const historicalRows = validateFollowup(
        historicBaseline,
        historicAudits,
        new Map(dispositions.map((r) => [r.sourceRecordId, r])),
      );
      const archived = read(prefix + "research-followup.json");
      const archivedSummary = followupSummary(historicBaseline, historicalRows);
      if (
        !isDeepStrictEqual(
          archived.records,
          historicalRows.map((r) => ({
            checkedOn: historicBaseline.checkedOn,
            ...r,
          })),
        ) ||
        Object.entries(archivedSummary).some(
          ([key, value]) => !isDeepStrictEqual(archived[key], value),
        ) ||
        !isDeepStrictEqual(
          read("dist/data/research-followup-" + directory + ".json"),
          archived,
        )
      )
        throw new Error(
          "Earlier follow-up evidence must remain unchanged and downloadable",
        );
      expectedHistory.push({
        ...archivedSummary,
        reportUrl: "./data/research-followup-" + directory + ".json",
      });
      for (const row of archived.records)
        latestById.set(row.sourceRecordId, row);
      previousDispositions = dispositions;
    }
    if (previousDispositions) {
      const previousById = new Map(
        previousDispositions.map((r) => [r.sourceRecordId, r.reviewStatus]),
      );
      const previousCounts = previousDispositions.reduce((counts, row) => {
        counts[row.reviewStatus] = (counts[row.reviewStatus] || 0) + 1;
        return counts;
      }, {});
      if (
        !isDeepStrictEqual(previousCounts, baseline.researchCounts) ||
        baseline.records.some(
          (row) => previousById.get(row.sourceRecordId) !== row.previousStatus,
        )
      )
        throw new Error(
          "Latest follow-up baseline must agree with the preceding release",
        );
    }
    if (
      !isDeepStrictEqual(data.followUpHistory, expectedHistory) ||
      !isDeepStrictEqual(coverage.followUpHistory, expectedHistory)
    )
      throw new Error(
        "Research history summaries must agree with archived evidence",
      );
    const audits = fs
      .readdirSync(new URL("research/", root))
      .filter((name) => /^deepening-review-\d+\.json$/.test(name))
      .sort()
      .map((name) => read("research/" + name));
    const rows = validateFollowup(baseline, audits, researchById);
    const report = read("dist/data/research-followup.json");
    const completed = read("research/deepening-result.json");
    const expectedRows = rows.map((r) => ({
      checkedOn: baseline.checkedOn,
      ...r,
    }));
    const expectedSummary = followupSummary(baseline, rows);
    for (const row of expectedRows) latestById.set(row.sourceRecordId, row);
    if (
      !isDeepStrictEqual(report.records, expectedRows) ||
      !isDeepStrictEqual(report, completed) ||
      !isDeepStrictEqual(coverage.followUpSummary, expectedSummary) ||
      !isDeepStrictEqual(data.followUpSummary, expectedSummary) ||
      Object.entries(expectedSummary).some(
        ([key, value]) => !isDeepStrictEqual(report[key], value),
      )
    )
      throw new Error(
        "Published follow-up report differs from canonical research audits",
      );
    for (const row of coverage.records) {
      const expected = latestById.get(row.sourceRecordId);
      if (!isDeepStrictEqual(row.followUp, expected))
        throw new Error("Coverage must retain each targeted follow-up audit");
      if (
        !isDeepStrictEqual(
          data.funds.find((f) => f.id === row.sourceRecordId).followUp,
          expected,
        )
      )
        throw new Error(
          "Fund detail must retain its targeted follow-up findings",
        );
    }
  }
  return data;
}
