import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { editsFromForm } from "../src/describe/forms.ts";
import { continueWithFields } from "../src/describe/screen.ts";
import { daysUntil, homeDoors, homePreviews, openLabel, resumeLabel } from "../src/home.ts";
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
  const result = homePreviews(records, [], "2026-11-04");
  assert.deepEqual(
    result.recent.map((item) => item.id),
    ["newly-shared", "second", "third"],
  );
  assert.equal(result.sharedCount, 4);
  assert.deepEqual(records, before);
});

test("Home keeps the earliest three upcoming deadlines, including today, without scores or rolling dates", () => {
  const funds = Object.freeze([
    record("later", { kind: "funding", closes: "2027-01-15", fit: "strong" }),
    record("tomorrow", { kind: "funding", closes: "2026-11-05" }),
    record("past", { kind: "funding", closes: "2026-11-03" }),
    record("unknown", { kind: "funding" }),
    record("rolling", { kind: "funding", closes: "rolling" }),
    record("invalid", { kind: "funding", closes: "2026-11-31" }),
    record("today", { kind: "funding", closes: "2026-11-04", fit: "possible" }),
    record("month-end", { kind: "funding", closes: "2026-11-30" }),
  ]);
  const before = [...funds];
  const selected = homePreviews([], funds, "2026-11-04").upcoming;
  assert.deepEqual(
    selected.map(({ record, days }) => [record.id, days]),
    [
      ["today", 0],
      ["tomorrow", 1],
      ["month-end", 26],
    ],
  );
  assert.deepEqual(funds, before);
});

test("days left uses calendar days across daylight saving, leap days and invalid dates", () => {
  assert.equal(daysUntil("2026-11-02", "2026-10-31"), 2);
  assert.equal(daysUntil("2028-03-01", "2028-02-28"), 2);
  assert.equal(daysUntil("2026-11-03", "2026-11-04"), -1);
  assert.equal(daysUntil(undefined, "2026-11-04"), undefined);
  assert.equal(daysUntil("2026-02-30", "2026-11-04"), undefined);
  assert.throws(() => daysUntil("2026-11-04", "not-a-date"), /reference date/);
});

test("Home has no invented records or activity when no feed is supplied", () => {
  assert.deepEqual(homePreviews([], [], "2026-11-04"), { recent: [], upcoming: [], sharedCount: 0 });
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
