import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise, type DeviceDraft, type Initiative } from "../describe/contracts.ts";
import { formFrom } from "../describe/forms.ts";
import type { AskKind } from "../intake/contracts.ts";
import { projectPageAsks, projectSource, suggestFromProjectPage } from "../intake/project-page.ts";
import { fromProjectPage } from "../intake/state.ts";
import type { PublicCard } from "../social/fixture.ts";

/** A Certified project as it reaches the card: its public details, its address and the fields its provider supplied. */
type ProjectRecord = PublicCard & {
  readonly uri?: string;
  readonly isGlobal?: boolean;
  readonly verifiedFields?: readonly (keyof PublicCard)[];
  readonly unreadFields?: readonly (keyof PublicCard)[];
};
/** One entry a project page suggests, named by its list. */
export interface ProjectSuggestion {
  readonly kind: AskKind;
  readonly title: string;
}
const KINDS = ["needs", "offers"] as const satisfies readonly AskKind[];

const publicEdits = (record: PublicCard & { readonly isGlobal?: boolean }) => ({
  name: record.name,
  description: record.description,
  locations: [...record.locations],
  isGlobal: record.isGlobal ?? false,
  links: [...record.links],
});

/** A card whose four public details are the project's, written as fields and waiting to be checked. */
function described(base: DeviceDraft, record: PublicCard): DeviceDraft {
  const edits = publicEdits(record);
  const current = base.proposal && base.proposalVersion === base.inputVersion ? base.proposal : EMPTY_INITIATIVE;
  const fields = { ...current, ...edits, confidence: 1 };
  return revise(base, {
    mode: "fields",
    assistant: "none",
    proposal: fields,
    proposalVersion: base.inputVersion,
    publicEdits: edits,
    links: fields.links,
    form: formFrom(fields),
    lastBuild: {
      engine: "manual",
      unreadFiles: 0,
      sourceCharacters: record.description.length,
      files: [],
      fallback: false,
    },
  });
}

/**
 * A Certified project record carries four public details. They start a fresh device draft as
 * an ordinary card to check. The needs and offers its description states are suggested in
 * pencil, and everything else is added in Weave.
 */
export function draftFromRecord(record: ProjectRecord): DeviceDraft {
  return withProjectSuggestions(described(newDraft(), record), record);
}

/** The place and links already on the card: checked, or given as fields before it was checked. */
function ownPlaceAndLinks(draft: DeviceDraft, current: Initiative) {
  if (draft.confirmed) return draft.confirmed;
  return {
    locations: draft.publicEdits.locations ?? current.locations,
    isGlobal: draft.publicEdits.isGlobal ?? current.isGlobal,
    links: draft.links.length ? draft.links : current.links,
  };
}

/** What linking a project does with its place: fills an empty Where, keeps the card's own, names one Weave could not read, or nothing. */
export type PlaceOnLink = "filled" | "kept" | "unread" | "none";

export function placeOnLink(draft: DeviceDraft, record: ProjectRecord): PlaceOnLink {
  if (record.unreadFields?.includes("locations")) return "unread";
  if (!record.verifiedFields?.includes("locations") || !record.locations.length) return "none";
  const own = ownPlaceAndLinks(draft, draft.confirmed ?? draft.proposal ?? EMPTY_INITIATIVE);
  return own.locations.length || own.isGlobal ? "kept" : "filled";
}

/**
 * Puts a linked Certified project's four public details on the card this device already has.
 * Needs, offers, funding answers and the details Weave keeps for matching stay as they are.
 * A card that was not checked yet is checked here when the project's details are complete,
 * because they are the project's own published words and not a suggestion.
 * A project that lists the fields its source supplied gives its name and description, and its
 * place and links only where the card has none: a place or link the person gave stays theirs.
 */
export function withProjectDetails(draft: DeviceDraft, record: ProjectRecord): DeviceDraft {
  const current = draft.confirmed ?? draft.proposal ?? EMPTY_INITIATIVE;
  const own = ownPlaceAndLinks(draft, current);
  const supplied = (field: keyof PublicCard) => !!record.verifiedFields?.includes(field);
  const fillPlace = placeOnLink(draft, record) === "filled";
  const fillLinks = supplied("links") && record.links.length > 0 && !own.links.length;
  const source = record.verifiedFields ? {
    name: supplied("name") ? record.name : current.name,
    description: supplied("description") ? record.description : current.description,
    locations: fillPlace ? record.locations : own.locations,
    links: fillLinks ? record.links : own.links,
    isGlobal: own.isGlobal,
  } : record;
  const edits = publicEdits(source);
  if (draft.confirmed)
    return revise(draft, {
      proposal: draft.proposal ? { ...draft.proposal, ...edits } : draft.proposal,
      publicEdits: edits,
      links: edits.links,
      form: draft.form ? formFrom({ ...EMPTY_INITIATIVE, ...edits }) : draft.form,
      confirmed: { ...draft.confirmed, ...edits },
    });
  const next = described(draft, source);
  try {
    return confirmDraft(next);
  } catch {
    // Something is still open on the card, so the person checks it on the card page.
    return next;
  }
}

/**
 * Links a Certified project to the card on this device: the project's public details, and the
 * needs and offers its description states as suggestions in pencil. Every way of linking or
 * importing a project goes through here.
 */
export function draftWithRecord(draft: DeviceDraft, record: ProjectRecord): DeviceDraft {
  return withProjectSuggestions(withProjectDetails(draft, record), record);
}

/**
 * Up to three needs and three offers from the project's public description, read on this device
 * and added after the card's own entries in pencil, so nothing is kept or shared until the person
 * keeps it. A card that already holds suggestions from this project gets none from it again, so
 * linking twice adds nothing and a removed suggestion stays removed. Suggestions are optional:
 * when they cannot be read, the link goes ahead without them and entries are added by hand.
 */
export function withProjectSuggestions(
  draft: DeviceDraft,
  record: ProjectRecord,
  read = projectPageAsks,
): DeviceDraft {
  const description =
    !record.verifiedFields || record.verifiedFields.includes("description") ? record.description : "";
  if (!record.uri || !description.trim()) return draft;
  const source = projectSource(record.uri);
  if (KINDS.some((kind) => draft[kind].items.some((item) => item.sourceKey?.startsWith(`${source}:`))))
    return draft;
  try {
    const found = read(description, source);
    const needs = suggestFromProjectPage(draft.needs, found.needs);
    const offers = suggestFromProjectPage(draft.offers, found.offers);
    return needs === draft.needs && offers === draft.offers ? draft : revise(draft, { needs, offers });
  } catch {
    return draft;
  }
}

/** What linking this project would suggest for the card, so the link review can say so before the tap. */
export function suggestionsOnLink(draft: DeviceDraft, record: ProjectRecord): ProjectSuggestion[] {
  const next = withProjectSuggestions(draft, record);
  const before = new Set(KINDS.flatMap((kind) => draft[kind].items.map((item) => item.id)));
  return KINDS.flatMap((kind) =>
    next[kind].items.filter((item) => !before.has(item.id)).map((item) => ({ kind, title: item.value.title })),
  );
}

/** Suggestions from a project page that are still in pencil, one per entry. */
export function waitingSuggestions(draft: DeviceDraft): ProjectSuggestion[] {
  return KINDS.flatMap((kind) =>
    draft[kind].items
      .filter((item) => item.decision === "pencil" && fromProjectPage(item))
      .map((item) => ({ kind, title: item.value.title })),
  );
}
