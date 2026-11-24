import { COUNTRIES, US_STATES } from "../../../../dist/storage.mjs";
import { FundingFormSchema, type FundingDetails, type FundingForm } from "./contracts.ts";
import { DeviceDraftSchema, type DeviceDraft } from "../describe/contracts.ts";
import { keptAsks } from "../intake/finish.ts";
import { z } from "../validation.ts";

/** A detail for funding the matcher can take as typed: everything but the choices made by picking. */
export type FundingFormField = Exclude<keyof FundingForm, "applicantType" | "fundingInstruments">;
/** Why the details for funding cannot be kept, and the one field it is about (DL-127). */
export class FundingFormProblem extends Error {
  readonly field: FundingFormField;
  constructor(field: FundingFormField, message: string) {
    super(message);
    this.field = field;
  }
}
const codes = (text: string) => [
  ...new Set(
    text
      .toUpperCase()
      .split(/[\s,;]+/u)
      .filter(Boolean),
  ),
];
/**
 * The words of the needs and offers the person kept, which Funding reads for the card's topics. A
 * suggestion still in pencil is not on the card, so it is not read (DL-110).
 */
export function keptAskWords(draft: Pick<DeviceDraft, "needs" | "offers">): string[] {
  return (["needs", "offers"] as const)
    .flatMap((kind) => keptAsks(draft, kind))
    .flatMap((ask) => [ask.title, ask.description, ask.purpose, ask.audience])
    .filter((words): words is string => !!words?.trim());
}
/** What Funding ranks: a card, its details for funding, and the words of its kept needs and offers. */
export type FundingCard = Pick<DeviceDraft, "id" | "confirmed" | "funding"> & { readonly asks?: readonly string[] };
/**
 * What Funding ranks for a draft, as one string: the card, its details for funding as kept, and
 * its kept needs' and offers' words. It changes when one of them does, and not while a box or
 * the details dialog is being typed in, so only a kept change ranks the catalog again.
 */
export function fundingKey(draft: Pick<DeviceDraft, "id" | "confirmed" | "funding" | "needs" | "offers">): string {
  return JSON.stringify({
    id: draft.id,
    confirmed: draft.confirmed,
    funding: { ...draft.funding, editor: null },
    asks: keptAskWords(draft),
  });
}
/** The project a `fundingKey` names. Throws `FundingFormProblem` for details that cannot be kept. */
export function projectFromKey(key: string) {
  const { asks, ...card } = JSON.parse(key) as { asks: unknown };
  const words = Array.isArray(asks) ? asks.filter((ask): ask is string => typeof ask === "string") : [];
  return projectFrom({ ...z.pick(DeviceDraftSchema, { id: true, confirmed: true, funding: true }).parse(card), asks: words });
}
export function projectFrom(draft: FundingCard) {
  if (!draft.confirmed) return null;
  const form = FundingFormSchema.parse(draft.funding.form);
  const countries = (text: string, field: FundingFormField) => {
    const values = codes(text);
    if (values.some((value) => !COUNTRIES.includes(value)))
      throw new FundingFormProblem(field, "Use country names, or two-letter codes from the list.");
    return values;
  };
  const singleCountry = (text: string, field: FundingFormField) => {
    const value = text.toUpperCase().trim();
    countries(value, field);
    return value;
  };
  const workCountries = countries(form.workCountries, "workCountries"),
    benefitCountries = countries(form.benefitCountries, "benefitCountries");
  const states = (text: string, places: string[], field: FundingFormField) => {
    const values = codes(text);
    if (values.some((value) => !Object.hasOwn(US_STATES, value)) || (values.length && !places.includes("US")))
      throw new FundingFormProblem(field, "Use US state codes, with the United States among the countries.");
    return values;
  };
  const amount = (text: string, field: FundingFormField) => {
    if (!text.trim()) return null;
    if (!/^\d+(?:\.\d+)?$/u.test(text.trim()) || !Number.isFinite(Number(text)))
      throw new FundingFormProblem(field, "Use a number, with a dot for decimals.");
    return Number(text);
  };
  const goalMin = amount(form.goalMin, "goalMin"),
    goalMax = amount(form.goalMax, "goalMax"),
    currency = form.currency.toUpperCase().trim();
  if (goalMin !== null && goalMax !== null && goalMin > goalMax)
    throw new FundingFormProblem("goalMax", "Make this at least the amount above it.");
  if ((goalMin !== null || goalMax !== null || currency) && !/^[A-Z]{3}$/u.test(currency))
    throw new FundingFormProblem("currency", "Add the three-letter currency of the amount, such as USD.");
  return {
    id: draft.id,
    name: draft.confirmed.name,
    description: draft.confirmed.description,
    // The person's own themes. A card has shown none since DL-127: the matcher adds the catalog
    // topics its words name in Portuguese or Spanish, and those its kept needs and offers name (DL-142).
    tags: draft.confirmed.themes,
    asks: [...(draft.asks ?? [])],
    // Where you work, read for fit only: typed places are never mapped into eligibility facts (DL-143).
    places: [...draft.confirmed.locations],
    workCountries,
    benefitCountries,
    applicantBaseCountry: singleCountry(form.applicantBaseCountry, "applicantBaseCountry"),
    registrationCountry: singleCountry(form.registrationCountry, "registrationCountry"),
    applicantType: form.applicantType,
    // Kind of funding filters by type instead (DL-131). An older card's stored choice is kept on
    // the card but no longer read, since nothing on screen shows it or changes it.
    fundingInstruments: [] as FundingForm["fundingInstruments"],
    goalMin,
    goalMax,
    currency,
    usWorkStates: states(form.usWorkStates, workCountries, "usWorkStates"),
    usBenefitStates: states(form.usBenefitStates, benefitCountries, "usBenefitStates"),
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
