import type { ListingRecord } from "./listing.ts";

const DAY = 86_400_000;
function calendarDay(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY
    : undefined;
}

/** Calendar days in UTC: a deadline today has zero days left and is still upcoming. */
export function daysUntil(deadline: string | undefined, asOf: string): number | undefined {
  const end = calendarDay(deadline);
  const start = calendarDay(asOf);
  if (start === undefined) throw new Error("Home needs a valid reference date");
  return end === undefined ? undefined : end - start;
}

/** Public preview selection uses sharing dates and upcoming deadlines, never match scores. */
export function homePreviews(
  initiatives: readonly ListingRecord[],
  funding: readonly ListingRecord[],
  asOf: string,
) {
  const today = calendarDay(asOf);
  if (today === undefined) throw new Error("Home needs a valid reference date");
  const shared = initiatives.filter((record) => {
    const day = calendarDay(record.sharedOn);
    return record.kind === "initiative" && day !== undefined && day <= today;
  });
  const recent = [...shared]
    .sort((a, b) => b.sharedOn!.localeCompare(a.sharedOn!) || a.title.localeCompare(b.title))
    .slice(0, 3);
  const upcoming = funding
    .flatMap((record) => {
      const days = daysUntil(record.closes, asOf);
      return record.kind === "funding" && days !== undefined && days >= 0 ? [{ record, days }] : [];
    })
    .sort((a, b) => a.days - b.days || a.record.title.localeCompare(b.record.title))
    .slice(0, 3);
  return { recent, upcoming, sharedCount: shared.length };
}

export function fullDate(iso: string, dateStyle: "medium" | "long" = "long"): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle, timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
