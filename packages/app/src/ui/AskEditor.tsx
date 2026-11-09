import { useEffect, useId, useRef, type FormEvent } from "react";
import { CAPITALS } from "../capitals.ts";
import { SCOPES, STATUS, TERMS, URGENCY, type AskForm, type AskKind } from "../intake/contracts.ts";

/** Ask card editor: native fields, every kind equal, raw values owned by the device draft. */
export function AskEditor({
  kind,
  value,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  kind: AskKind;
  value: AskForm;
  error: string;
  onChange(value: AskForm): void;
  onSave(): void;
  onCancel(): void;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const set = <K extends keyof AskForm>(key: K, next: AskForm[K]) => onChange({ ...value, [key]: next });
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
      "aria-describedby": hint ? `${id}-${key}-hint` : undefined,
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
      {text("description", "In a line", 600, undefined, true)}
      <fieldset
        className="rc-menu-group"
        aria-invalid={(!!error && !value.capitalForms.length) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <legend>Kinds of support</legend>
        <p className="rc-hint">Choose every kind it involves.</p>
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
      <fieldset className="rc-menu-group">
        <legend>Terms you would accept</legend>
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
      {error && (
        <p className="rc-error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="primary" type="submit">
          {kind === "needs" ? "Keep this need" : "Keep this offer"}
        </button>
        <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
