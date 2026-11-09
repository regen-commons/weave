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
function display(key: DerivedKey, fields: Initiative): string {
  if (key === "stage") return fields.stage ? STAGE_LABELS[fields.stage] : "Not stated";
  if (key === "lenses") return fields.lenses.map((lens) => LENS_LABELS[lens]).join(", ") || "Not stated";
  if (key === "languages")
    return (
      fields.languages
        .map((code) => new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code)
        .join(", ") || "Not stated"
    );
  return fields[key].join(", ") || "Not stated";
}
/** Proposal molecule: keep, correct or remove one derived field. */
export function ReviewDetail({
  field,
  fields,
  kept,
  removed,
  editor,
  onEditor,
  onKeep,
  onChange,
  onRemove,
  onUndo,
}: {
  field: DerivedKey;
  fields: Initiative;
  kept: boolean;
  removed: boolean;
  editor?: ReviewEditor;
  onEditor(value: ReviewEditor | null): void;
  onKeep(): void;
  onChange(change: Partial<Initiative>): void;
  onRemove(): void;
  onUndo(): void;
}) {
  const id = useId();
  const row = useRef<HTMLLIElement>(null);
  const focusIntent = useRef<"editor" | "change" | "undo" | null>(null);
  const editing = !!editor;
  const value = editor?.value ?? "";
  const lenses = editor?.lenses ?? fields.lenses;
  const [error, setError] = useState("");
  useEffect(() => {
    const intent = focusIntent.current;
    if (!intent) return;
    const selector = intent === "editor" ? "textarea,select,input" : `[data-review-${intent}]`;
    row.current?.querySelector<HTMLElement>(selector)?.focus();
    focusIntent.current = null;
  }, [editing, kept, removed]);
  function setValue(value: string) {
    if (editor) onEditor({ ...editor, value });
  }
  function setLenses(change: (current: Initiative["lenses"]) => Initiative["lenses"]) {
    if (editor) onEditor({ ...editor, lenses: change(lenses) });
  }
  function save() {
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
    focusIntent.current = "change";
    onChange(parsed.data);
    setError("");
  }
  return (
    <li ref={row} className="rc-proposal" data-state={kept || removed ? "confirmed" : undefined}>
      <p className="rc-proposal-source">
        {removed
          ? "Removed. This will not be guessed again."
          : kept
            ? "Kept by you"
            : "Suggested from your words. Check this."}
      </p>
      <h3 className="rc-proposal-value">{DERIVED_LABELS[field]}</h3>
      {removed ? (
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          data-review-undo
          onClick={() => {
            focusIntent.current = "change";
            onUndo();
          }}
        >
          Undo remove
        </button>
      ) : editing ? (
        <>
          <div className="rc-field">
            <label htmlFor={field === "lenses" ? undefined : id}>{DERIVED_LABELS[field]}</label>
            {field === "stage" ? (
              <select
                className="rc-input"
                id={id}
                value={value}
                onChange={(event) => setValue(event.target.value)}
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
                        setLenses((current) =>
                          current.includes(key as keyof typeof LENS_LABELS)
                            ? current.filter((item) => item !== key)
                            : [...current, key as keyof typeof LENS_LABELS],
                        )
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
                value={value}
                rows={3}
                maxLength={20_000}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
            {field === "languages" && (
              <p className="rc-hint">
                English, Portuguese, Spanish, French, German, Swahili, Hindi, Arabic, Chinese, or two-letter
                codes. Separate with commas.
              </p>
            )}
            {field !== "stage" && field !== "lenses" && field !== "languages" && (
              <p className="rc-hint">Separate items with semicolons.</p>
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
            <button
              className="rc-button"
              data-variant="quiet"
              type="button"
              onClick={() => {
                focusIntent.current = "change";
                onEditor(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{display(field, fields)}</p>
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              disabled={kept}
              onClick={() => {
                focusIntent.current = "change";
                onKeep();
              }}
            >
              {kept ? "Kept" : "Keep"}
            </button>
            <button
              className="rc-button"
              data-variant="quiet"
              data-review-change
              type="button"
              onClick={() => {
                focusIntent.current = "editor";
                onEditor({
                  value:
                    field === "stage"
                      ? (fields.stage ?? "")
                      : field === "languages"
                        ? display(field, fields).replace("Not stated", "")
                        : fields[field].join("; "),
                  lenses: [...fields.lenses],
                  wasKept: kept,
                });
              }}
            >
              Change
            </button>
            <button
              className="rc-button"
              data-variant="quiet"
              type="button"
              onClick={() => {
                focusIntent.current = "undo";
                onRemove();
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </li>
  );
}
