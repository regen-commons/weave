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
export const LensSchema = z.enum(["art_culture", "research", "technology", "place_based", "funders"]);
export const DerivedKeySchema = z.enum(["stage", "lenses", "themes", "beneficiaries", "languages"]);
export type DerivedKey = z.infer<typeof DerivedKeySchema>;
export const SuggestionSchema = z.strictObject({
  name: z.string().max(200),
  locations: z.array(z.string().min(1).max(120)).max(8),
  isGlobal: z.boolean(),
  description: z.string().max(800),
  links: z.array(LinkSchema).max(6),
  stage: StageSchema.nullable(),
  lenses: z.array(LensSchema).max(5),
  themes: z.array(z.string().max(60)).max(10),
  beneficiaries: z.array(z.string().max(80)).max(6),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).max(6),
  confidence: z.number().min(0).max(1),
});
export const InitiativeSchema = SuggestionSchema.extend({
  name: z.string().trim().min(1, "Add a name for your initiative.").max(200),
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
  place_based: "Place-based community",
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
export const PublicEditsSchema = SuggestionSchema.pick({
  name: true,
  description: true,
  locations: true,
  isGlobal: true,
  links: true,
}).partial();
export const DerivedEditsSchema = SuggestionSchema.pick({
  stage: true,
  lenses: true,
  themes: true,
  beneficiaries: true,
  languages: true,
}).partial();
export const RunSchema = z.strictObject({
  id: z.string().uuid(),
  step: z.enum(["initiative", "needs", "offers"]),
  engine: z.enum(["keywords", "browser", "fixture"]),
  model: z.string().max(80),
  at: z.string().datetime(),
  words: z.number().int().min(0),
  cloudWords: z.literal(0),
  status: z.enum(["complete", "failed", "cancelled"]),
  latencyMs: z.number().int().min(0),
});
export type AiRun = z.infer<typeof RunSchema>;
export const RecordFormSchema = z.strictObject({
  name: z.string().max(200),
  where: z.string().max(2000),
  about: z.string().max(800),
  links: z.string().max(14000),
});
export type RecordForm = z.infer<typeof RecordFormSchema>;
export const ReviewEditorSchema = z.strictObject({
  value: z.string().max(20000),
  lenses: z.array(LensSchema).max(5),
  wasKept: z.boolean(),
});
export type ReviewEditor = z.infer<typeof ReviewEditorSchema>;
const AccountBindingSchema = z.strictObject({
  id: z.string().uuid(),
  owner: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  contentKey: z.string().max(60000),
});
const AccountSyncSchema = z.strictObject({
  saved: AccountBindingSchema.nullable(),
  pending: AccountBindingSchema.extend({ requestId: z.string().uuid() }).nullable(),
});
export const DeviceDraftSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  inputVersion: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  pendingLink: z.string().max(2048),
  answerEdits: z.record(z.string().uuid(), z.string().max(20000)),
  reviewEdits: z.partialRecord(DerivedKeySchema, ReviewEditorSchema),
  composer: z.string().max(20000),
  turns: z.array(TurnSchema),
  links: z.array(LinkSchema).max(6),
  attachments: z.array(AttachmentSchema),
  proposal: SuggestionSchema.nullable(),
  proposalVersion: z.number().int().nullable(),
  publicEdits: PublicEditsSchema,
  derivedEdits: DerivedEditsSchema,
  kept: z.array(DerivedKeySchema),
  removed: z.array(DerivedKeySchema),
  assistant: z.enum(["keywords", "browser", "none"]),
  assistantPromptDismissed: z.boolean(),
  lastBuild: z
    .strictObject({
      engine: z.enum(["keywords", "browser", "manual"]),
      unreadFiles: z.number().int().min(0),
      sourceCharacters: z.number().int().min(0),
      files: z.array(FileReadSchema).default([]),
      fallback: z.boolean(),
    })
    .nullable(),
  confirmed: InitiativeSchema.nullable(),
  form: RecordFormSchema.nullable(),
  runs: z.array(RunSchema),
  mode: z.enum(["conversation", "fields"]),
  needs: AskStepSchema.default(emptyAskStep),
  offers: AskStepSchema.default(emptyAskStep),
  funding: FundingDetailsSchema.default(emptyFundingDetails),
  partnerLeads: z.array(z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/u).max(100)).max(200).default([]),
  account: AccountSyncSchema.default(() => ({ saved: null, pending: null })),
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
    runs: [],
    mode: "conversation",
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
/** Keep card: one confirmation turns every pending detail to ink (T5). Removed details stay removed. */
export function keepPendingDetails(draft: DeviceDraft): DeviceDraft {
  const fields = reviewedProposal(draft);
  const pending = pendingDetails(draft);
  if (!fields || !pending.length) return draft;
  return revise(draft, {
    kept: [...new Set([...draft.kept, ...pending])],
    derivedEdits: { ...draft.derivedEdits, ...Object.fromEntries(pending.map((key) => [key, fields[key]])) },
    confirmed: null,
  });
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
export function modelConstraint(contract: z.ZodType = SuggestionSchema): Record<string, unknown> {
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

export function assertBuildCurrent(draft: DeviceDraft, inputVersion: number, signal: AbortSignal): void {
  signal.throwIfAborted();
  if (draft.inputVersion !== inputVersion) throw new DOMException("Words changed", "AbortError");
}
