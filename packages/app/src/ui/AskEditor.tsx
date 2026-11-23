import { useEffect, useId, useRef, type FormEvent } from "react";
import { suggestEntryKinds } from "../intake/keywords.ts";
import { CAPITALS } from "../capitals.ts";
import { ASK_DESCRIPTION_LIMIT, SCOPES, STATUS, TERMS, URGENCY, type AskForm, type AskKind } from "../intake/contracts.ts";
import { nearLimit } from "../describe/fill.ts";
import type { AskFormField } from "../intake/state.ts";

/** Ask card editor: native fields, every kind equal, raw values owned by the device draft. */
export function AskEditor({
  kind,
  value,
  error,
  errorField = null,
  onChange,
  onSave,
  onCancel,
  disabled = false,
  saveLabel,
}: {
  kind: AskKind;
  value: AskForm;
  error: string;
  /** The field the error is about, which is marked and takes the focus (WCAG 3.3.1). */
  errorField?: AskFormField | null;
  onChange(value: AskForm): void;
  onSave(): void;
  onCancel(): void;
  disabled?: boolean;
  saveLabel?: string;
}) {
  const id = useId();
  const manualKinds = useRef(value.capitalForms.length > 0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  // A save that failed on one field moves the focus there, where its error is read with it.
  useEffect(() => {
    if (!error || !errorField) return;
    const target = document.getElementById(`${id}-${errorField}`);
    (target?.matches("fieldset") ? target.querySelector<HTMLInputElement>("input") : target)?.focus();
  }, [error, errorField]);
  const errorId = `${id}-error`;
  /** The error, said at the field it is about, which is in view when the focus arrives there. */
  const errorAt = (key: AskFormField | keyof AskForm) =>
    error && errorField === key ? (
      <p className="rc-error" role="alert" id={errorId}>
        {error}
      </p>
    ) : null;
  /** What describes a field: its hint, and the error when the error is about it. */
  const described = (key: AskFormField | keyof AskForm, hint?: string) =>
    [hint, error && errorField === key ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  const set = <K extends keyof AskForm>(key: K, next: AskForm[K]) => {
    if (key === "capitalForms") manualKinds.current = true;
    const updated = { ...value, [key]: next };
    if (!manualKinds.current && (key === "title" || key === "description"))
      updated.capitalForms = suggestEntryKinds(updated.title, updated.description);
    onChange(updated);
  };
  function text(
    key:
      | "title"
      | "description"
      | "amountMin"
      | "amountMax"
      | "currency"
      | "timeframe"
      | "purpose"
      | "capacity"
      | "audience",
    label: string,
    max: number,
    hint?: string,
    multiline = false,
  ) {
    const attrs = {
      className: "rc-input",
      id: `${id}-${key}`,
      value: value[key],
      maxLength: max,
      required: key === "title",
      disabled,
      "aria-describedby": described(key, hint ? `${id}-${key}-hint` : undefined),
      "aria-invalid": (error && errorField === key) || undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(key, event.target.value),
    };
    return (
      <div className="rc-field">
        <label htmlFor={`${id}-${key}`}>{label}</label>
        {hint && (
          <p className="rc-hint" id={`${id}-${key}-hint`}>
            {hint}
          </p>
        )}
        {errorAt(key)}
        {multiline ? (
          <textarea {...attrs} rows={3} />
        ) : (
          <input {...attrs} inputMode={key.startsWith("amount") ? "decimal" : undefined} />
        )}
      </div>
    );
  }
  const toggleCapital = (key: AskForm["capitalForms"][number]) =>
    set(
      "capitalForms",
      value.capitalForms.includes(key)
        ? value.capitalForms.filter((item) => item !== key)
        : [...value.capitalForms, key],
    );
  const toggleTerm = (term: AskForm["exchangeTerms"][number]) =>
    set(
      "exchangeTerms",
      term === "open"
        ? value.exchangeTerms.includes("open")
          ? []
          : ["open"]
        : value.exchangeTerms.includes(term)
          ? value.exchangeTerms.filter((item) => item !== term)
          : [...value.exchangeTerms.filter((item) => item !== "open"), term],
    );
  return (
    <form
      ref={form}
      className="rc-form rc-ask-editor"
      aria-label={kind === "needs" ? "Change this need" : "Change this offer"}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSave();
      }}
    >
      {text("title", kind === "needs" ? "What you need" : "What you can offer", 140)}
      {/* A description written before the shorter limit keeps its length until it is changed (DL-111). */}
      {text(
        "description",
        "In a line",
        Math.max(ASK_DESCRIPTION_LIMIT, value.description.length),
        `Optional, up to ${ASK_DESCRIPTION_LIMIT} characters. ${nearLimit(value.description.length, ASK_DESCRIPTION_LIMIT)}`.trim(),
        true,
      )}
      <fieldset
        id={`${id}-capitalForms`}
        disabled={disabled}
        className="rc-menu-group"
        aria-describedby={described("capitalForms")}
      >
        <legend>Kinds of support</legend>
        <p className="rc-hint">Suggested from your words. Add or remove any kind.</p>
        {errorAt("capitalForms")}
        {CAPITALS.map((capital) => (
          <label className="rc-menu-option" key={capital.key}>
            <input
              className="rc-check"
              type="checkbox"
              checked={value.capitalForms.includes(capital.key)}
              onChange={() => toggleCapital(capital.key)}
            />
            <span>
              {capital.title}: {capital.label}
            </span>
          </label>
        ))}
      </fieldset>
      {value.capitalForms.includes("financial") && (
        <>
          {text("amountMin", "Amount from", 60, "Optional. Use a dot for decimals, without grouping commas.")}
          {text("amountMax", "Amount up to", 60)}
          {text(
            "currency",
            "Currency",
            3,
            "A three-letter code, such as BRL, USD or EUR, when you add an amount.",
          )}
        </>
      )}
      {kind === "needs" ? (
        <>
          {text("timeframe", "When", 200, "A month and year is enough.")}
          <div className="rc-field">
            <label htmlFor={`${id}-urgency`}>Timeframe</label>
            <select
              className="rc-input"
              disabled={disabled}
              id={`${id}-urgency`}
              value={value.urgency}
              onChange={(event) => set("urgency", event.target.value as AskForm["urgency"])}
            >
              <option value="">Not stated</option>
              {Object.entries(URGENCY).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {text("purpose", "What you would do with it", 400, undefined, true)}
        </>
      ) : (
        <>
          {text("timeframe", "When it is available", 200)}
          {text("capacity", "How much, how often", 200)}
          {text("audience", "Who it is for", 200)}
        </>
      )}
      <div className="rc-field">
        <label htmlFor={`${id}-scope`}>Where</label>
        <select
          className="rc-input"
          disabled={disabled}
          id={`${id}-scope`}
          value={value.placeScope}
          onChange={(event) => set("placeScope", event.target.value as AskForm["placeScope"])}
        >
          {Object.entries(SCOPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <fieldset id={`${id}-exchangeTerms`} className="rc-menu-group" disabled={disabled} aria-describedby={described("exchangeTerms")}>
        <legend>Terms you would accept</legend>
        {errorAt("exchangeTerms")}
        {Object.entries(TERMS).map(([key, label]) => (
          <label className="rc-menu-option" key={key}>
            <input
              className="rc-check"
              type="checkbox"
              checked={value.exchangeTerms.includes(key as keyof typeof TERMS)}
              onChange={() => toggleTerm(key as keyof typeof TERMS)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="rc-field">
        <label htmlFor={`${id}-status`}>Status</label>
        <select
          className="rc-input"
          disabled={disabled}
          id={`${id}-status`}
          value={value.status}
          onChange={(event) => set("status", event.target.value as AskForm["status"])}
        >
          {Object.entries(STATUS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {/* The problem has its place whether or not there is one, so it pushes nothing down. */}
      <p className="rc-error rc-status-slot" role="alert" id={errorField ? undefined : errorId}>
        {errorField ? "" : error}
      </p>
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="primary" type="submit" disabled={disabled}>
          {saveLabel ?? (kind === "needs" ? "Keep This Need" : "Keep This Offer")}
        </button>
        <button className="rc-button" data-variant="quiet" type="button" disabled={disabled} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
