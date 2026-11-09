import { COUNTRIES, US_STATES } from "../../../../dist/storage.mjs";
import { FundingFormSchema, type FundingDetails, type FundingForm } from "./contracts.ts";
import type { DeviceDraft } from "../describe/contracts.ts";
const codes = (text: string) => [
  ...new Set(
    text
      .toUpperCase()
      .split(/[\s,;]+/u)
      .filter(Boolean),
  ),
];
export function projectFrom(draft: Pick<DeviceDraft, "id" | "confirmed" | "funding">) {
  if (!draft.confirmed) return null;
  const form = FundingFormSchema.parse(draft.funding.form);
  const countries = (text: string) => {
    const values = codes(text);
    if (values.some((value) => !COUNTRIES.includes(value)))
      throw new Error("Use two-letter country codes from the list.");
    return values;
  };
  const singleCountry = (text: string) => {
    const value = text.toUpperCase().trim();
    countries(value);
    return value;
  };
  const workCountries = countries(form.workCountries),
    benefitCountries = countries(form.benefitCountries);
  const states = (text: string, places: string[]) => {
    const values = codes(text);
    if (values.some((value) => !Object.hasOwn(US_STATES, value)) || (values.length && !places.includes("US")))
      throw new Error("Use US state codes only with US as the corresponding country.");
    return values;
  };
  const amount = (text: string) => {
    if (!text.trim()) return null;
    if (!/^\d+(?:\.\d+)?$/u.test(text.trim()) || !Number.isFinite(Number(text)))
      throw new Error("Use non-negative amounts with a dot for decimals, without grouping commas.");
    return Number(text);
  };
  const goalMin = amount(form.goalMin),
    goalMax = amount(form.goalMax),
    currency = form.currency.toUpperCase().trim();
  if (goalMin !== null && goalMax !== null && goalMin > goalMax)
    throw new Error("Put the funding range in order.");
  if ((goalMin !== null || goalMax !== null || currency) && !/^[A-Z]{3}$/u.test(currency))
    throw new Error("Add a three-letter currency code with your funding goal.");
  return {
    id: draft.id,
    name: draft.confirmed.name,
    description: draft.confirmed.description,
    tags: draft.confirmed.themes,
    workCountries,
    benefitCountries,
    applicantBaseCountry: singleCountry(form.applicantBaseCountry),
    registrationCountry: singleCountry(form.registrationCountry),
    applicantType: form.applicantType,
    fundingInstruments: form.fundingInstruments,
    goalMin,
    goalMax,
    currency,
    usWorkStates: states(form.usWorkStates, workCountries),
    usBenefitStates: states(form.usBenefitStates, benefitCountries),
    programAnswers: draft.funding.programAnswers,
  };
}
export function keepFundingForm(draft: DeviceDraft): FundingDetails {
  if (!draft.funding.editor) return draft.funding;
  const next = { ...draft.funding, form: draft.funding.editor, editor: null };
  projectFrom({ ...draft, funding: next });
  return next;
}
export function editFundingForm(details: FundingDetails, form: FundingForm): FundingDetails {
  return { ...details, editor: FundingFormSchema.parse(form) };
}
