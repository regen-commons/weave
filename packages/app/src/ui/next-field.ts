import type { KeyboardEvent } from "react";

/**
 * On a phone, Enter in a one-line field goes on to the next field of its form, as a native form's
 * Next key does (DL-096). A field that says `enterKeyHint="next"` sits in a form that does this.
 * With a keyboard on the desk Enter still sends the form, as it does everywhere on the web.
 */

/** What a key press has to say for itself. A browser's event and a test's stand-in both do. */
export interface EnterPress {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** An input method uses Enter to accept the word being composed. Safari reports that as key code 229. */
  readonly isComposing: boolean;
  readonly keyCode: number;
}
/** A control as a form lists it. */
export interface FormControl {
  readonly tagName: string;
  readonly type?: string;
  readonly disabled?: boolean;
}

const NOT_TYPED_IN = new Set(["button", "submit", "reset", "image", "hidden", "checkbox", "radio", "file", "range", "color"]);
/** A one-line field a person types in. Enter in a textarea is a new line and stays one. */
export const isLineField = (control: FormControl): boolean =>
  control.tagName === "INPUT" && !NOT_TYPED_IN.has(control.type ?? "text");
/** A field the focus can go on to: anything filled in, and not a button. */
const takesFocus = (control: FormControl): boolean =>
  !control.disabled &&
  (control.tagName === "TEXTAREA" || control.tagName === "SELECT" || (control.tagName === "INPUT" && !["button", "submit", "reset", "image", "hidden"].includes(control.type ?? "text")));

/** Enter by itself, with no word still being composed. */
export const isPlainEnter = (press: EnterPress): boolean =>
  press.key === "Enter" && !press.shiftKey && !press.ctrlKey && !press.metaKey && !press.altKey && !press.isComposing && press.keyCode !== 229;

/** The field after `from` in its form, or null when `from` is the last, where Enter sends the form. */
export function fieldAfter<Control extends FormControl>(controls: readonly Control[], from: Control): Control | null {
  const at = controls.indexOf(from);
  if (at === -1) return null;
  return controls.slice(at + 1).find(takesFocus) ?? null;
}

/** Whether the keyboard is the one on the screen. A hardware keyboard keeps Enter for sending the form. */
const onScreenKeyboard = (): boolean => window.matchMedia("(pointer: coarse)").matches;

/** For a form's `onKeyDown`. */
export function moveOnEnter(event: KeyboardEvent<HTMLFormElement>): void {
  const from = event.target;
  if (!(from instanceof HTMLInputElement) || !isLineField(from)) return;
  if (!isPlainEnter(event.nativeEvent) || !onScreenKeyboard()) return;
  const controls = [...event.currentTarget.elements].filter(
    (control): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement,
  );
  const next = fieldAfter(controls, from);
  if (!next) return;
  // Enter would send the form: this field has somewhere to go first.
  event.preventDefault();
  next.focus();
}
