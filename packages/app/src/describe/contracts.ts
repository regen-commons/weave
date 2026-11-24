import { z } from "../validation.ts";

import { TurnSchema, AttachmentSchema, FileReadSchema, LinkSchema, type Turn } from "./source-contracts.ts";
export {
  MAX_FILE_BYTES,
  TurnSchema,
  AttachmentSchema,
  FileReadSchema,
  LinkSchema,
  type Turn,
  type Attachment,
} from "./source-contracts.ts";
import { AskStepSchema, emptyAskStep } from "../intake/contracts.ts";
import { FundingDetailsSchema, emptyFundingDetails } from "../funding/contracts.ts";
export const StageSchema = z.enum(["seed", "sprout", "flowering", "tree"]);
export const LensSchema = z.enum(["art_culture", "research", "technology", "place_based", "learning", "funders"]);
export const DerivedKeySchema = z.enum(["stage", "lenses", "themes", "beneficiaries", "languages"]);
export type DerivedKey = z.infer<typeof DerivedKeySchema>;
export const SuggestionSchema = z.strictObject({
  name: z.string().check(z.maxLength(200)),
  locations: z.array(z.string().check(z.minLength(1), z.maxLength(120))).check(z.maxLength(8)),
  isGlobal: z.boolean(),
  description: z.string().check(z.maxLength(800)),
  links: z.array(LinkSchema).check(z.maxLength(6)),
  stage: z.nullable(StageSchema),
  lenses: z.array(LensSchema).check(z.maxLength(5)),
  themes: z.array(z.string().check(z.maxLength(60))).check(z.maxLength(10)),
  beneficiaries: z.array(z.string().check(z.maxLength(80))).check(z.maxLength(6)),
  languages: z.array(z.string().check(z.regex(/^[a-z]{2}$/))).check(z.maxLength(6)),
  confidence: z.number().check(z.gte(0), z.lte(1)),
});
export const InitiativeSchema = z.extend(SuggestionSchema, {
  name: z.string().check(z.trim(), z.minLength(1, "Add a name for your initiative."), z.maxLength(200)),
});
export type Initiative = z.infer<typeof SuggestionSchema>;
export const DERIVED_LABELS: Record<DerivedKey, string> = {
  stage: "Stage",
  lenses: "Type of work",
  themes: "Themes",
  beneficiaries: "Who it serves",
  languages: "Languages",
};
export const LENS_LABELS = {
  art_culture: "Art and culture",
  research: "Research",
  technology: "Technology",
  place_based: "Place-based",
  learning: "Learning and education",
  funders: "Funders",
} as const;
export const EMPTY_INITIATIVE: Initiative = {
  name: "",
  locations: [],
  isGlobal: false,
  description: "",
  links: [],
  stage: null,
  lenses: [],
  themes: [],
  beneficiaries: [],
  languages: [],
  confidence: 0,
};
export const PublicEditsSchema = z.partial(
  z.pick(SuggestionSchema, {
    name: true,
    description: true,
    locations: true,
    isGlobal: true,
    links: true,
  }),
);
export const DerivedEditsSchema = z.partial(
  z.pick(SuggestionSchema, {
    stage: true,
    lenses: true,
    themes: true,
    beneficiaries: true,
    languages: true,
  }),
);
export const RunSchema = z.strictObject({
  id: z.uuid(),
  step: z.enum(["initiative", "needs", "offers"]),
  engine: z.enum(["keywords", "browser", "fixture"]),
  model: z.string().check(z.maxLength(80)),
  at: z.iso.datetime(),
  words: z.int().check(z.gte(0)),
  cloudWords: z.literal(0),
  status: z.enum(["complete", "failed", "cancelled"]),
  latencyMs: z.int().check(z.gte(0)),
});
export type AiRun = z.infer<typeof RunSchema>;
/**
 * How long About it can be when written now (DL-111). A card saved before that may hold up to
 * 800 characters, which the schemas still accept so it stays readable and saveable.
 */
export const ABOUT_LIMIT = 400;
/** The four public fields as the describe step shows them. */
export const FieldKeySchema = z.enum(["name", "where", "about", "links"]);
export type FieldKey = z.infer<typeof FieldKeySchema>;
export const RecordFormSchema = z.strictObject({
  name: z.string().check(z.maxLength(200)),
  where: z.string().check(z.maxLength(2000)),
  about: z.string().check(z.maxLength(800)),
  links: z.string().check(z.maxLength(14000)),
});
export type RecordForm = z.infer<typeof RecordFormSchema>;
export const ReviewEditorSchema = z.strictObject({
  value: z.string().check(z.maxLength(20000)),
  lenses: z.array(LensSchema).check(z.maxLength(5)),
  wasKept: z.boolean(),
});
export type ReviewEditor = z.infer<typeof ReviewEditorSchema>;
const AccountBindingSchema = z.strictObject({
  id: z.uuid(),
  owner: z.uuid(),
  revision: z.int().check(z.nonnegative()),
  contentKey: z.string().check(z.maxLength(60000)),
});
const AccountSyncSchema = z.strictObject({
  saved: z.nullable(AccountBindingSchema),
  pending: z.nullable(z.extend(AccountBindingSchema, { requestId: z.uuid() })),
  /**
   * IDs of saved cards deleted from the account. The draft keeps its own ID, so device state
   * keyed by it stays attached, but a Save never reuses a retired ID.
   */
  retired: z.optional(z.array(z.uuid()).check(z.maxLength(20))),
});
/**
 * As many characters as a draft's words can hold once stored. The box takes far fewer by typing
 * or talking (`SAID_LIMIT` in fill.ts). A draft from the released build can hold more than that
 * across its sent answers, and they become the box's own words, so the stored field has room
 * for all of them. The bound is only there so stored data is never unbounded.
 */
export const STORED_SAID_LIMIT = 2_000_000;
export const DeviceDraftSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  revision: z.int().check(z.gte(0)),
  /**
   * A random mark for this exact revision. Two tabs that change the same revision in the same
   * millisecond write the same number and time, and only this tells their versions apart (DL-112).
   * Drafts stored before it have none.
   */
  mark: z.optional(z.uuid()),
  inputVersion: z.int().check(z.gte(0)),
  updatedAt: z.iso.datetime(),
  pendingLink: z.string().check(z.maxLength(2048)),
  answerEdits: z.record(z.uuid(), z.string().check(z.maxLength(20000))),
  reviewEdits: z.partialRecord(DerivedKeySchema, ReviewEditorSchema),
  composer: z.string().check(z.maxLength(STORED_SAID_LIMIT)),
  turns: z.array(TurnSchema),
  links: z.array(LinkSchema).check(z.maxLength(6)),
  attachments: z.array(AttachmentSchema),
  proposal: z.nullable(SuggestionSchema),
  proposalVersion: z.nullable(z.int()),
  publicEdits: PublicEditsSchema,
  derivedEdits: DerivedEditsSchema,
  kept: z.array(DerivedKeySchema),
  removed: z.array(DerivedKeySchema),
  assistant: z.enum(["keywords", "browser", "none"]),
  assistantPromptDismissed: z.boolean(),
  lastBuild: z.nullable(
    z.strictObject({
      engine: z.enum(["keywords", "browser", "manual"]),
      unreadFiles: z.int().check(z.gte(0)),
      sourceCharacters: z.int().check(z.gte(0)),
      files: z._default(z.array(FileReadSchema), []),
      fallback: z.boolean(),
    }),
  ),
  confirmed: z.nullable(InitiativeSchema),
  form: z.nullable(RecordFormSchema),
  /**
   * The fields that still hold what Weave filled in from the person's words. A field leaves the
   * list when the person changes it, and a later fill never writes over one that left (DL-110).
   */
  filled: z._default(z.array(FieldKeySchema).check(z.maxLength(4)), []),
  runs: z.array(RunSchema),
  mode: z.enum(["conversation", "fields"]),
  needs: z._default(AskStepSchema, emptyAskStep),
  offers: z._default(AskStepSchema, emptyAskStep),
  funding: z._default(FundingDetailsSchema, emptyFundingDetails),
  partnerLeads: z._default(
    z.array(z.string().check(z.regex(/^[a-z0-9-]+:[a-z0-9-]+$/u), z.maxLength(100))).check(z.maxLength(200)),
    [],
  ),
  account: z._default(AccountSyncSchema, () => ({ saved: null, pending: null })),
});
export type DeviceDraft = z.infer<typeof DeviceDraftSchema>;

export const QUESTIONS = [
  "What is your initiative called, and what do you do?",
  "Where does most of your work happen?",
  "Anything else to add about the work you do?",
  "Anything else to add? You can add a file or link at any time.",
  "You can build your card now, or add more.",
] as const;
export function nextQuestion(draft: DeviceDraft): string {
  return QUESTIONS[Math.min(draft.turns.length, QUESTIONS.length - 1)]!;
}
export function newDraft(): DeviceDraft {
  return {
    version: 1,
    id: crypto.randomUUID(),
    revision: 0,
    mark: crypto.randomUUID(),
    inputVersion: 0,
    updatedAt: new Date().toISOString(),
    pendingLink: "",
    answerEdits: {},
    reviewEdits: {},
    composer: "",
    turns: [],
    links: [],
    attachments: [],
    proposal: null,
    proposalVersion: null,
    publicEdits: {},
    derivedEdits: {},
    kept: [],
    removed: [],
    assistant: "keywords",
    assistantPromptDismissed: false,
    lastBuild: null,
    confirmed: null,
    form: null,
    filled: [],
    runs: [],
    mode: "fields",
    needs: emptyAskStep(),
    offers: emptyAskStep(),
    funding: emptyFundingDetails(),
    partnerLeads: [],
    account: { saved: null, pending: null },
  };
}
export function revise(draft: DeviceDraft, change: Partial<DeviceDraft>, input = false): DeviceDraft {
  const links = [...new Set(change.links ?? change.publicEdits?.links ?? draft.links)];
  const publicEdits = { ...(change.publicEdits ?? draft.publicEdits), links };
  const form = change.form === undefined ? draft.form : change.form;
  return DeviceDraftSchema.parse({
    ...draft,
    ...change,
    links,
    publicEdits,
    form: form && change.links ? { ...form, links: links.join("\n") } : form,
    revision: draft.revision + 1,
    mark: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    ...(input ? { inputVersion: draft.inputVersion + 1, confirmed: null } : {}),
  });
}
export function addAnswer(draft: DeviceDraft, text: string, via: Turn["via"] = "typed"): DeviceDraft {
  return revise(
    draft,
    {
      turns: [
        ...draft.turns,
        { id: crypto.randomUUID(), prompt: nextQuestion(draft), text: text.trim(), via },
      ],
      composer: "",
    },
    true,
  );
}
export function applyReview(draft: DeviceDraft, base: Initiative): Initiative {
  const result = { ...base, ...draft.publicEdits, ...draft.derivedEdits, links: [...draft.links] };
  for (const key of draft.removed) {
    if (key === "stage") result.stage = null;
    else result[key] = [];
  }
  return SuggestionSchema.parse(result);
}
export function reviewedProposal(draft: DeviceDraft): Initiative | null {
  return draft.proposal ? applyReview(draft, draft.proposal) : null;
}
/** Derived details still in pencil that hold a value, so a decision is owed. Empty details owe nothing. */
export function pendingDetails(draft: DeviceDraft): DerivedKey[] {
  const fields = reviewedProposal(draft);
  if (!fields) return [];
  return (Object.keys(DERIVED_LABELS) as DerivedKey[]).filter(
    (key) =>
      !draft.kept.includes(key) &&
      !draft.removed.includes(key) &&
      (key === "stage" ? fields.stage !== null : fields[key].length > 0),
  );
}
export function confirmDraft(draft: DeviceDraft): DeviceDraft {
  if (draft.proposalVersion !== draft.inputVersion)
    throw new Error("Your words changed. Build the card again before continuing.");
  if (Object.keys(draft.reviewEdits).length)
    throw new Error("Keep or cancel open detail changes before continuing.");
  const fields = InitiativeSchema.parse(reviewedProposal(draft));
  if (pendingDetails(draft).length)
    throw new Error("Keep, change or remove each detail in pencil before continuing.");
  return revise(draft, { confirmed: fields });
}
export function modelConstraint(contract: z.ZodMiniType = SuggestionSchema): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(contract);
  const removeLengths = (value: unknown): void => {
    if (value && typeof value === "object") {
      delete (value as Record<string, unknown>).maxLength;
      for (const child of Object.values(value)) removeLengths(child);
    }
  };
  removeLengths(schema);
  return schema;
}
