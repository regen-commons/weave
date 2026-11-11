import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise, type DeviceDraft } from "../describe/contracts.ts";
import { formFrom } from "../describe/forms.ts";
import type { PublicCard } from "../social/fixture.ts";

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
 * an ordinary card to check; needs, offers and everything else are added in Weave.
 */
export function draftFromRecord(record: PublicCard): DeviceDraft {
  return described(newDraft(), record);
}

/**
 * Puts a linked Certified project's four public details on the card this device already has.
 * Needs, offers, funding answers and the details Weave keeps for matching stay as they are.
 * A card that was not checked yet is checked here when the project's details are complete,
 * because they are the project's own published words and not a suggestion.
 */
export function draftWithRecord(draft: DeviceDraft, record: PublicCard & { readonly verifiedFields?: readonly (keyof PublicCard)[] }): DeviceDraft {
  const current = draft.confirmed ?? draft.proposal ?? EMPTY_INITIATIVE;
  const source = record.verifiedFields ? {
    name: record.verifiedFields.includes("name") ? record.name : current.name,
    description: record.verifiedFields.includes("description") ? record.description : current.description,
    locations: record.verifiedFields.includes("locations") ? record.locations : current.locations,
    links: record.verifiedFields.includes("links") ? record.links : current.links,
    isGlobal: record.verifiedFields.includes("locations") ? false : current.isGlobal,
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
