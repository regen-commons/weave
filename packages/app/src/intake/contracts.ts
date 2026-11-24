import { ASK_LIMIT, STORED_ASK_LIMIT } from "@weave/api/account-contract";
import { z } from "../validation.ts";
import { CAPITALS } from "../capitals.ts";
import { AttachmentSchema, FileReadSchema, TurnSchema, LinkSchema } from "../describe/source-contracts.ts";

export type AskKind = "needs" | "offers";
/**
 * Four needs and four offers can be added (DL-111). A list stored under the earlier limit of
 * five stays valid, so the stored limit is what the schema checks and `ASK_LIMIT` is what adding checks.
 */
export { ASK_LIMIT, STORED_ASK_LIMIT };
export const ASK_LIMIT_HELP = "Four is the limit. Remove one to add another.";
/** How long a need or offer's description can be when written now. Earlier ones may be longer. */
export const ASK_DESCRIPTION_LIMIT = 200;
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
// Classic Zod's `.finite()` did nothing: a number schema already refuses Infinity and NaN.
const AmountSchema = z
  .strictObject({
    min: z.nullable(z.number().check(z.nonnegative())),
    max: z.nullable(z.number().check(z.nonnegative())),
    currency: z.string().check(z.regex(/^[A-Z]{3}$/)),
  })
  .check(
    z.refine(
      (value) =>
        (value.min !== null || value.max !== null) &&
        (value.min === null || value.max === null || value.min <= value.max),
      "Add an amount or range in order.",
    ),
  );
export const AskSuggestionSchema = z
  .strictObject({
    title: z.string().check(z.trim(), z.minLength(1), z.maxLength(140)),
    description: z.nullable(z.string().check(z.maxLength(600))),
    capitalForms: z.array(CapitalFormSchema).check(z.maxLength(8)),
    amount: z.nullable(AmountSchema),
    timeframe: z.nullable(z.string().check(z.maxLength(200))),
    urgency: z.nullable(UrgencySchema),
    placeScope: ScopeSchema,
    exchangeTerms: z.array(ExchangeTermSchema).check(z.minLength(1), z.maxLength(5)),
    purpose: z.nullable(z.string().check(z.maxLength(400))),
    capacity: z.nullable(z.string().check(z.maxLength(200))),
    audience: z.nullable(z.string().check(z.maxLength(200))),
    status: StatusSchema,
  })
  .check(
    z.refine(
      (value) =>
        new Set(value.capitalForms).size === value.capitalForms.length &&
        new Set(value.exchangeTerms).size === value.exchangeTerms.length,
      "Choose each kind and term once.",
    ),
    z.refine(
      (value) => !value.exchangeTerms.includes("open") || value.exchangeTerms.length === 1,
      "Open to anything includes the other terms.",
    ),
    z.refine(
      (value) => value.amount === null || value.capitalForms.includes("financial"),
      "Amounts belong to Financial support.",
    ),
  );
export const AskSchema = AskSuggestionSchema.check(
  z.refine((value) => value.capitalForms.length > 0, "Choose at least one kind of support."),
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
  title: z.string().check(z.maxLength(140)),
  description: z.string().check(z.maxLength(600)),
  capitalForms: z.array(CapitalFormSchema).check(z.maxLength(8)),
  amountMin: z.string().check(z.maxLength(60)),
  amountMax: z.string().check(z.maxLength(60)),
  currency: z.string().check(z.maxLength(3)),
  timeframe: z.string().check(z.maxLength(200)),
  urgency: z.union([UrgencySchema, z.literal("")]),
  placeScope: ScopeSchema,
  exchangeTerms: z.array(ExchangeTermSchema).check(z.maxLength(5)),
  purpose: z.string().check(z.maxLength(400)),
  capacity: z.string().check(z.maxLength(200)),
  audience: z.string().check(z.maxLength(200)),
  status: StatusSchema,
});
export type AskForm = z.infer<typeof AskFormSchema>;
/** A kept entry may have no kind of support on the device. `AskSchema` is the rule for sharing one. */
export const AskItemSchema = z.strictObject({
  id: z.uuid(),
  sourceKey: z.nullable(z.string().check(z.maxLength(100))),
  fingerprint: z.string(),
  decision: z.enum(["pencil", "kept", "removed"]),
  decisionBeforeRemove: z._default(z.nullable(z.enum(["pencil", "kept"])), null),
  value: AskSuggestionSchema,
});
export type AskItem = z.infer<typeof AskItemSchema>;
export const AskStepSchema = z
  .strictObject({
    mode: z._default(z.enum(["conversation", "manual"]), "conversation"),
    turns: z.array(TurnSchema),
    composer: z.string().check(z.maxLength(20000)),
    answerEdits: z.record(z.uuid(), z.string().check(z.maxLength(20000))),
    attachments: z.array(AttachmentSchema),
    links: z.array(LinkSchema).check(z.maxLength(6)),
    pendingLink: z.string().check(z.maxLength(2048)),
    items: z.array(AskItemSchema),
    editor: z.nullable(z.strictObject({ id: z.nullable(z.uuid()), form: AskFormSchema })),
    inputVersion: z.int().check(z.nonnegative()),
    builtVersion: z.nullable(z.int().check(z.nonnegative())),
    reviewedVersion: z.nullable(z.int().check(z.nonnegative())),
    heard: z.int().check(z.nonnegative()),
    omitted: z.int().check(z.nonnegative()),
    moneyNudgeSeen: z.boolean(),
    lastBuild: z.nullable(
      z.strictObject({
        engine: z.enum(["keywords", "browser"]),
        fallback: z.boolean(),
        unreadFiles: z.int().check(z.nonnegative()),
        files: z.array(FileReadSchema),
      }),
    ),
  })
  .check(
    z.refine(
      (step) => step.items.filter((item) => item.decision !== "removed").length <= STORED_ASK_LIMIT,
      "Four is the limit.",
    ),
    z.refine(
      (step) => new Set(step.items.map((item) => item.id)).size === step.items.length,
      "Card identities must be unique.",
    ),
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
    items: z
      .array(z.strictObject({ sourceKey: z.string().check(z.maxLength(100)), value: AskSuggestionSchema }))
      .check(z.maxLength(ASK_LIMIT)),
    heard: z.int().check(z.nonnegative()),
  })
  .check(
    z.refine(
      (result) => result.items.length === Math.min(result.heard, ASK_LIMIT),
      "Return every heard card up to the four-card limit.",
    ),
  );
export type AskExtraction = z.infer<typeof AskExtractionSchema>;
export const AskChunkSchema = z.strictObject({ key: z.string().check(z.maxLength(100)), text: z.string() });
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
