import { parseBundle } from "./catalog.ts";
import { evaluateCatalog } from "./engine.ts";
import { z } from "../validation.ts";
const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  workCountries: z.array(z.string()),
  benefitCountries: z.array(z.string()),
  applicantBaseCountry: z.string(),
  registrationCountry: z.string(),
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
  goalMin: z.number().nullable(),
  goalMax: z.number().nullable(),
  currency: z.string(),
  usWorkStates: z.array(z.string()),
  usBenefitStates: z.array(z.string()),
  programAnswers: z.record(
    z.string(),
    z.object({ answer: z.enum(["yes", "no"]), sourceCheckedOn: z.string() }),
  ),
});
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = z
      .object({ catalog: z.unknown(), rules: z.unknown(), conditions: z.unknown(), project: ProjectSchema })
      .parse(event.data);
    const bundle = parseBundle(request.catalog, request.rules, request.conditions);
    self.postMessage({ ok: true, results: evaluateCatalog(bundle, request.project) });
  } catch {
    self.postMessage({ ok: false });
  }
};
