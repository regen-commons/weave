import { z } from "../validation.ts";

const strings = z.array(z.string());
const identifier = z.string().regex(/^[a-zA-Z0-9_-]+$/u);
export const EvidenceSchema = z.looseObject({
  url: z.string(),
  checkedOn: z.string(),
  fields: strings.optional(),
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
    currency: z.string().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    basis: z.string(),
    note: z.string(),
  }),
  application: z.looseObject({
    route: z.string(),
    url: z.string().nullable(),
    opensOn: z.string().nullable(),
    closesOn: z.string().nullable(),
    deadlineInstant: z.string().nullable(),
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
  deadlineDate: z.string().nullable(),
  deadlineInstant: z.string().nullable(),
  verifiedOn: z.string().nullable(),
  website: z.string(),
  evidenceUrl: z.string(),
  sourceWarnings: z.array(z.looseObject({ url: z.string() })).optional(),
  enrichment: z.looseObject({
    reviewStatus: z.string(),
    focus: strings.optional(),
    programs: z.array(ProgramSchema),
    sources: z.array(z.looseObject({ url: z.string(), checkedOn: z.string().optional() })),
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
  category: z.string().optional(),
  requirement: z.string(),
  kind: z.enum(["prerequisite", "priority"]),
  sourceUrl: z.string(),
  checkedOn: z.string(),
});
export const CatalogSchema = z.looseObject({
  funds: z.array(FundSchema),
  compiledAt: z.string(),
  researchCheckedOn: z.string(),
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
  workCountries: z.string().max(800),
  benefitCountries: z.string().max(800),
  applicantBaseCountry: z.string().max(2),
  registrationCountry: z.string().max(2),
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
  goalMin: z.string().max(60),
  goalMax: z.string().max(60),
  currency: z.string().max(3),
  usWorkStates: z.string().max(200),
  usBenefitStates: z.string().max(200),
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
  form: FundingFormSchema.default(emptyFundingForm),
  editor: FundingFormSchema.nullable().default(null),
  programAnswers: z
    .record(z.string(), z.strictObject({ answer: z.enum(["yes", "no"]), sourceCheckedOn: z.string() }))
    .default({}),
});
export const emptyFundingDetails = () => FundingDetailsSchema.parse({});
export type FundingDetails = z.infer<typeof FundingDetailsSchema>;

export const EvaluationSchema = z.object({
  documentId: z.string(),
  group: z.string(),
  score: z.number(),
  thematicFit: z.object({
    score: z.number().nullable(),
    band: z.enum(["unknown", "strong", "relevant", "partial", "limited"]),
    label: z.string(),
  }),
  readiness: z.object({ status: z.string(), label: z.string() }),
  shared: strings,
  activeLimits: z.array(z.object({ maximum: z.number(), reason: z.string() })),
  geographic: z.object({ reason: z.string().optional() }),
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
            reason: z.string().optional(),
            requirement: z.string().optional(),
            sourceUrl: z.string().optional(),
          }),
        ),
      }),
    ),
  }),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
