import fs from 'node:fs/promises';
import {validConditions} from '../dist/matching.mjs';
import {COUNTRIES,US_STATES} from '../dist/storage.mjs';

export async function loadScreening(root) {
  const file = path => new URL(path, root);
  const json = async path => JSON.parse(await fs.readFile(file(path),'utf8'));
  const readdir = fs.readdir;
  const sourceRules = await json("research/eligibility-rules.json");
  const expandedRules = (
    await Promise.all(
      (
        await readdir(file("research/"))
      )
        .filter((p) => /^expanded-eligibility-\d+\.json$/.test(p))
        .map((p) => json("research/" + p)),
    )
  ).flatMap((r) => r.rules);
  const rules = {
    ...sourceRules,
    rules: [...sourceRules.rules, ...expandedRules].map((r) => ({
      ...r,
      field:
        r.field === "applicantCountry"
          ? r.programId === "calala-radix-call-2-2026"
            ? "registrationCountry"
            : "applicantBaseCountry"
          : r.field,
      checkedOn: r.checkedOn || "2026-10-15",
    })),
  };
  return {rules,conditions:await json('research/program-conditions.json')};
}

export function validateScreening(data,rules,conditions) {
  if (!validConditions(conditions, data.funds)) throw new Error("Program conditions lack retained source/program evidence or contain invalid assertions.");
  const keys = new Set();
  for (const rule of rules.rules) {
    const fields = [
      "workCountries",
      "benefitCountries",
      "applicantBaseCountry",
      "registrationCountry",
      "applicantType",
      "usWorkStates", "usBenefitStates",
    ];
    const values =
      rule.field === "applicantType"
        ? [
            "nonprofit",
            "informal",
            "individual",
            "business",
            "university",
            "public-body",
          ]
        : ["usWorkStates", "usBenefitStates"].includes(rule.field) ? Object.keys(US_STATES) : COUNTRIES;
    if (
      !fields.includes(rule.field) ||
      (rule.kind != null && !["prerequisite", "priority"].includes(rule.kind)) ||
      (rule.alternativeField && (!fields.includes(rule.alternativeField) || rule.operator !== "only" || rule.alternativeField === rule.field)) ||
      (rule.localRequirement != null && (typeof rule.localRequirement !== "string" || !rule.localRequirement.trim())) ||
      !["only", "exclude"].includes(rule.operator) ||
      !Array.isArray(rule.values) ||
      !rule.values.length ||
      rule.values.some((v) => !values.includes(v)) ||
      !rule.reason?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(rule.checkedOn) ||
      !Number.isFinite(Date.parse(rule.checkedOn))
    )
      throw new Error("Invalid eligibility assertion: " + rule.fundId);
    const fund = data.funds.find((f) => f.id === rule.fundId);
    if (
      !fund?.enrichment.programs.some((p) => p.id === rule.programId) ||
      !fund.enrichment.sources.some((s) => s.url === rule.sourceUrl)
    )
      throw new Error(
        "Eligibility rule lacks retained program/source: " +
          rule.fundId +
          " " +
          rule.programId,
      );
    const key = JSON.stringify([
      rule.fundId,
      rule.programId,
      rule.field,
      rule.alternativeField || "",
      rule.operator,
      [...rule.values].sort(),
    ]);
    if (keys.has(key)) throw new Error("Duplicate eligibility assertion");
    keys.add(key);
  }
}
