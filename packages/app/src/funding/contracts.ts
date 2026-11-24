import { z } from "../validation.ts";

const strings = z.array(z.string());
const identifier = z.string().check(z.regex(/^[a-zA-Z0-9_-]+$/u));
export const EvidenceSchema = z.looseObject({
  url: z.string(),
  checkedOn: z.string(),
  fields: z.optional(strings),
});
export const ProgramSchema = z.looseObject({
  id: identifier,
  name: z.string(),
  instrument: z.string(),
  focus: strings,
  beneficiaries: strings,
  geography: z.looseObject({
    scope: z.string(),
    workCountries: strings,
    applicantCountries: strings,
    exclusions: strings,
  }),
  applicants: z.looseObject({
    types: strings,
    fiscalSponsorship: z.string(),
    requirements: strings,
    exclusions: strings,
  }),
  award: z.looseObject({
    currency: z.nullable(z.string()),
    min: z.nullable(z.number()),
    max: z.nullable(z.number()),
    basis: z.string(),
    note: z.string(),
  }),
  application: z.looseObject({
    route: z.string(),
    url: z.nullable(z.string()),
    opensOn: z.nullable(z.string()),
    closesOn: z.nullable(z.string()),
    deadlineInstant: z.nullable(z.string()),
    note: z.string(),
  }),
  evidence: z.array(EvidenceSchema),
  unknowns: strings,
});
export const FundSchema = z.looseObject({
  id: identifier,
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  sectors: strings,
  regions: strings,
  approaches: strings,
  access: z.string(),
  amount: z.string(),
  timing: z.string(),
  deadlineDate: z.nullable(z.string()),
  deadlineInstant: z.nullable(z.string()),
  verifiedOn: z.nullable(z.string()),
  website: z.string(),
  evidenceUrl: z.string(),
  sourceWarnings: z.optional(z.array(z.looseObject({ url: z.string() }))),
  enrichment: z.looseObject({
    reviewStatus: z.string(),
    focus: z.optional(strings),
    programs: z.array(ProgramSchema),
    sources: z.array(z.looseObject({ url: z.string(), checkedOn: z.optional(z.string()) })),
  }),
});
export const RuleSchema = z.looseObject({
  fundId: identifier,
  programId: identifier,
  field: z.string(),
  operator: z.enum(["only", "exclude"]),
  values: strings,
  reason: z.string(),
  sourceUrl: z.string(),
  checkedOn: z.string(),
});
export const ConditionSchema = z.looseObject({
  fundId: identifier,
  programId: identifier,
  id: identifier,
  category: z.optional(z.string()),
  requirement: z.string(),
  kind: z.enum(["prerequisite", "priority"]),
  sourceUrl: z.string(),
  checkedOn: z.string(),
});
export const CatalogSchema = z.looseObject({
  funds: z.array(FundSchema),
  compiledAt: z.string(),
  /** The latest whole-record research date. Partial reviews do not move it; see researchSnapshotDate. */
  researchCheckedOn: z.optional(z.string()),
});
export const RulesSchema = z.object({ version: z.literal(1), rules: z.array(RuleSchema) });
export const ConditionsSchema = z.object({ version: z.literal(1), conditions: z.array(ConditionSchema) });
export type Fund = z.infer<typeof FundSchema>;
export type Program = z.infer<typeof ProgramSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
export type Bundle = {
  catalog: Catalog;
  rules: z.infer<typeof RuleSchema>[];
  conditions: z.infer<typeof ConditionSchema>[] | null;
};
export interface Entry {
  id: string;
  fund: Fund;
  program: Program | null;
}

export const FundingFormSchema = z.strictObject({
  workCountries: z.string().check(z.maxLength(800)),
  benefitCountries: z.string().check(z.maxLength(800)),
  applicantBaseCountry: z.string().check(z.maxLength(2)),
  registrationCountry: z.string().check(z.maxLength(2)),
  applicantType: z.enum([
    "unknown",
    "nonprofit",
    "informal",
    "individual",
    "business",
    "university",
    "public-body",
  ]),
  fundingInstruments: z.array(z.enum(["grant", "prize", "investment", "fellowship", "scholarship"])),
  goalMin: z.string().check(z.maxLength(60)),
  goalMax: z.string().check(z.maxLength(60)),
  currency: z.string().check(z.maxLength(3)),
  usWorkStates: z.string().check(z.maxLength(200)),
  usBenefitStates: z.string().check(z.maxLength(200)),
});
export type FundingForm = z.infer<typeof FundingFormSchema>;
export const emptyFundingForm = (): FundingForm => ({
  workCountries: "",
  benefitCountries: "",
  applicantBaseCountry: "",
  registrationCountry: "",
  applicantType: "unknown",
  fundingInstruments: [],
  goalMin: "",
  goalMax: "",
  currency: "",
  usWorkStates: "",
  usBenefitStates: "",
});
export const FundingDetailsSchema = z.strictObject({
  form: z._default(FundingFormSchema, emptyFundingForm),
  editor: z._default(z.nullable(FundingFormSchema), null),
  programAnswers: z._default(
    z.record(z.string(), z.strictObject({ answer: z.enum(["yes", "no"]), sourceCheckedOn: z.string() })),
    {},
  ),
});
export const emptyFundingDetails = () => FundingDetailsSchema.parse({});
export type FundingDetails = z.infer<typeof FundingDetailsSchema>;

export const EvaluationSchema = z.object({
  documentId: z.string(),
  group: z.string(),
  score: z.number(),
  thematicFit: z.object({
    score: z.nullable(z.number()),
    band: z.enum(["unknown", "strong", "relevant", "partial", "limited"]),
    label: z.string(),
    /** The distinct specific topics the program and the initiative share, which grade the score. */
    evidenceTerms: strings,
  }),
  readiness: z.object({ status: z.string(), label: z.string() }),
  shared: strings,
  activeLimits: z.array(z.object({ maximum: z.number(), reason: z.string() })),
  geographic: z.object({ reason: z.optional(z.string()) }),
  award: z.string(),
  access: z.string(),
  eligibility: z.object({
    status: z.string(),
    programs: z.array(
      z.object({
        programId: z.string(),
        checks: z.array(
          z.looseObject({
            field: z.string(),
            outcome: z.string(),
            reason: z.optional(z.string()),
            requirement: z.optional(z.string()),
            sourceUrl: z.optional(z.string()),
          }),
        ),
      }),
    ),
  }),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
