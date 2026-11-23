import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise } from "../src/describe/contracts.ts";
import { emptyFundingForm, type FundingForm } from "../src/funding/contracts.ts";
import {
  countryCodes,
  detailsEditor,
  detailsForm,
  detailsLine,
  mentionsUnitedStates,
} from "../src/funding/details.ts";
import { FundingFormProblem, keepFundingForm, projectFrom } from "../src/funding/profile.ts";

const form = (change: Partial<FundingForm>): FundingForm => ({ ...emptyFundingForm(), ...change });
const card = (funding: FundingForm) => {
  const draft = confirmDraft(
    revise(newDraft(), {
      proposal: { ...EMPTY_INITIATIVE, name: "Seed library", description: "Seed saving and food sovereignty", themes: [] },
      proposalVersion: 0,
    }),
  );
  return revise(draft, { funding: { ...draft.funding, form: funding } });
};

test("countries are written by name or by code, and kept as codes in the order written (DL-131)", () => {
  assert.deepEqual(countryCodes("Kenya, uganda"), ["KE", "UG"]);
  assert.deepEqual(countryCodes("KE; ug"), ["KE", "UG"]);
  assert.deepEqual(countryCodes("BR CO"), ["BR", "CO"], "codes separated by spaces, as the older form took them");
  assert.deepEqual(countryCodes("Côte d’Ivoire, Cote d'Ivoire"), ["CI"], "accents and apostrophes aside, each country once");
  assert.deepEqual(countryCodes("United States of America, USA, UK"), ["US", "GB"]);
  assert.deepEqual(countryCodes(" , "), []);
  assert.throws(() => countryCodes("Kenya, Narnia"), /Narnia is not a country name we know/u);
});

test("the dialog shows names where the form keeps codes, and Save turns them back", () => {
  const stored = form({ workCountries: "KE, UG", applicantBaseCountry: "KE", goalMin: "10000", currency: "USD" });
  const shown = detailsEditor(stored);
  assert.equal(shown.workCountries, "Kenya, Uganda");
  assert.equal(shown.applicantBaseCountry, "Kenya");
  assert.deepEqual(detailsForm(shown), stored);
  assert.equal(detailsForm({ ...shown, goalMin: "10,000", currency: " usd" }).goalMin, "10000", "grouping is taken out");
  assert.equal(detailsEditor(form({ workCountries: "??" })).workCountries, "??", "text it cannot read is shown as it is");
});

test("a detail that cannot be kept says which field it is about", () => {
  const problem = (editor: FundingForm) => {
    try {
      const draft = card(emptyFundingForm());
      keepFundingForm(revise(draft, { funding: { ...draft.funding, editor: detailsForm(editor) } }));
    } catch (cause) {
      assert.ok(cause instanceof FundingFormProblem, String(cause));
      return [cause.field, cause.message];
    }
    return null;
  };
  assert.deepEqual(problem(form({ workCountries: "Narnia" }))?.[0], "workCountries");
  assert.deepEqual(problem(form({ applicantBaseCountry: "Kenya, Uganda" })), ["applicantBaseCountry", "Name one country here."]);
  assert.deepEqual(problem(form({ goalMin: "ten" }))?.[0], "goalMin");
  assert.deepEqual(problem(form({ goalMin: "500", goalMax: "100", currency: "USD" }))?.[0], "goalMax");
  assert.deepEqual(problem(form({ goalMin: "500" }))?.[0], "currency");
  assert.deepEqual(problem(form({ workCountries: "Kenya", usWorkStates: "CA" }))?.[0], "usWorkStates");
  assert.equal(problem(form({ workCountries: "United States", usWorkStates: "CA" })), null);
});

test("the line under the initiative's name says the details plainly, and nothing when there are none", () => {
  assert.equal(detailsLine(emptyFundingForm()), null);
  assert.equal(
    detailsLine(form({ workCountries: "KE, UG", applicantBaseCountry: "KE", applicantType: "nonprofit", goalMin: "10000", goalMax: "50000", currency: "USD" })),
    "Works in Kenya and Uganda. Based in Kenya. Nonprofit. Looking for USD 10,000 to 50,000.",
  );
  assert.equal(
    detailsLine(form({ workCountries: "KE", applicantBaseCountry: "KE", registrationCountry: "GB", goalMax: "5000", currency: "EUR" })),
    "Works in Kenya. Registered in United Kingdom. Looking for up to EUR 5,000.",
    "where it is based is left out when it is where it works",
  );
  assert.equal(detailsLine(form({ benefitCountries: "BR", applicantType: "informal" })), "Serves people in Brazil. Informal group.");
});

test("the United States' states are asked only once it is among the countries", () => {
  assert.equal(mentionsUnitedStates(form({ workCountries: "Kenya" })), false);
  assert.equal(mentionsUnitedStates(form({ benefitCountries: "Mexico, United States" })), true);
  assert.equal(mentionsUnitedStates(form({ workCountries: "Narnia, US" })), false, "until the countries read, it does not guess");
});

test("a stored funding type no longer narrows anything: Kind of funding filters by type instead (DL-131)", () => {
  const draft = card(form({ fundingInstruments: ["prize"] }));
  assert.deepEqual(projectFrom(draft)!.fundingInstruments, []);
  assert.deepEqual(draft.funding.form.fundingInstruments, ["prize"], "the card keeps what it holds");
});
