import { useId, useState } from "react";
import { COUNTRIES, US_STATES } from "../../../../dist/storage.mjs";
import { useDraft } from "../describe/use-draft.ts";
import { useSetAside } from "../account/set-aside.ts";
import { revise } from "../describe/contracts.ts";
import { FundingFormProblem, keepFundingForm, type FundingFormField } from "../funding/profile.ts";
import { APPLICANT_TYPES, countryName, detailsEditor, detailsForm, mentionsUnitedStates } from "../funding/details.ts";
import type { FundingForm } from "../funding/contracts.ts";
import { TaskDialog } from "./TaskDialog.tsx";

/**
 * Edit Details: the initiative's details for funding, in a dialog opened beside its name on
 * Funding (DL-131). The dialog holds country names as people write them, which the card's form
 * does not, so the words being changed stay in the dialog until Save Details turns them into
 * the form. Closing without saving leaves the details as they were.
 */
export function FundingProfile({ open, onClose }: { open: boolean; onClose(): void }) {
  const { draft, controller } = useDraft(),
    id = useId(),
    setAside = useSetAside();
  // Why Save Details stopped, said in the hint's line of the field it is about (DL-127).
  const [problem, setProblem] = useState<{ field: FundingFormField | null; message: string } | null>(null);
  const [changed, setChanged] = useState<FundingForm | null>(null);
  // Another account's funding details stay with that account (DL-055).
  if (!draft.confirmed || setAside) return null;
  const editor = changed ?? detailsEditor(draft.funding.form);
  const update = (form: FundingForm) => setChanged(form);
  const close = () => {
    setProblem(null);
    setChanged(null);
    onClose();
  };
  const field = (
    key: FundingFormField,
    label: string,
    hint: string,
    extra: { focus?: boolean; maxLength?: number; inputMode?: "decimal"; countries?: boolean } = {},
  ) => (
    <div className="rc-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {problem?.field === key ? (
        <p className="rc-error" role="alert" id={`${id}-${key}-hint`}>
          {problem.message}
        </p>
      ) : (
        <p className="rc-hint" id={`${id}-${key}-hint`}>
          {hint}
        </p>
      )}
      <input
        className="rc-input"
        id={`${id}-${key}`}
        aria-describedby={`${id}-${key}-hint`}
        aria-invalid={problem?.field === key || undefined}
        value={editor[key]}
        maxLength={extra.maxLength ?? 800}
        inputMode={extra.inputMode}
        autoComplete="off"
        list={extra.countries ? `${id}-countries` : undefined}
        data-task-focus={extra.focus || undefined}
        onChange={(event) => update({ ...editor, [key]: event.target.value })}
      />
    </div>
  );
  return (
    <TaskDialog title="Details For Funding" open={open} onClose={close}>
      <form
        className="rc-form"
        data-width="full"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const form = detailsForm(editor);
            controller.change((current) =>
              revise(current, { funding: keepFundingForm({ ...current, funding: { ...current.funding, editor: form } }) }),
            );
            close();
          } catch (cause) {
            const field = cause instanceof FundingFormProblem ? cause.field : null;
            setProblem({ field, message: cause instanceof Error ? cause.message : "Check your details for funding." });
            if (field) document.getElementById(`${id}-${field}`)?.focus();
          }
        }}
      >
        <p className="rc-meta">
          About {draft.confirmed.name}, kept on this device. They show which funds may not take you and order equal
          fits. They never hide a fund, and unknown answers stay unknown.
        </p>
        <datalist id={`${id}-countries`}>
          {COUNTRIES.map((code) => (
            <option key={code} value={countryName(code)} />
          ))}
        </datalist>
        {field("workCountries", "Where you work", "Countries, separated by commas, such as Kenya, Uganda.", {
          focus: true,
          countries: true,
        })}
        {field("benefitCountries", "Where the people you serve live", "Leave blank if it is where you work.", {
          countries: true,
        })}
        {field("applicantBaseCountry", "Where you are based", "One country.", { countries: true, maxLength: 80 })}
        {field("registrationCountry", "Where you are registered", "Leave blank if you are not registered.", {
          countries: true,
          maxLength: 80,
        })}
        <fieldset>
          <legend>Who is applying</legend>
          <div className="rc-chip-group">
            {Object.entries(APPLICANT_TYPES).map(([value, label]) => (
              <label className="rc-chip" key={value}>
                <input
                  className="rc-check"
                  type="radio"
                  name={`${id}-type`}
                  checked={editor.applicantType === value}
                  onChange={() => update({ ...editor, applicantType: value as FundingForm["applicantType"] })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Amount you are looking for</legend>
          <p className="rc-hint">Leave blank if you do not know. No conversion between currencies is made.</p>
          {field("goalMin", "From", "The least that would help.", { maxLength: 60, inputMode: "decimal" })}
          {field("goalMax", "Up to", "The most you would ask for.", { maxLength: 60, inputMode: "decimal" })}
          {field("currency", "Currency", "Three letters, such as USD or KES.", { maxLength: 3 })}
        </fieldset>
        {mentionsUnitedStates(editor) && (
          <fieldset>
            <legend>In the United States</legend>
            {field("usWorkStates", "States where you work", "State codes, separated by commas, such as CA, NY.", {
              maxLength: 200,
            })}
            {field("usBenefitStates", "States where the people you serve live", "Leave blank if they are where you work.", {
              maxLength: 200,
            })}
            <details>
              <summary className="rc-footer-link">State codes</summary>
              <p className="rc-meta">
                {Object.entries(US_STATES)
                  .map(([code, name]) => `${code}: ${name}`)
                  .join("; ")}
              </p>
            </details>
          </fieldset>
        )}
        {problem && !problem.field && (
          <p className="rc-error" role="alert">
            {problem.message}
          </p>
        )}
        <div className="rc-dialog-foot">
          <button className="rc-button" data-variant="primary" type="submit">
            Save Details
          </button>
        </div>
      </form>
    </TaskDialog>
  );
}
