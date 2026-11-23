/**
 * How a funding card says when a call closes (DL-103). Near its end the card counts the days,
 * because "in 12 days" is read faster than a date; further out the date says more than a count.
 * Days are counted to the end of the closing day in UTC, as the Closing filter counts them, and
 * as `effectiveAccess` in the shared domain module decides that a call has closed.
 */
import { utcDate } from "../../../../dist/domain.mjs";

/** From this many days left, a deadline counts as close and its tag is toned. */
export const DEADLINE_SOON_DAYS = 14;
/** Up to this many days left a card counts the days. Further out it gives the date. */
export const DEADLINE_COUNTED_DAYS = 60;

const DAY_MS = 86_400_000;

/**
 * The UTC day a call closes on. A source date with no stated time is that day. An exact closing
 * moment closes on its own UTC day, which can be the day after the source date: 23:59 Pacific on
 * 20 November is 07:59 UTC on the 21st, and the call is still open until then.
 */
export function closingDay(deadlineDate: string, deadlineInstant?: string | null): string {
  const instant = deadlineInstant ? new Date(deadlineInstant) : null;
  return instant && Number.isFinite(instant.getTime()) ? utcDate(instant) : deadlineDate;
}

/** When the closing day ends: the first moment of the next UTC day. */
export function closingDayEnds(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) + DAY_MS;
}

/** Whole UTC days from today to the closing day: 0 on the day itself, negative once it has passed. */
export function daysToDeadline(day: string, now: Date): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${utcDate(now)}T00:00:00Z`)) / DAY_MS);
}

export interface DeadlineSign {
  /** The words before the date, or the whole label where no date follows. */
  readonly label: string;
  /** Whether the date itself follows the words. A counted deadline keeps its date for a tooltip only. */
  readonly dated: boolean;
  /** Close enough to tone. The words already say so; the tone only repeats it. */
  readonly soon: boolean;
}

/**
 * The deadline tag's words for a call closing on `day` (see `closingDay`). `closed` is
 * `effectiveAccess`'s reading of the call, which also knows an exact closing moment.
 */
export function deadlineSign(day: string, closed: boolean, now: Date): DeadlineSign {
  const days = daysToDeadline(day, now);
  if (closed || days < 0) return { label: "Ended", dated: true, soon: false };
  const soon = days <= DEADLINE_SOON_DAYS;
  if (days === 0) return { label: "Closes today", dated: false, soon };
  if (days === 1) return { label: "Closes tomorrow", dated: false, soon };
  if (days <= DEADLINE_COUNTED_DAYS) return { label: `Closes in ${days} days`, dated: false, soon };
  return { label: "Closes", dated: true, soon: false };
}

const dayInWords = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
const timeInWords = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/**
 * The fund sheet's sentence for a call's deadline, in words a screen reader says naturally: the
 * source's date and, where the source gives an exact moment, its time in UTC. A moment that falls
 * on another UTC day says that day too. An instant written as an ISO string is never read out as
 * one (quality finding Q-12).
 */
export function deadlineSentence(deadlineDate: string, deadlineInstant?: string | null): string {
  const day = dayInWords.format(new Date(`${deadlineDate}T00:00:00Z`));
  const instant = deadlineInstant ? new Date(deadlineInstant) : null;
  if (!instant || !Number.isFinite(instant.getTime())) return `Source deadline ${day}, exact time unverified.`;
  const time = `${timeInWords.format(instant)} UTC`;
  return closingDay(deadlineDate, deadlineInstant) === deadlineDate
    ? `Source deadline ${day}, ${time}.`
    : `Source deadline ${day}, which is ${time} on ${dayInWords.format(instant)}.`;
}
