import { z } from "../validation.ts";
import { CAPITALS } from "../capitals.ts";
import { AttachmentSchema, FileReadSchema, TurnSchema, LinkSchema } from "../describe/source-contracts.ts";

export type AskKind = "needs" | "offers";
export const ASK_LIMIT = 5;
export const CapitalFormSchema = z.enum(CAPITALS.map((capital) => capital.key));
export const ExchangeTermSchema = z.enum(["gift", "exchange", "paid", "commitment", "open"]);
export const ScopeSchema = z.enum(["here", "region", "anywhere"]);
export const UrgencySchema = z.enum(["now", "this_quarter", "this_year", "ongoing"]);
export const StatusSchema = z.enum(["open", "met", "withdrawn", "expired"]);
export const TERMS = {
  gift: "Gift",
  exchange: "Exchange",
  paid: "Paid",
  commitment: "A promise for later",
  open: "Open to anything",
} as const;
export const SCOPES = { here: "Here", region: "Our region", anywhere: "Anywhere" } as const;
export const URGENCY = {
  now: "Now",
  this_quarter: "This quarter",
  this_year: "This year",
  ongoing: "Ongoing",
} as const;
export const STATUS = { open: "Open", met: "Met", withdrawn: "Withdrawn", expired: "Expired" } as const;
const AmountSchema = z
  .strictObject({
    min: z.number().finite().nonnegative().nullable(),
    max: z.number().finite().nonnegative().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .refine(
    (value) =>
      (value.min !== null || value.max !== null) &&
      (value.min === null || value.max === null || value.min <= value.max),
    "Add an amount or range in order.",
  );
export const AskSuggestionSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(140),
    description: z.string().max(600).nullable(),
    capitalForms: z.array(CapitalFormSchema).max(8),
    amount: AmountSchema.nullable(),
    timeframe: z.string().max(200).nullable(),
    urgency: UrgencySchema.nullable(),
    placeScope: ScopeSchema,
    exchangeTerms: z.array(ExchangeTermSchema).min(1).max(5),
    purpose: z.string().max(400).nullable(),
    capacity: z.string().max(200).nullable(),
    audience: z.string().max(200).nullable(),
    status: StatusSchema,
  })
  .refine(
    (value) =>
      new Set(value.capitalForms).size === value.capitalForms.length &&
      new Set(value.exchangeTerms).size === value.exchangeTerms.length,
    "Choose each kind and term once.",
  )
  .refine(
    (value) => !value.exchangeTerms.includes("open") || value.exchangeTerms.length === 1,
    "Open to anything includes the other terms.",
  )
  .refine(
    (value) => value.amount === null || value.capitalForms.includes("financial"),
    "Amounts belong to Financial support.",
  );
export const AskSchema = AskSuggestionSchema.refine(
  (value) => value.capitalForms.length > 0,
  "Choose at least one kind of support.",
);
export type AskFields = z.infer<typeof AskSuggestionSchema>;
export const EMPTY_ASK: AskFields = {
  title: "",
  description: null,
  capitalForms: [],
  amount: null,
  timeframe: null,
  urgency: null,
  placeScope: "anywhere",
  exchangeTerms: ["open"],
  purpose: null,
  capacity: null,
  audience: null,
  status: "open",
};
export const AskFormSchema = z.strictObject({
  title: z.string().max(140),
  description: z.string().max(600),
  capitalForms: z.array(CapitalFormSchema).max(8),
  amountMin: z.string().max(60),
  amountMax: z.string().max(60),
  currency: z.string().max(3),
  timeframe: z.string().max(200),
  urgency: z.union([UrgencySchema, z.literal("")]),
  placeScope: ScopeSchema,
  exchangeTerms: z.array(ExchangeTermSchema).max(5),
  purpose: z.string().max(400),
  capacity: z.string().max(200),
  audience: z.string().max(200),
  status: StatusSchema,
});
export type AskForm = z.infer<typeof AskFormSchema>;
export const AskItemSchema = z
  .strictObject({
    id: z.string().uuid(),
    sourceKey: z.string().max(100).nullable(),
    fingerprint: z.string(),
    decision: z.enum(["pencil", "kept", "removed"]),
    decisionBeforeRemove: z.enum(["pencil", "kept"]).nullable().default(null),
    value: AskSuggestionSchema,
  })
  .refine(
    (item) => item.decision !== "kept" || AskSchema.safeParse(item.value).success,
    "Kept cards need a kind of support.",
  );
export type AskItem = z.infer<typeof AskItemSchema>;
export const AskStepSchema = z
  .strictObject({
    mode: z.enum(["conversation", "manual"]).default("conversation"),
    turns: z.array(TurnSchema),
    composer: z.string().max(20000),
    answerEdits: z.record(z.string().uuid(), z.string().max(20000)),
    attachments: z.array(AttachmentSchema),
    links: z.array(LinkSchema).max(6),
    pendingLink: z.string().max(2048),
    items: z.array(AskItemSchema),
    editor: z.strictObject({ id: z.string().uuid().nullable(), form: AskFormSchema }).nullable(),
    inputVersion: z.number().int().nonnegative(),
    builtVersion: z.number().int().nonnegative().nullable(),
    reviewedVersion: z.number().int().nonnegative().nullable(),
    heard: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
    moneyNudgeSeen: z.boolean(),
    lastBuild: z
      .strictObject({
        engine: z.enum(["keywords", "browser"]),
        fallback: z.boolean(),
        unreadFiles: z.number().int().nonnegative(),
        files: z.array(FileReadSchema),
      })
      .nullable(),
  })
  .refine(
    (step) => step.items.filter((item) => item.decision !== "removed").length <= ASK_LIMIT,
    "Five is the limit.",
  )
  .refine(
    (step) => new Set(step.items.map((item) => item.id)).size === step.items.length,
    "Card identities must be unique.",
  );
export type AskStep = z.infer<typeof AskStepSchema>;
export function emptyAskStep(): AskStep {
  return {
    mode: "conversation",
    turns: [],
    composer: "",
    answerEdits: {},
    attachments: [],
    links: [],
    pendingLink: "",
    items: [],
    editor: null,
    inputVersion: 0,
    builtVersion: null,
    reviewedVersion: null,
    heard: 0,
    omitted: 0,
    moneyNudgeSeen: false,
    lastBuild: null,
  };
}
export const AskExtractionSchema = z
  .strictObject({
    items: z.array(z.strictObject({ sourceKey: z.string().max(100), value: AskSuggestionSchema })).max(5),
    heard: z.number().int().nonnegative(),
  })
  .refine(
    (result) => result.items.length === Math.min(result.heard, ASK_LIMIT),
    "Return every heard card up to the five-card limit.",
  );
export type AskExtraction = z.infer<typeof AskExtractionSchema>;
export const AskChunkSchema = z.strictObject({ key: z.string().max(100), text: z.string() });
export type AskChunk = z.infer<typeof AskChunkSchema>;
export function parseExtraction(value: unknown, chunks: AskChunk[]): AskExtraction {
  const result = AskExtractionSchema.parse(value);
  const keys = new Set(chunks.map((chunk) => chunk.key));
  if (
    result.items.some((item) => !keys.has(item.sourceKey)) ||
    new Set(result.items.map((item) => item.sourceKey)).size !== result.items.length ||
    result.heard > chunks.length
  )
    throw new Error("Unknown, repeated or excessive source references.");
  return result;
}
