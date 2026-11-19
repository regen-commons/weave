/**
 * How a long list fills in as a person reaches its end (DL-101). The rules are here, where they
 * can be tested; `ui/ListEnd.tsx` draws them.
 */

/** How many batches arrive on their own before the list waits for a press, so the footer can be reached. */
export const AUTO_BATCHES = 3;
/**
 * How far below the window the list's end is noticed, as an observer's root margin: the next batch
 * is asked for about half a screen before the end comes into view, so it is there on arrival.
 */
export const AHEAD_MARGIN = "0px 0px 480px 0px";

/**
 * Whether the next batch may arrive without a press. It may not while one is on its way, once the
 * run of automatic batches is used up, or while the keyboard is working through the list: a person
 * tabbing from card to card would otherwise never reach the list's end, or the footer after it.
 */
export function loadsUnasked({ more, busy, autoLeft, keyboardInList }: {
  more: boolean;
  busy: boolean;
  autoLeft: number;
  keyboardInList: boolean;
}): boolean {
  return more && !busy && autoLeft > 0 && !keyboardInList;
}

const count = (value: number) => new Intl.NumberFormat("en-GB").format(value);

/** The line at a list's end that says how much of it is on the page. */
export function shownLine(shown: number, total: number, things: string): string {
  return shown >= total ? `Showing all ${count(total)} ${things}.` : `Showing ${count(shown)} of ${count(total)} ${things}.`;
}
