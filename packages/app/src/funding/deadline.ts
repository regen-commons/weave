/**
 * How a funding card says when a call closes (DL-103). Near its end the card counts the days,
 * because "in 12 days" is read faster than a date; further out the date says more than a count.
 * Days are counted to the end of the closing day in UTC, as the Closing filter counts them.
 */

/** From this many days left, a deadline counts as close and its tag is toned. */
export const DEADLINE_SOON_DAYS = 14;
/** Up to this many days left a card counts the days. Further out it gives the date. */
export const DEADLINE_COUNTED_DAYS = 60;

const DAY_MS = 86_400_000;

/** Whole days left before the closing day ends in UTC: 0 on the day itself, negative once it has passed. */
export function daysToDeadline(deadline: string, now: Date): number {
  return Math.floor((Date.parse(`${deadline}T23:59:59Z`) - now.getTime()) / DAY_MS);
}

export interface DeadlineSign {
  /** The words before the date, or the whole label where no date follows. */
  readonly label: string;
  /** Whether the date itself follows the words. A counted deadline keeps its date for a tooltip only. */
  readonly dated: boolean;
  /** Close enough to tone. The words already say so; the tone only repeats it. */
  readonly soon: boolean;
}

/** The deadline tag's words. `closed` is the catalog's own reading of the call, which a date alone cannot give. */
export function deadlineSign(deadline: string, closed: boolean, now: Date): DeadlineSign {
  const days = daysToDeadline(deadline, now);
  if (closed || days < 0) return { label: "Ended", dated: true, soon: false };
  const soon = days <= DEADLINE_SOON_DAYS;
  if (days === 0) return { label: "Closes today", dated: false, soon };
  if (days === 1) return { label: "Closes tomorrow", dated: false, soon };
  if (days <= DEADLINE_COUNTED_DAYS) return { label: `Closes in ${days} days`, dated: false, soon };
  return { label: "Closes", dated: true, soon: false };
}
