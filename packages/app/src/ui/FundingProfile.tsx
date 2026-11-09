import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES, FUNDING_INSTRUMENTS, US_STATES } from "../../../../dist/storage.mjs";
import { useDraft } from "../describe/use-draft.ts";
import { revise } from "../describe/contracts.ts";
import { keepFundingForm } from "../funding/profile.ts";
import type { FundingForm } from "../funding/contracts.ts";
export function FundingProfile() {
  const { draft, controller } = useDraft(),
    id = useId();
  const [error, setError] = useState("");
  const editor = draft.funding.editor;
  const form = useRef<HTMLFormElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    wasOpen = useRef(false);
  useEffect(() => {
    if (editor && !wasOpen.current) form.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (!editor && wasOpen.current) trigger.current?.focus();
    wasOpen.current = !!editor;
  }, [!!editor]);
  if (!draft.confirmed) return null;
  const update = (form: FundingForm | null) =>
    controller.change((current) => revise(current, { funding: { ...current.funding, editor: form } }));
  const field = (
    key: keyof Omit<FundingForm, "fundingInstruments" | "applicantType">,
    label: string,
    hint?: string,
  ) => (
    <div className="rc-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {hint && <p className="rc-hint">{hint}</p>}
      <input
        className="rc-input"
        id={`${id}-${key}`}
        value={editor![key]}
        maxLength={
          key === "currency"
            ? 3
            : key === "applicantBaseCountry" || key === "registrationCountry"
              ? 2
              : key.startsWith("goal")
                ? 60
                : key.startsWith("us")
                  ? 200
                  : 800
        }
        list={key.includes("Countries") || key.includes("Country") ? `${id}-countries` : undefined}
        onChange={(event) => update({ ...editor!, [key]: event.target.value })}
      />
    </div>
  );
  return (
    <section className="rc-stack" aria-labelledby={`${id}-title`}>
      <h2 className="rc-heading" data-size="section" id={`${id}-title`}>
        Details for funding
      </h2>
      <p className="rc-meta">
        Optional, kept on this device. Typed locations do not establish country, registration or eligibility.
        Unknown answers stay unknown.
      </p>
      {!editor ? (
        <button
          ref={trigger}
          className="rc-button"
          data-variant="secondary"
          type="button"
          onClick={() => {
            setError("");
            update({ ...draft.funding.form });
          }}
        >
          Change funding details
        </button>
      ) : (
        <form
          ref={form}
          className="rc-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              controller.change((current) => revise(current, { funding: keepFundingForm(current) }));
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Check your funding details.");
            }
          }}
        >
          <datalist id={`${id}-countries`}>
            {COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {new Intl.DisplayNames(["en"], { type: "region" }).of(code)}
              </option>
            ))}
          </datalist>
          {field(
            "workCountries",
            "Work countries",
            "Two-letter country codes, separated by commas, such as BR, CO. Leave blank if unknown.",
          )}
          {field("benefitCountries", "Beneficiary countries", "Country codes for where people benefit.")}
          {field("applicantBaseCountry", "Applicant base country")}
          {field("registrationCountry", "Registration country")}
          <div className="rc-field">
            <label htmlFor={`${id}-type`}>Applicant type</label>
            <select
              className="rc-input"
              id={`${id}-type`}
              value={editor.applicantType}
              onChange={(event) =>
                update({ ...editor, applicantType: event.target.value as FundingForm["applicantType"] })
              }
            >
              {Object.entries({
                unknown: "Not stated",
                nonprofit: "Nonprofit",
                informal: "Informal group",
                individual: "Individual",
                business: "Business",
                university: "University",
                "public-body": "Public body",
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="rc-menu-group">
            <legend>Funding types you would consider</legend>
            {Object.entries(FUNDING_INSTRUMENTS).map(([value, label]) => (
              <label className="rc-menu-option" key={value}>
                <input
                  type="checkbox"
                  className="rc-check"
                  checked={editor.fundingInstruments.includes(
                    value as FundingForm["fundingInstruments"][number],
                  )}
                  onChange={() =>
                    update({
                      ...editor,
                      fundingInstruments: editor.fundingInstruments.includes(
                        value as FundingForm["fundingInstruments"][number],
                      )
                        ? editor.fundingInstruments.filter((item) => item !== value)
                        : [...editor.fundingInstruments, value as FundingForm["fundingInstruments"][number]],
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          {field("goalMin", "Funding goal from", "Use a dot for decimals, without grouping commas.")}
          {field("goalMax", "Funding goal up to")}
          {field("currency", "Goal currency", "Three-letter currency code. No conversion is applied.")}
          {field(
            "usWorkStates",
            "US work states",
            "Optional state codes, separated by commas. Requires US as a work country.",
          )}
          {field("usBenefitStates", "US beneficiary states", "Requires US as a beneficiary country.")}
          <details>
            <summary className="rc-footer-link">Country and US state codes</summary>
            <p className="rc-meta">
              {COUNTRIES.map(
                (code) => `${code}: ${new Intl.DisplayNames(["en"], { type: "region" }).of(code)}`,
              ).join("; ")}
            </p>
            <p className="rc-meta">
              {Object.entries(US_STATES)
                .map(([code, name]) => `${code}: ${name}`)
                .join("; ")}
            </p>
          </details>
          {error && (
            <p className="rc-error" role="alert">
              {error}
            </p>
          )}
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="submit">
              Keep funding details
            </button>
            <button className="rc-button" data-variant="quiet" type="button" onClick={() => update(null)}>
              Cancel changes
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
