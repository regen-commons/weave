import { useEffect, useId, useRef, useState } from "react";
import {
  DERIVED_LABELS,
  DerivedEditsSchema,
  LENS_LABELS,
  type DerivedKey,
  type Initiative,
  type ReviewEditor,
} from "../describe/contracts.ts";
import { STAGE_LABELS } from "../listing.ts";
const LANGUAGES: Record<string, string> = {
  english: "en",
  portuguese: "pt",
  português: "pt",
  spanish: "es",
  español: "es",
  french: "fr",
  german: "de",
  swahili: "sw",
  hindi: "hi",
  arabic: "ar",
  chinese: "zh",
};
/** Proposal molecule, open for one derived detail: keep the change, remove the detail, or cancel. */
export function DetailEditor({
  field,
  fields,
  editor,
  onEditor,
  onChange,
  onRemove,
  onCancel,
}: {
  field: DerivedKey;
  fields: Initiative;
  editor: ReviewEditor;
  onEditor(value: ReviewEditor): void;
  onChange(change: Partial<Initiative>): void;
  onRemove(): void;
  onCancel(): void;
}) {
  const id = useId();
  const first = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    first.current?.querySelector<HTMLElement>("textarea,select,input")?.focus();
  }, [field]);
  const lenses = editor.lenses;
  function save() {
    const value = editor.value;
    const parsedValue =
      field === "stage"
        ? value || null
        : field === "lenses"
          ? lenses
          : field === "languages"
            ? value
                .split(/[;,]/u)
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => LANGUAGES[item.toLocaleLowerCase()] ?? item.toLocaleLowerCase())
            : value
                .split(/[;\n]/u)
                .map((item) => item.trim())
                .filter(Boolean);
    const parsed = DerivedEditsSchema.safeParse({ [field]: parsedValue });
    if (!parsed.success) {
      setError("Check the value and its length. Languages need names from the hint or two-letter codes.");
      return;
    }
    setError("");
    onChange(parsed.data);
  }
  return (
    <div className="rc-proposal" ref={first}>
      <p className="rc-proposal-source">
        {editor.wasKept ? "Kept by you. Change it here." : "Suggested from your words. Check this."}
      </p>
      <div className="rc-field">
        <label htmlFor={field === "lenses" ? undefined : id}>{DERIVED_LABELS[field]}</label>
        {field === "stage" ? (
          <select
            className="rc-input"
            id={id}
            value={editor.value}
            onChange={(event) => onEditor({ ...editor, value: event.target.value })}
          >
            <option value="">Not stated</option>
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        ) : field === "lenses" ? (
          <fieldset className="rc-menu-group">
            <legend>Choose every type that applies</legend>
            {Object.entries(LENS_LABELS).map(([key, label]) => (
              <label className="rc-menu-option" key={key}>
                <input
                  className="rc-check"
                  type="checkbox"
                  checked={lenses.includes(key as keyof typeof LENS_LABELS)}
                  onChange={() =>
                    onEditor({
                      ...editor,
                      lenses: lenses.includes(key as keyof typeof LENS_LABELS)
                        ? lenses.filter((item) => item !== key)
                        : [...lenses, key as keyof typeof LENS_LABELS],
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : (
          <textarea
            className="rc-input"
            id={id}
            value={editor.value}
            rows={2}
            maxLength={20_000}
            onChange={(event) => onEditor({ ...editor, value: event.target.value })}
          />
        )}
        {field === "languages" ? (
          <p className="rc-hint">
            English, Portuguese, Spanish, French, German, Swahili, Hindi, Arabic, Chinese, or two-letter codes,
            separated by commas.
          </p>
        ) : (
          field !== "stage" && field !== "lenses" && <p className="rc-hint">Separate items with semicolons.</p>
        )}
      </div>
      {error && (
        <p className="rc-error" role="alert">
          {error}
        </p>
      )}
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="secondary" type="button" onClick={save}>
          Keep changes
        </button>
        <button className="rc-button" data-variant="quiet" type="button" onClick={onRemove}>
          Remove
        </button>
        <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
