import {
  CatalogSchema,
  ConditionsSchema,
  RulesSchema,
  type Bundle,
  type Entry,
  type Program,
} from "./contracts.ts";
import { validConditions } from "../../../../dist/matching.mjs";
import { ACCESS } from "../../../../dist/domain.mjs";
import type { IconName } from "../ui/icons.ts";

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
  for (const key of ["q", "closing", "access", "group", "sort"]) {
    const value = source.get(key);
    if (value) result.set(key, value);
  }
  return result;
}
export function fundingBackHref(search: string): string {
  const query = fundingSearch(search).toString();
  return `/funding${query ? `?${query}` : ""}`;
}
export function opportunityHref(entry: Entry, search = ""): string {
  const query = new URLSearchParams();
  if (entry.program) query.set("program", entry.program.id);
  for (const [key, value] of fundingSearch(search)) query.set(key, value);
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
