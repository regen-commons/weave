import {
  CatalogSchema,
  ConditionsSchema,
  RulesSchema,
  type Bundle,
  type Catalog,
  type Entry,
  type Program,
} from "./contracts.ts";
import { validConditions } from "../../../../dist/matching.mjs";
import { ACCESS } from "../../../../dist/domain.mjs";
import type { IconName } from "../ui/icons.ts";
import { FUNDING_QUERY } from "./select.ts";

export function parseBundle(catalog: unknown, rules: unknown, conditions: unknown): Bundle {
  const parsed = CatalogSchema.parse(catalog);
  if (new Set(parsed.funds.map((fund) => fund.id)).size !== parsed.funds.length)
    throw new Error("Duplicate fund identities.");
  for (const fund of parsed.funds)
    if (
      new Set(fund.enrichment.programs.map((program) => program.id)).size !== fund.enrichment.programs.length
    )
      throw new Error("Duplicate program identities.");
  const screened = ConditionsSchema.safeParse(conditions);
  return {
    catalog: parsed,
    rules: RulesSchema.parse(rules).rules,
    conditions:
      screened.success && validConditions(screened.data, parsed.funds) ? screened.data.conditions : null,
  };
}
export function catalogEntries(bundle: Bundle): Entry[] {
  return bundle.catalog.funds.flatMap<Entry>((fund) =>
    fund.enrichment.programs.length
      ? fund.enrichment.programs.map((program) => ({ id: `${fund.id}::${program.id}`, fund, program }))
      : [{ id: fund.id, fund, program: null }],
  );
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const isDay = (value: unknown): value is string =>
  typeof value === "string" &&
  ISO_DAY.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().startsWith(value);
// No place's calendar runs more than 14 hours ahead of UTC.
const LATEST_LOCAL_OFFSET_MS = 14 * 60 * 60 * 1000;
/**
 * The latest day this catalog records checking an official source: whole-record research,
 * a source version or dated program evidence. Partial reviews and journaled revisions date
 * their sources and evidence but do not move a record's whole-record research date, so
 * `researchCheckedOn` alone falls behind them. A day after compilation cannot be in this
 * catalog and is ignored. Null when no usable day is recorded; say so rather than guess.
 */
export function researchSnapshotDate(catalog: Catalog): string | null {
  const compiled = Date.parse(catalog.compiledAt);
  const limit = Number.isNaN(compiled)
    ? null
    : new Date(compiled + LATEST_LOCAL_OFFSET_MS).toISOString().slice(0, 10);
  let latest: string | null = null;
  const consider = (value: unknown) => {
    if (isDay(value) && (!limit || value <= limit) && (!latest || value > latest)) latest = value;
  };
  consider(catalog.researchCheckedOn);
  for (const fund of catalog.funds) {
    consider(fund.verifiedOn);
    for (const source of fund.enrichment.sources) consider(source.checkedOn);
    for (const program of fund.enrichment.programs)
      for (const evidence of program.evidence) consider(evidence.checkedOn);
  }
  return latest;
}
export type AccessTone = "success" | "warning" | "info";
const ACCESS_TONES: Record<string, AccessTone | undefined> = { green: "success", amber: "warning", purple: "info" };
const ACCESS_ICONS: Record<string, IconName | undefined> = {
  open: "check",
  rolling: "check",
  restricted: "people",
  relationship: "people",
  directory: "globe",
  future: "clock",
  closed: "lock",
  conflicting: "alert",
};
/** How a card shows a way in: the catalog's own label, with an icon and a tone that repeat it. */
export function accessSign(access: string): { label: string; icon: IconName; tone?: AccessTone } {
  const known = ACCESS[access];
  return {
    label: known?.label ?? "Application route needs checking",
    icon: ACCESS_ICONS[access] ?? "info",
    tone: known ? ACCESS_TONES[known.tone] : undefined,
  };
}
/** Use structured current terms in the comparison row. The full note stays in the opportunity. */
export function awardLabel(award: Program["award"] | undefined): string {
  if (award?.basis === "historical") return "Past award terms";
  if (award?.basis !== "current_offer" || !award.currency) return "See award details";
  const { min, max, currency } = award;
  const amount = (value: number) => new Intl.NumberFormat("en").format(value);
  if (min !== null && max !== null)
    return min === max ? `${currency} ${amount(min)}` : `${currency} ${amount(min)} to ${amount(max)}`;
  if (max !== null) return `Up to ${currency} ${amount(max)}`;
  if (min !== null) return `From ${currency} ${amount(min)}`;
  return "See award details";
}
const FUNDING_KINDS: Record<string, string | undefined> = {
  grant: "Grant",
  investment: "Investment",
  fellowship: "Fellowship",
  prize: "Prize",
  scholarship: "Scholarship",
  mixed: "Mixed funding",
};
/**
 * The line above a funding card's title: the kind of funding and, where the source states a
 * current one, the award. Most programs state none, so the kind stands alone.
 */
export function fundingEyebrow(program: Pick<Program, "instrument" | "award"> | null | undefined): string {
  const kind = FUNDING_KINDS[program?.instrument ?? ""] ?? "Funding";
  const award = awardLabel(program?.award);
  if (program?.award.basis !== "current_offer" || award === "See award details") return kind;
  return `${kind}, ${/^(Up to|From) /.test(award) ? award.charAt(0).toLowerCase() + award.slice(1) : award}`;
}
export function fundingSearch(search: string): URLSearchParams {
  const source = new URLSearchParams(search),
    result = new URLSearchParams();
  for (const key of FUNDING_QUERY.one) {
    const value = source.get(key);
    if (value) result.set(key, value);
  }
  for (const key of FUNDING_QUERY.many) for (const value of source.getAll(key)) if (value) result.append(key, value);
  return result;
}
export function fundingBackHref(search: string): string {
  const query = fundingSearch(search).toString();
  return `/funding${query ? `?${query}` : ""}`;
}
export function opportunityHref(entry: Entry, search = ""): string {
  const query = new URLSearchParams();
  if (entry.program) query.set("program", entry.program.id);
  // A filter can hold several values, so each is added, never set over the last.
  for (const [key, value] of fundingSearch(search)) query.append(key, value);
  return `/funding/${entry.fund.id}${query.size ? `?${query}` : ""}`;
}
/** A stale or mistyped program must never silently open a different call. */
export function findEntry(entries: Entry[], fundId: string, programId: string | null): Entry | undefined {
  return (
    entries.find(
      (entry) =>
        entry.fund.id === fundId && (programId === null ? !entry.program : entry.program?.id === programId),
    ) ?? (programId === null ? entries.find((entry) => entry.fund.id === fundId) : undefined)
  );
}
export function legacyFundingHref(search: string): string | null {
  const params = new URLSearchParams(search),
    fund = params.get("fund"),
    program = params.get("program");
  const valid = (value: string) => /^[a-zA-Z0-9_-]+$/u.test(value);
  if (!fund || !valid(fund) || (program !== null && !valid(program))) return null;
  return `/funding/${fund}${program ? `?program=${encodeURIComponent(program)}` : ""}`;
}
