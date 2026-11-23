import { COUNTRIES } from "../../../../dist/storage.mjs";
import type { FundingForm } from "./contracts.ts";
import { FundingFormProblem, type FundingFormField } from "./profile.ts";

/**
 * An initiative's details for funding: where it works and is based, who is applying and how much
 * it is looking for (DL-131). They are facts about the initiative, kept with it, not filters: the
 * matcher reads them to say which funds may not take it and to order equal fits, and they never
 * hide a fund. The form keeps country codes; people read and write country names.
 */

/** Who is applying, as the dialog offers it and the summary says it. */
export const APPLICANT_TYPES: Readonly<Record<FundingForm["applicantType"], string>> = {
  unknown: "Not stated",
  nonprofit: "Nonprofit",
  informal: "Informal group",
  individual: "Individual",
  business: "Business",
  university: "University",
  "public-body": "Public body",
};

const regions = new Intl.DisplayNames(["en"], { type: "region" });
/** A country's English name, or its code where the browser has none. */
export function countryName(code: string): string {
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
/** Names people use that are not the browser's own. */
const ALIASES: Readonly<Record<string, string>> = {
  usa: "US",
  "united states of america": "US",
  uk: "GB",
  "great britain": "GB",
};
let names: Map<string, string> | undefined;
const byName = () =>
  (names ??= new Map([
    ...COUNTRIES.map((code): [string, string] => [plain(countryName(code)), code]),
    ...Object.entries(ALIASES),
  ]));
const isCode = (word: string) => /^[a-z]{2}$/iu.test(word) && COUNTRIES.includes(word.toUpperCase());

/**
 * Countries as a person writes them, such as "Kenya, Uganda" or "KE, UG", as the codes the form
 * keeps. Each country once, in the order written. A name it cannot place stops with a sentence
 * that says which one.
 */
export function countryCodes(text: string): string[] {
  const codes: string[] = [];
  for (const part of text.split(/[,;]+/u)) {
    const written = part.trim();
    if (!written) continue;
    if (isCode(written)) codes.push(written.toUpperCase());
    else if (byName().has(plain(written))) codes.push(byName().get(plain(written))!);
    else if (written.split(/\s+/u).every(isCode)) codes.push(...written.toUpperCase().split(/\s+/u));
    else throw new Error(`${written} is not a country name we know. Check the spelling, such as Kenya.`);
  }
  return [...new Set(codes)];
}

/** The form's country codes as the names a person reads and edits. Text it cannot read stays as it is. */
export function countryList(codes: string): string {
  try {
    return countryCodes(codes).map(countryName).join(", ");
  } catch {
    return codes;
  }
}

/** The details as the dialog shows them: the form, with names where the form keeps codes. */
export function detailsEditor(form: FundingForm): FundingForm {
  return {
    ...form,
    workCountries: countryList(form.workCountries),
    benefitCountries: countryList(form.benefitCountries),
    applicantBaseCountry: countryList(form.applicantBaseCountry),
    registrationCountry: countryList(form.registrationCountry),
  };
}

const amount = (text: string) => text.replace(/[,\s]/gu, "");
/** The codes for one field's countries, or the problem with them, said about that field. */
function countriesIn(text: string, field: FundingFormField, one = false): string {
  let codes: string[];
  try {
    codes = countryCodes(text);
  } catch (cause) {
    throw new FundingFormProblem(field, cause instanceof Error ? cause.message : "Check the countries.");
  }
  if (one && codes.length > 1) throw new FundingFormProblem(field, "Name one country here.");
  return codes.join(", ");
}

/**
 * What the dialog holds, back in the form's own terms: codes for countries, and amounts without
 * grouping. A country it cannot place stops here; the form's own checks follow when it is kept.
 */
export function detailsForm(editor: FundingForm): FundingForm {
  return {
    ...editor,
    workCountries: countriesIn(editor.workCountries, "workCountries"),
    benefitCountries: countriesIn(editor.benefitCountries, "benefitCountries"),
    applicantBaseCountry: countriesIn(editor.applicantBaseCountry, "applicantBaseCountry", true),
    registrationCountry: countriesIn(editor.registrationCountry, "registrationCountry", true),
    goalMin: amount(editor.goalMin),
    goalMax: amount(editor.goalMax),
    currency: editor.currency.trim().toUpperCase(),
  };
}

/** Whether the countries written so far include the United States, so its states can be asked. */
export function mentionsUnitedStates(editor: Pick<FundingForm, "workCountries" | "benefitCountries">): boolean {
  const codes = (text: string) => {
    try {
      return countryCodes(text);
    } catch {
      return [];
    }
  };
  return [...codes(editor.workCountries), ...codes(editor.benefitCountries)].includes("US");
}

const listed = new Intl.ListFormat("en", { type: "conjunction" });
const figure = new Intl.NumberFormat("en");

/**
 * The details in one line under the initiative's name, such as "Works in Kenya. Nonprofit.
 * Looking for USD 10,000 to 50,000." Null when nothing is filled in yet.
 */
export function detailsLine(form: FundingForm): string | null {
  const places = (text: string) => {
    try {
      return listed.format(countryCodes(text).map(countryName));
    } catch {
      return "";
    }
  };
  const work = places(form.workCountries),
    benefit = places(form.benefitCountries),
    base = places(form.applicantBaseCountry),
    registered = places(form.registrationCountry);
  const min = form.goalMin.trim() ? figure.format(Number(amount(form.goalMin))) : "",
    max = form.goalMax.trim() ? figure.format(Number(amount(form.goalMax))) : "",
    currency = form.currency.trim().toUpperCase();
  const goal =
    min && max
      ? min === max
        ? `${currency} ${min}`
        : `${currency} ${min} to ${max}`
      : max
        ? `up to ${currency} ${max}`
        : min
          ? `from ${currency} ${min}`
          : "";
  const sentences = [
    work && `Works in ${work}.`,
    benefit && benefit !== work && `Serves people in ${benefit}.`,
    base && base !== work && `Based in ${base}.`,
    registered && registered !== base && `Registered in ${registered}.`,
    form.applicantType !== "unknown" && `${APPLICANT_TYPES[form.applicantType]}.`,
    goal && `Looking for ${goal.replace(/^ /u, "")}.`,
  ].filter(Boolean);
  return sentences.length ? sentences.join(" ") : null;
}
