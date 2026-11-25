// The feedback sheet sends the website's fields, the page's address without its query, and the hidden
// field as it is; it keeps one request key for a retry of the same words; and every answer it can get has
// words that say what happened and what to do.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_LABELS,
  FEEDBACK_CATEGORIES,
  failureText,
  feedbackBody,
  messageProblem,
  sendFeedback,
  websiteFormHref,
} from "../src/feedback/send.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const KEY = "0b7f4c1e-2f5d-4a8b-9c3d-1e2f3a4b5c6d";

test("the message is checked as the server checks it", () => {
  assert.equal(messageProblem("  hi  "), "Write at least 3 characters.");
  assert.equal(messageProblem("abc"), null);
  assert.equal(messageProblem("a".repeat(5000)), null);
  assert.match(messageProblem("a".repeat(5001))!, /Shorten it to 5,000 characters\. It is 5,001 now\./u);
});

test("the body holds the website's fields, the categories in the sheet's order, and the hidden field as it is", () => {
  const body = JSON.parse(feedbackBody({ message: "Great list", categories: ["Other", "Bug"], pathname: "/funding", honeypot: "" }));
  assert.deepEqual(body, { message: "Great list", categories: ["Bug", "Other"], page_path: "/funding", website_confirm: "" });
  assert.equal(JSON.parse(feedbackBody({ message: "x", categories: [], pathname: "/", honeypot: "bot" })).website_confirm, "bot");
});

test("every kind has a chip label in sentence case, and the value sent stays the website's", () => {
  assert.deepEqual(Object.keys(CATEGORY_LABELS), [...FEEDBACK_CATEGORIES]);
  for (const label of Object.values(CATEGORY_LABELS)) assert.match(label, /^[A-Z][a-z ]+$/u, label);
  assert.equal(CATEGORY_LABELS["Fine Tuning"], "Fine tuning");
});

test("a post goes to Weave's own address with its request key and no cookie, and each answer is read safely", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const answering = (status: number, body: string) =>
    (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(body, { status });
    }) as unknown as typeof fetch;
  assert.deepEqual(await sendFeedback("{}", KEY, { fetcher: answering(200, '{"ok":true}') }), { ok: true });
  assert.equal(seen[0]!.url, "/api/feedback");
  assert.deepEqual(seen[0]!.init.headers, { "Content-Type": "application/json", "Idempotency-Key": KEY });
  assert.equal(seen[0]!.init.credentials, "omit");
  assert.deepEqual(await sendFeedback("{}", KEY, { fetcher: answering(429, '{"error":"rate_limited"}') }), { ok: false, reason: "rate_limited" });
  assert.deepEqual(await sendFeedback("{}", KEY, { fetcher: answering(502, "<html>") }), { ok: false, reason: "feedback_unavailable" });
  assert.deepEqual(await sendFeedback("{}", KEY, { fetcher: answering(200, '{"saved":true}') }), { ok: false, reason: "feedback_unavailable" });
  const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
  assert.deepEqual(await sendFeedback("{}", KEY, { fetcher: offline }), { ok: false, reason: "offline" });
});

test("every failure says what happened, that the words are still there, and what to do", () => {
  for (const reason of ["rate_limited", "offline", "feedback_unavailable", "origin_required", "body_too_large"] as const) {
    const text = failureText(reason);
    assert.match(text, /still here/u, reason);
    assert.doesNotMatch(text, /oops|something went wrong|—/iu, reason);
  }
  assert.match(failureText("rate_limited"), /form on the Regen Commons website/u);
  assert.match(failureText("invalid_feedback"), /3 to 5,000 characters/u);
});

test("the website's own form is named with this page, for when Weave cannot pass feedback on", () => {
  assert.equal(websiteFormHref("/funding"), "https://regencommons.com/feedback?from=%2Fweave%2Ffunding");
  assert.equal(websiteFormHref("/"), "https://regencommons.com/feedback?from=%2Fweave");
  assert.equal(websiteFormHref("bad path"), "https://regencommons.com/feedback?from=%2Fweave");
});

test("the sheet sends the page's path, never its query, keeps one key per set of words, and every page has the tab", () => {
  const sheet = read("src/feedback/Feedback.tsx");
  assert.match(sheet, /feedbackBody\(\{ message, categories, pathname, honeypot:/u);
  assert.match(sheet, /if \(request\.current\?\.body !== body\) request\.current = \{ body, key: crypto\.randomUUID\(\) \};/u);
  assert.match(sheet, /<div hidden>/u, "the hidden field is never shown");
  assert.match(sheet, /tabIndex=\{-1\} autoComplete="off"/u, "and never reached by the keyboard");
  const page = read("src/ui/Page.tsx");
  assert.match(page, /<Feedback pathname=\{pathname\} form=\{form\} \/>/u);
  // Page's pathname is the route's path alone, with its query split off.
  const app = read("src/App.tsx");
  assert.match(app, /const \{ pathname, search \} = splitRoute\(location\);/u);
  assert.match(app, /const pageLocation = under \? splitRoute\(under\.route\) : \{ pathname, search \};/u);
  assert.match(app, /const pagePath = pageLocation\.pathname;/u);
  assert.match(app, /<Page\s+pathname=\{pagePath\}/u);
});
