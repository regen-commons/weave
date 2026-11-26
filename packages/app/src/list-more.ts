/**
 * How a long list fills in as a person reaches its end (DL-101). The rules are here, where they
 * can be tested; `ui/ListEnd.tsx` draws them.
 */

/**
 * How far below the window the list's end is noticed, as an observer's root margin: the next batch
 * is asked for about half a screen before the end comes into view, so it is there on arrival.
 */
export const AHEAD_MARGIN = "0px 0px 480px 0px";

/**
 * Whether the next batch may arrive without a press. It keeps arriving for as long as a person
 * scrolls (DL-130), except while one is on its way or while the keyboard is working through the
 * list: a person tabbing from card to card would otherwise never reach the list's end, or the
 * footer after it, so there Show More brings the next batch.
 */
export function loadsUnasked({ more, busy, keyboardInList }: {
  more: boolean;
  busy: boolean;
  keyboardInList: boolean;
}): boolean {
  return more && !busy && !keyboardInList;
}

const count = (value: number) => new Intl.NumberFormat("en-GB").format(value);

/**
 * The line at a list's end that says how much of it is on the page. `things` is a plural that ends
 * in "s", as every list's does, so a list of one, such as a short shortlist, names its one thing.
 */
export function shownLine(shown: number, total: number, things: string): string {
  if (total === 1 && shown >= 1) return `Showing the only ${things.replace(/s$/u, "")}.`;
  return shown >= total ? `Showing all ${count(total)} ${things}.` : `Showing ${count(shown)} of ${count(total)} ${things}.`;
}
