// A funding card's deadline: counted in days near its end, toned when close, a date further out (DL-103).
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEADLINE_COUNTED_DAYS, DEADLINE_SOON_DAYS, daysToDeadline, deadlineSign } from "../src/funding/deadline.ts";

const now = new Date("2026-11-18T10:00:00Z");
const sign = (deadline: string, closed = false) => deadlineSign(deadline, closed, now);

test("days are counted to the end of the closing day in UTC, as the Closing filter counts them", () => {
  assert.equal(daysToDeadline("2026-11-18", now), 0);
  assert.equal(daysToDeadline("2026-11-19", now), 1);
  assert.equal(daysToDeadline("2026-11-30", now), 12);
  assert.equal(daysToDeadline("2026-11-17", now), -1);
  assert.equal(daysToDeadline("2026-11-18", new Date("2026-11-18T23:59:58Z")), 0, "still open in the day's last second");
  assert.equal(daysToDeadline("2026-11-18", new Date("2026-11-19T00:00:00Z")), -1);
});

test("near its end a card counts the days in words, and the words alone say how close it is", () => {
  assert.deepEqual(sign("2026-11-30"), { label: "Closes in 12 days", dated: false, soon: true });
  assert.deepEqual(sign("2026-11-18"), { label: "Closes today", dated: false, soon: true });
  assert.deepEqual(sign("2026-11-19"), { label: "Closes tomorrow", dated: false, soon: true });
  assert.equal(sign("2026-11-20").label, "Closes in 2 days");
});

test("the tone marks the last two weeks only; the count runs on for two months", () => {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  assert.equal(sign(day(DEADLINE_SOON_DAYS)).soon, true);
  assert.equal(sign(day(DEADLINE_SOON_DAYS + 1)).soon, false);
  assert.deepEqual(sign(day(DEADLINE_SOON_DAYS + 1)), { label: `Closes in ${DEADLINE_SOON_DAYS + 1} days`, dated: false, soon: false });
  assert.equal(sign(day(DEADLINE_COUNTED_DAYS)).label, `Closes in ${DEADLINE_COUNTED_DAYS} days`);
  assert.deepEqual(sign(day(DEADLINE_COUNTED_DAYS + 1)), { label: "Closes", dated: true, soon: false }, "further out the date says more");
});

test("a date that has passed, or a call the catalog reads as closed, has ended and is never toned", () => {
  assert.deepEqual(sign("2026-11-17"), { label: "Ended", dated: true, soon: false });
  assert.deepEqual(sign("2026-11-30", true), { label: "Ended", dated: true, soon: false });
});
