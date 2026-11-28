import type { Entry } from "./funding/contracts.ts";
import { timeToClose } from "./funding/select.ts";
import type { ListingRecord } from "./listing.ts";
import type { RouteName } from "./routes.ts";

const DAY = 86_400_000;
function calendarDay(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY
    : undefined;
}

/**
 * How many cards a Home preview holds: one row of funding and two rows of shared initiatives, at the
 * four a row of a large desktop. The card grid shows whole rows only, so a narrower screen shows
 * three and six.
 */
export const FUNDING_PREVIEW_COUNT = 4;
export const RECENT_PREVIEW_COUNT = 8;

/** Funding counts as closing soon within this many days, the Funding page's first closing filter. */
export const CLOSING_SOON_DAYS = 30;

/** Public preview selection uses sharing dates, never match scores. */
export function homePreviews(initiatives: readonly ListingRecord[], asOf: string) {
  const today = calendarDay(asOf);
  if (today === undefined) throw new Error("Home needs a valid reference date");
  const shared = initiatives.filter((record) => {
    const day = calendarDay(record.sharedOn);
    return record.kind === "initiative" && day !== undefined && day <= today;
  });
  const recent = [...shared]
    .sort((a, b) => b.sharedOn!.localeCompare(a.sharedOn!) || a.title.localeCompare(b.title))
    .slice(0, RECENT_PREVIEW_COUNT);
  return { recent, sharedCount: shared.length };
}

/**
 * What Home shows of the funding catalog: the open calls that close soonest, never ranked by
 * fit, and how many close within the Funding page's first closing filter. Both use the filter's own
 * rule, so the hero's number matches the list its link opens.
 */
export function fundingPreviews(entries: readonly Entry[], now: Date) {
  const open = entries.flatMap((entry) => {
    const left = timeToClose(entry, now);
    return left >= 0 ? [{ entry, left }] : [];
  });
  const upcoming = [...open]
    .sort(
      (a, b) =>
        a.left - b.left ||
        a.entry.fund.displayName.localeCompare(b.entry.fund.displayName) ||
        (a.entry.program?.name ?? "").localeCompare(b.entry.program?.name ?? ""),
    )
    .slice(0, FUNDING_PREVIEW_COUNT)
    .map(({ entry }) => entry);
  const closingSoon = open.filter(({ left }) => left <= CLOSING_SOON_DAYS * DAY).length;
  return { upcoming, closingSoon };
}

export function fullDate(iso: string, dateStyle: "medium" | "long" = "long"): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle, timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** The resume link is named for where it goes: the initiative's own page once nothing is left to add. */
export function resumeLabel(route: RouteName): string {
  return route === "your-initiative" ? "Open Your Initiative" : "Continue Your Initiative";
}

/**
 * The second door is named for what it opens. It names Certified only where a Certified project
 * can be behind it: the example world, for someone not signed in yet or with projects there.
 * Everyone else opens Your Initiatives, the drafts on this device (DL-155: nothing is saved in Weave).
 */
export function openLabel(certified: { readonly signedIn: boolean; readonly projects: number } | null): string {
  return certified && (!certified.signedIn || certified.projects > 0)
    ? "Open One From Certified"
    : "Open Your Initiatives";
}
