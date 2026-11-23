/**
 * How a button reads while work is under way (A-14, WCAG 2.4.3). A browser moves focus to the page's
 * body when the focused button becomes `disabled`, which inside a dialog leaves a keyboard or screen
 * reader user nowhere. So the button whose own press is being carried out stays focusable: it says
 * it is busy with `aria-busy` and `aria-disabled`, and its handler declines a second press. Its
 * label gives way to a Spinner in place (`data-busy="keep"`), so nothing beside it moves. A button
 * nobody just pressed holds no focus to lose, and is `disabled` as before.
 *
 * `carrying`: this button's press is being carried out. `blocked`: it cannot be used now for any
 * other reason, another button's work included.
 */
export function busyProps(carrying: boolean, blocked = false) {
  return {
    "data-busy": "keep" as const,
    "aria-busy": carrying || undefined,
    "aria-disabled": carrying || undefined,
    disabled: blocked && !carrying,
  };
}
