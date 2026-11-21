import { useId, type ReactNode } from "react";
import { ABOUT_LIMIT, type FieldKey, type RecordForm } from "../describe/contracts.ts";
import { mainLink, nearLimit, otherLinks, withMainLink } from "../describe/fill.ts";

/** Said under a field that holds what Weave filled in from the person's words. */
const FROM_WORDS = "From what you said.";

/**
 * The four public fields. Raw incomplete text stays editable. A field Weave filled from the
 * person's words is in pencil, dashed and said so in its hint, until they change it (DL-110).
 * Every field keeps one hint line, so a fill changes words in place and moves nothing. A problem
 * that stops Continue is written in the same line of the field it is about, as an alert, and the
 * field is marked invalid, so the answer is beside the question and nothing moves (DL-125).
 * Each tells a phone's keyboard what it holds: names start each word with a capital, and the link
 * gets the address keys with no capitals and no corrections. The one-line fields label Enter as
 * Next, and the form they sit in moves the focus on (`moveOnEnter`, DL-096).
 */
export function RecordFields({
  value,
  filled = [],
  problem,
  onChange,
}: {
  value: RecordForm;
  filled?: readonly FieldKey[];
  /** Why the page could not go on, for the one field it is about. */
  problem?: { readonly field: FieldKey; readonly message: string } | null;
  onChange(value: RecordForm): void;
}) {
  const id = useId();
  const pencil = (key: FieldKey) => (filled.includes(key) ? true : undefined);
  const hint = (key: FieldKey, words: string) => (filled.includes(key) ? `${FROM_WORDS} ${words}`.trim() : words);
  const invalid = (key: FieldKey) => (problem?.field === key ? true : undefined);
  /** The field's one line: its hint, or the problem that stopped the page in the hint's place. */
  const line = (key: FieldKey, name: string, words: ReactNode) =>
    problem?.field === key ? (
      <p className="rc-error" role="alert" id={`${id}-${name}-hint`}>
        {problem.message}
      </p>
    ) : (
      <p className="rc-hint" id={`${id}-${name}-hint`}>
        {words}
      </p>
    );
  const more = otherLinks(value).length;
  const count = nearLimit(value.about.length, ABOUT_LIMIT);
  return (
    <>
      <div className="rc-field">
        <label htmlFor={`${id}-name`}>Name</label>
        {line("name", "name", hint("name", filled.includes("name") ? "" : "What people call it."))}
        <input
          className="rc-input"
          id={`${id}-name`}
          aria-describedby={`${id}-name-hint`}
          aria-invalid={invalid("name")}
          data-pencil={pencil("name")}
          autoCapitalize="words"
          autoComplete="organization"
          enterKeyHint="next"
          value={value.name}
          maxLength={200}
          required
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-where`}>Where you work</label>
        {line("where", "where", hint("where", "Separate places with semicolons. Global is fine too."))}
        <input
          className="rc-input"
          id={`${id}-where`}
          aria-describedby={`${id}-where-hint`}
          aria-invalid={invalid("where")}
          data-pencil={pencil("where")}
          autoCapitalize="words"
          enterKeyHint="next"
          value={value.where}
          maxLength={2000}
          onChange={(event) => onChange({ ...value, where: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-about`}>About it</label>
        {line(
          "about",
          "about",
          <>
            {hint("about", "Two or three sentences.")}
            {/* The count shows only near the limit, at the end of the line that is already there. A card
                from before the shorter limit says that its longer words stay until they are changed. */}
            {value.about.length > ABOUT_LIMIT ? (
              <span> Longer than {ABOUT_LIMIT} characters, from an earlier save. It stays until you change it.</span>
            ) : (
              count && <span aria-live="polite"> {count} characters.</span>
            )}
          </>,
        )}
        <textarea
          className="rc-input"
          id={`${id}-about`}
          aria-describedby={`${id}-about-hint`}
          aria-invalid={invalid("about")}
          data-pencil={pencil("about")}
          value={value.about}
          rows={6}
          data-sizing="fixed"
          // A card saved before the shorter limit may hold more, and keeps it until it is changed.
          maxLength={Math.max(ABOUT_LIMIT, value.about.length)}
          onChange={(event) => onChange({ ...value, about: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-link`}>Website or main link</label>
        {line(
          "links",
          "link",
          <>
            {hint("links", "Optional.")}
            {more > 0 &&
              (mainLink(value)
                ? ` ${more} more ${more === 1 ? "link is" : "links are"} kept with this card.`
                : ` ${more} ${more === 1 ? "link is" : "links are"} kept with this card from an earlier save.`)}
          </>,
        )}
        <input
          className="rc-input"
          id={`${id}-link`}
          type="url"
          aria-describedby={`${id}-link-hint`}
          aria-invalid={invalid("links")}
          data-pencil={pencil("links")}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // The link is the form's last field, so Enter there sends the form and the key says Done.
          enterKeyHint="done"
          value={mainLink(value)}
          maxLength={2048}
          onChange={(event) => onChange({ ...value, links: withMainLink(value, event.target.value) })}
        />
      </div>
    </>
  );
}
