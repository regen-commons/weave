import { effectiveAccess } from "../../../../dist/domain.mjs";
import { programFund } from "../../../../dist/matching.mjs";
import type { PublicProjectCard } from "@weave/api/public-projects-contract";
import { projectSlug } from "@weave/api/public-projects-contract";
import { opportunityHref } from "../funding/catalog.ts";
import { FundSchema, type Entry } from "../funding/contracts.ts";
import { closingDay, deadlineSign } from "../funding/deadline.ts";
import { fullDate } from "../home.ts";
import type { FundItem, InitiativeItem } from "./items.ts";

/**
 * One row of the shortlist (DL-153): the record's name, one line of who and where, one line of
 * when, and where it opens. A record its list no longer holds keeps its row, named as it was marked,
 * so the person decides to take it off; it never disappears unseen and never shows words it no
 * longer publishes.
 */
export interface ShortlistRow {
  readonly id: string;
  readonly name: string;
  /** Where it opens in Weave, or null where it no longer can. */
  readonly href: string | null;
  /** Who and where: the funder, or who shared it and its place. */
  readonly by: string;
  /** When: its deadline, or what is known about it now. */
  readonly when: string;
  /** A deadline within two weeks, which the row sets in bold; its words say how soon. */
  readonly soon: boolean;
  /** `gone` rows say why and offer Remove; `checking` rows wait for their list. */
  readonly state: "listed" | "gone" | "checking" | "unchecked";
}

/** A shortlisted fund's address in Weave, from its catalog identity alone. */
export function fundHref(id: string): string {
  const [fund, program] = id.split("::");
  return `/funding/${fund}${program ? `?program=${encodeURIComponent(program)}` : ""}`;
}

/**
 * Each shortlisted fund as a row, in the shortlist's order, from the catalog on hand: `loading` while
 * it arrives, `failed` where it could not load, so no fund is called gone for want of a catalog.
 */
export function fundRows(
  items: readonly FundItem[],
  entries: readonly Entry[] | "loading" | "failed",
  now = new Date(),
): ShortlistRow[] {
  if (entries === "loading" || entries === "failed")
    return items.map((item) => ({
      id: item.id, name: item.name, href: fundHref(item.id), by: item.funder,
      when: entries === "failed" ? "Not checked just now." : "", soon: false,
      state: entries === "failed" ? "unchecked" : "checking",
    }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return items.map((item) => {
    const entry = byId.get(item.id);
    if (!entry)
      return { id: item.id, name: item.name, href: null, by: item.funder, when: "No longer in the catalog.", soon: false, state: "gone" };
    const fund = FundSchema.parse(programFund(entry.fund, entry.program));
    const name = entry.program?.name ?? fund.displayName;
    const closed = effectiveAccess(fund, now) === "closed";
    const sign = fund.deadlineDate ? deadlineSign(closingDay(fund.deadlineDate, fund.deadlineInstant), closed, now) : null;
    const when = !sign
      ? closed ? "Not open now." : "No closing date stated."
      : sign.dated && sign.label === "Closes"
        ? `Closes ${fullDate(fund.deadlineDate!, "medium")}.`
        : sign.label === "Ended" ? `Ended ${fullDate(fund.deadlineDate!, "medium")}.` : `${sign.label}.`;
    return {
      id: item.id,
      name,
      href: opportunityHref(entry),
      by: fund.displayName !== name ? fund.displayName : item.funder,
      when,
      soon: !!sign?.soon,
      state: "listed",
    };
  });
}

/** What the public list said about one shortlisted initiative. */
export type InitiativeLookup =
  | { readonly status: "checking" }
  | { readonly status: "found"; readonly card: PublicProjectCard }
  /** Not on the public list now: withdrawn by its publisher, or not read by Weave yet. */
  | { readonly status: "missing" }
  /** The public list is not switched on here. */
  | { readonly status: "off" }
  /** Weave could not ask just now: offline, or the list did not answer. */
  | { readonly status: "failed" };

/** Each shortlisted initiative as a row, in the shortlist's order. */
export function initiativeRows(items: readonly InitiativeItem[], lookups: ReadonlyMap<string, InitiativeLookup>): ShortlistRow[] {
  return items.map((item) => {
    const lookup = lookups.get(item.id) ?? { status: "checking" as const };
    const slug = projectSlug(item.id);
    const href = slug ? `/initiatives/${slug}` : null;
    switch (lookup.status) {
      case "found": {
        const { card } = lookup;
        return {
          id: item.id, name: card.name, href,
          by: [card.publisher, card.place].filter(Boolean).join(", "),
          when: `Shared ${fullDate(new Date(card.sharedAt).toISOString().slice(0, 10), "medium")}.`,
          soon: false, state: "listed",
        };
      }
      case "missing":
        return { id: item.id, name: item.name, href: null, by: item.publisher, when: "No longer public. Its publisher may have withdrawn it.", soon: false, state: "gone" };
      case "off":
        return { id: item.id, name: item.name, href: null, by: item.publisher, when: "The public list is not available here.", soon: false, state: "unchecked" };
      case "failed":
        return { id: item.id, name: item.name, href, by: item.publisher, when: "Not checked just now.", soon: false, state: "unchecked" };
      case "checking":
        return { id: item.id, name: item.name, href, by: item.publisher, when: "", soon: false, state: "checking" };
    }
  });
}

export type ShortlistKindName = "funds" | "initiatives";

/** The line a phone shows under Your Initiatives, or null with nothing on the shortlist. */
export function shortlistSummary(funds: number, initiatives: number): string | null {
  if (!funds && !initiatives) return null;
  const parts = [
    funds ? `${funds} ${funds === 1 ? "fund" : "funds"}` : "",
    initiatives ? `${initiatives} ${initiatives === 1 ? "initiative" : "initiatives"}` : "",
  ].filter(Boolean);
  return `Shortlist: ${parts.join(", ")}.`;
}

/** Which kind the shortlist opens on: the one asked for, else the one last shown, else the one with items, funds first. */
export function openingKind(asked: string | null, remembered: string | null, funds: number, initiatives: number): ShortlistKindName {
  if (asked === "funds" || asked === "initiatives") return asked;
  if ((remembered === "funds" && funds) || (remembered === "initiatives" && initiatives)) return remembered;
  return funds || !initiatives ? "funds" : "initiatives";
}
