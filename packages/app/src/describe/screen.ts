import {
  DERIVED_LABELS,
  EMPTY_INITIATIVE,
  confirmDraft,
  revise,
  reviewedProposal,
  type DerivedKey,
  type DeviceDraft,
  type Initiative,
  type RecordForm,
} from "./contracts.ts";
import { hasDetail } from "./details.ts";
import { formFrom, parseRecordForm } from "./forms.ts";
import { previewFields } from "./view.ts";

/** The two ways to describe an initiative: type the four fields, or talk it through and let the app build a card. */
export type DescribeMode = DeviceDraft["mode"];

/** A problem with what the person typed, said in a sentence the page can show as it is. */
export class FieldsProblem extends Error {}

const DETAILS = Object.keys(DERIVED_LABELS) as DerivedKey[];

/** Words, or a card built from words, that only the conversation shows. */
export function hasConversation(draft: DeviceDraft): boolean {
  return !!(
    draft.turns.length ||
    draft.composer.trim() ||
    draft.pendingLink.trim() ||
    Object.keys(draft.answerEdits).length ||
    (draft.proposal && draft.lastBuild && draft.lastBuild.engine !== "manual")
  );
}

/**
 * The view the describe step opens on. The four fields are the default, whatever mode a new draft
 * stores. The conversation shows when the person chose it in this visit, or when the draft already
 * holds conversation content and they have not switched to the fields.
 */
export function describeView(draft: DeviceDraft, chosen: DescribeMode | null): DescribeMode {
  if (chosen) return chosen;
  if (draft.mode === "fields") return "fields";
  return hasConversation(draft) ? "conversation" : "fields";
}

/** What the four fields show, and so what Continue reads. */
export function fieldsForm(draft: DeviceDraft): RecordForm {
  return draft.form ?? formFrom(previewFields(draft));
}

/** How the four fields open: whether speaking is offered first, and which one action is filled. */
export interface FieldsLead {
  readonly voice: boolean;
  readonly primary: "speak" | "continue";
}

/**
 * A new initiative is invited to speak first, because saying it aloud is the easier way in. The
 * invitation needs speech this device can transcribe, and it goes once the initiative has a card.
 * It stays while the person types, so the page does not jump, but then Continue is the filled
 * action: only one is filled at a time.
 */
export function fieldsLead(draft: DeviceDraft, speechReady: boolean): FieldsLead {
  const voice = speechReady && !draft.proposal && !draft.confirmed;
  const typed = Object.values(fieldsForm(draft)).some((value) => value.trim());
  return { voice, primary: voice && !typed ? "speak" : "continue" };
}

const NAME_HELP = "Add a name for your initiative.";
const PLACES_HELP = "Use up to eight places, each up to 120 characters.";
const LINKS_HELP = "Use up to six complete http or https links.";

/** Reads the four fields as typed, or throws a FieldsProblem that says what to fix. */
export function readFields(form: RecordForm) {
  if (!form.name.trim()) throw new FieldsProblem(NAME_HELP);
  try {
    parseRecordForm({ ...form, links: "" });
  } catch {
    throw new FieldsProblem(PLACES_HELP);
  }
  try {
    return parseRecordForm(form);
  } catch {
    throw new FieldsProblem(LINKS_HELP);
  }
}

/**
 * Continue from the four fields. The card is what the person typed, and the app derives nothing
 * for them. It is confirmed here only when this screen showed all of it: a draft that still
 * carries details from an earlier conversation comes back unconfirmed, so the check card can
 * show those details first. Throws a FieldsProblem when the fields cannot make a card.
 */
export function continueWithFields(draft: DeviceDraft): DeviceDraft {
  const typed = readFields(fieldsForm(draft));
  const built = revise(draft, {
    mode: "fields",
    publicEdits: typed,
    proposal: { ...EMPTY_INITIATIVE, ...typed, confidence: 1 },
    proposalVersion: draft.inputVersion,
    confirmed: null,
    lastBuild: {
      engine: "manual",
      unreadFiles: draft.attachments.length,
      sourceCharacters: typed.description.length,
      files: [],
      fallback: false,
    },
  });
  const card = reviewedProposal(built)!;
  const unseen = DETAILS.some((key) => hasDetail(key, card)) || Object.keys(built.reviewEdits).length > 0;
  return unseen ? built : confirmDraft(built);
}

/** Where Continue goes: on to needs and offers once the card is confirmed, otherwise to the check card. */
export function afterFields(draft: DeviceDraft): "needs" | "check-card" {
  return draft.confirmed && draft.proposalVersion === draft.inputVersion ? "needs" : "check-card";
}

/**
 * Opens the conversation from the four fields. A field left blank was not typed, so the
 * conversation may fill it. What the person did type stays, and wins over what the app proposes.
 */
export function talkItThrough(draft: DeviceDraft): DeviceDraft {
  const { name, description, locations, isGlobal } = draft.publicEdits;
  return revise(draft, {
    mode: "conversation",
    assistant: draft.assistant === "none" ? "keywords" : draft.assistant,
    publicEdits: {
      ...(name?.trim() ? { name } : {}),
      ...(description?.trim() ? { description } : {}),
      ...(isGlobal || locations?.length ? { locations: locations ?? [], isGlobal: isGlobal ?? false } : {}),
    },
  });
}

/**
 * Stores the card a build proposes. The text left in the four fields is cleared, so the check
 * card shows the card that was built and not what the fields held before it.
 */
export function builtCard(
  draft: DeviceDraft,
  proposal: Initiative,
  version: number,
  lastBuild: NonNullable<DeviceDraft["lastBuild"]>,
): DeviceDraft {
  return revise(draft, { proposal, proposalVersion: version, confirmed: null, lastBuild, form: null });
}
