import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { editsFromForm } from "../src/describe/forms.ts";
import { continueWithFields } from "../src/describe/screen.ts";
import { fundingFixture, readFixtures } from "../src/fixtures.ts";
import { catalogEntries } from "../src/funding/catalog.ts";
import { emptyFundingFilters, filterFunding } from "../src/funding/select.ts";
import { CLOSING_SOON_DAYS, fundingPreviews, homeDoors, homePreviews, openLabel, resumeLabel } from "../src/home.ts";
import { cardRoute } from "../src/initiative/status.ts";
import type { ListingRecord } from "../src/listing.ts";

const record = (id: string, fields: Partial<ListingRecord> = {}): ListingRecord => ({
  id,
  kind: "initiative",
  title: id,
  description: "Invented example",
  country: "Brazil",
  place: "Example valley",
  work: [],
  stage: "seed",
  needs: [],
  offers: [],
  reasons: [],
  confirmed: "2026-11-04",
  ...fields,
});

test("Home uses public sharing dates, excludes unpublished/future rows and keeps the latest three", () => {
  const records = Object.freeze([
    record("confirmed-today", { sharedOn: "2026-10-01" }),
    record("newly-shared", { sharedOn: "2026-11-04", confirmed: "2026-09-01" }),
    record("unpublished"),
    record("future", { sharedOn: "2026-11-05" }),
    record("third", { sharedOn: "2026-11-02" }),
    record("second", { sharedOn: "2026-11-03" }),
  ]);
  const before = [...records];
  const result = homePreviews(records, "2026-11-04");
  assert.deepEqual(
    result.recent.map((item) => item.id),
    ["newly-shared", "second", "third"],
  );
  assert.equal(result.sharedCount, 4);
  assert.deepEqual(records, before);
});

/** Catalog entries made the way the example world makes them, closing on the given dates. */
const fundsClosing = (dates: Record<string, string | undefined>) =>
  catalogEntries(
    fundingFixture({
      ...readFixtures("?fixture=visitor"),
      funding: Object.entries(dates).map(([id, closes]) => record(id, { kind: "funding", closes })),
    }),
  );
const noon = new Date("2026-11-04T12:00:00Z");

test("Home shows the three open calls that close soonest, today included, never ranked by fit", () => {
  const entries = fundsClosing({
    later: "2027-01-15",
    tomorrow: "2026-11-05",
    past: "2026-11-03",
    "no-date": undefined,
    today: "2026-11-04",
    "month-end": "2026-11-30",
  });
  assert.deepEqual(
    fundingPreviews(entries, noon).upcoming.map((entry) => entry.fund.id),
    ["today", "tomorrow", "month-end"],
  );
});

test("Home has no invented records or activity when no feed is supplied", () => {
  assert.deepEqual(homePreviews([], "2026-11-04"), { recent: [], sharedCount: 0 });
  assert.deepEqual(fundingPreviews([], noon), { upcoming: [], closingSoon: 0 });
});

test("Home keeps one solid primary: resume a card, open one kept elsewhere, or start", () => {
  const newcomer = homeDoors(false, 0);
  const signedInElsewhere = homeDoors(false, 2);
  const returning = homeDoors(true, 0);
  assert.deepEqual(newcomer, { resume: false, start: "primary", open: "secondary" });
  assert.deepEqual(signedInElsewhere, { resume: false, start: "secondary", open: "primary" });
  assert.deepEqual(returning, { resume: true, start: null, open: null }, "a card to resume stands alone");
  assert.deepEqual(homeDoors(true, 2), returning, "a card on this device comes before ones kept elsewhere");
  for (const doors of [newcomer, signedInElsewhere, returning])
    assert.equal(
      [doors.resume, doors.start === "primary", doors.open === "primary"].filter(Boolean).length,
      1,
    );
});

test("Home's resume link is named for where the card stopped", () => {
  assert.equal(cardRoute(newDraft()), "initiative");
  assert.equal(resumeLabel("initiative"), "Continue your initiative");
  assert.equal(resumeLabel("check-card"), "Continue your initiative");

  // Continue from the four fields confirms the card, so home resumes at needs and offers.
  const form = { name: "Orchard circle", where: "Upper valley", about: "Families share growing skills.", links: "" };
  const typed = continueWithFields(revise(newDraft(), { form, publicEdits: editsFromForm(form, {}) }, true));
  assert.equal(cardRoute(typed), "needs");
  assert.equal(resumeLabel(cardRoute(typed)), "Continue your initiative");

  assert.equal(resumeLabel("your-initiative"), "Open your initiative");
});

test("the second door names Certified only where a Certified project can be behind it", () => {
  assert.equal(openLabel(null), "Open your saved initiative", "choosing a Certified project is an example only");
  assert.equal(openLabel({ signedIn: false, projects: 0 }), "Open one from Certified");
  assert.equal(openLabel({ signedIn: true, projects: 2 }), "Open one from Certified");
  assert.equal(
    openLabel({ signedIn: true, projects: 0 }),
    "Open your saved initiative",
    "a private save with no project is not on Certified",
  );
});

test("the hero counts exactly what the Funding page lists under its first closing filter", () => {
  const entries = fundsClosing({
    today: "2026-11-04",
    "closes-3-december": "2026-12-03",
    "closes-4-december": "2026-12-04",
    closed: "2026-11-03",
    "no-date": undefined,
  });
  assert.equal(CLOSING_SOON_DAYS, 30);
  const { closingSoon } = fundingPreviews(entries, noon);
  // The filter counts to the end of the closing day, so from noon 4 December is just past 30 days.
  assert.equal(closingSoon, 2);
  const listed = filterFunding(entries, { ...emptyFundingFilters, closing: String(CLOSING_SOON_DAYS) }, null, noon);
  assert.equal(closingSoon, listed.length);
});
