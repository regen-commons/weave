import { effectiveAccess } from "../../../../dist/domain.mjs";
import { programFund } from "../../../../dist/matching.mjs";
import type { Entry, Evaluation } from "./contracts.ts";
export interface FundingFilters {
  search: string;
  access: string;
  closing: string;
  group: string;
  sort: string;
}
export const emptyFundingFilters: FundingFilters = {
  search: "",
  access: "",
  closing: "",
  group: "",
  sort: "fit",
};
export function filterFunding(
  entries: Entry[],
  filters: FundingFilters,
  results: Evaluation[] | null,
  now = new Date(),
): Entry[] {
  const ranks = new Map(results?.map((result, index) => [result.documentId, { result, index }]));
  const query = filters.search
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const selected = entries.filter((entry) => {
    const access = effectiveAccess(programFund(entry.fund, entry.program), now);
    const text = [
      entry.fund.displayName,
      entry.fund.description,
      ...entry.fund.sectors,
      ...entry.fund.regions,
      entry.program?.name,
      ...(entry.program?.focus ?? []),
    ]
      .join(" ")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
    const deadline = entry.program?.application.closesOn;
    const remaining = deadline ? Date.parse(`${deadline}T23:59:59Z`) - now.getTime() : NaN;
    return (
      query.every((word) => text.includes(word)) &&
      (!filters.access || access === filters.access) &&
      (!filters.group || ranks.get(entry.id)?.result.group === filters.group) &&
      (!filters.closing ||
        (Number.isFinite(remaining) &&
          remaining >= 0 &&
          remaining <= Number(filters.closing) * 86400000 &&
          access !== "closed"))
    );
  });
  return selected.sort((a, b) => {
    const rank =
      filters.sort === "fit" && results
        ? (ranks.get(a.id)?.index ?? Infinity) - (ranks.get(b.id)?.index ?? Infinity)
        : 0;
    const nextDeadline = (entry: Entry) => {
      const date = entry.program?.application.closesOn;
      return date && effectiveAccess(programFund(entry.fund, entry.program), now) !== "closed"
        ? date
        : "9999";
    };
    const closing = filters.sort === "closing" ? nextDeadline(a).localeCompare(nextDeadline(b)) : 0;
    const recent =
      filters.sort === "recent" ? (b.fund.verifiedOn ?? "").localeCompare(a.fund.verifiedOn ?? "") : 0;
    return (
      rank ||
      closing ||
      recent ||
      a.fund.displayName.localeCompare(b.fund.displayName) ||
      (a.program?.name ?? "").localeCompare(b.program?.name ?? "")
    );
  });
}
export const fitLevel = (result: Evaluation) =>
  result.thematicFit.band === "strong"
    ? "strong"
    : result.thematicFit.band === "relevant"
      ? "good"
      : "possible";
