import { projectSlug } from "@weave/api/public-projects-contract";
import { z } from "../validation.ts";
import type { Entry } from "../funding/contracts.ts";
import type { ShortlistEntry, ShortlistKind } from "./store.ts";

/** A shortlisted fund: a catalog entry, named as it was when marked. */
export interface FundItem extends ShortlistEntry {
  readonly funder: string;
}

/**
 * A shortlisted initiative: a public project's address, its name and who shared it. Never its own words:
 * those are read fresh from the public list, so a project its publisher withdrew is not kept here.
 */
export interface InitiativeItem extends ShortlistEntry {
  readonly publisher: string;
}

const ENTRY_ID = /^[a-zA-Z0-9_-]+(?:::[a-zA-Z0-9_-]+)?$/u;
const text = z.string().check(z.maxLength(400));
const FundSchema = z.strictObject({
  id: z.string().check(z.maxLength(300), z.regex(ENTRY_ID)),
  name: text,
  funder: text,
  addedAt: z.iso.datetime(),
});
const InitiativeSchema = z.strictObject({
  id: z.string().check(z.maxLength(400), z.refine((uri) => projectSlug(uri) !== null)),
  name: text,
  publisher: text,
  addedAt: z.iso.datetime(),
});

export const FUND_SHORTLIST: ShortlistKind<FundItem> = {
  key: "weave-funding-shortlist",
  parse: (value) => {
    const item = FundSchema.safeParse(value);
    return item.success ? item.data : null;
  },
};

export const INITIATIVE_SHORTLIST: ShortlistKind<InitiativeItem> = {
  key: "weave-initiative-shortlist",
  parse: (value) => {
    const item = InitiativeSchema.safeParse(value);
    return item.success ? item.data : null;
  },
};

/** What a catalog entry is called on the shortlist and in an export. */
export function fundItemOf(entry: Entry, now = new Date()): FundItem {
  return {
    id: entry.id,
    name: entry.program?.name ?? entry.fund.displayName,
    funder: entry.fund.displayName,
    addedAt: now.toISOString(),
  };
}

/** A public project as the shortlist keeps it. Null for one without a Weave address. */
export function initiativeItemOf(
  project: { readonly uri: string; readonly name: string; readonly publisher?: string },
  now = new Date(),
): InitiativeItem | null {
  if (projectSlug(project.uri) === null) return null;
  return { id: project.uri, name: project.name, publisher: project.publisher ?? "", addedAt: now.toISOString() };
}
