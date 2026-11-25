// The describe flow on the production build: words in, a checked card out. Each test starts with an empty
// browser, as a first visit does, and keeps everything on the device.
import { expect, test } from "@playwright/test";
import { fakeSpeech } from "./fake-speech.ts";
import { box, cards, continueButton, describeByTyping, field, typeStepOne } from "./flow.ts";

test("typing: the three steps make a checked card, with its needs and offers", async ({ page }) => {
  await describeByTyping(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("River Keepers");
  const main = page.getByRole("main");
  for (const words of ["Native seedlings", "A water pump", "Teach composting"]) await expect(main.getByText(words, { exact: false }).first()).toBeVisible();
});

test("speech: a recognizer's words fill the fields, and a list said in one go makes a card for each", async ({ page }) => {
  await fakeSpeech(page, ["we're called river keepers and we're based in nairobi kenya", "we restore the riverbank with young people every saturday"]);
  await page.goto("/start/new");
  await expect(page).toHaveURL(/\/start\/initiative$/u);
  await page.getByRole("button", { name: "Talk It Out" }).click();
  await expect(box(page)).toHaveValue(/every saturday/u);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(field(page, "Name")).toHaveValue("River Keepers");
  await expect(field(page, "Where you work")).toHaveValue(/Nairobi/u);
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/start\/needs$/u);
});

test("a known cloud quota reset holds the microphone while typing stays open", async ({ page }) => {
  const now = new Date("2026-11-25T09:00:00Z");
  const reset = new Date("2026-11-25T09:10:00Z");
  await page.clock.install({ time: now });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
    class Recorder {
      static isTypeSupported() { return true; }
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(["fixture audio"]) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { value: Recorder });
  });
  let attempts = 0;
  await page.route("**/api/transcribe", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { enabled: true, maxSeconds: 180, maxBytes: 3_000_000 } });
      return;
    }
    attempts++;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": reset.toUTCString() },
      json: { error: "speech_caller_limited" },
    });
  });
  await page.goto("/start/new");
  const talk = page.getByRole("button", { name: "Talk It Out", exact: true });
  await talk.click();
  await page.getByRole("button", { name: "Agree And Record" }).click();
  await expect(page.getByText(/^Recording 0:/u)).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const notice = page.getByRole("status").filter({ hasText: "This connection has reached its limit" });
  await expect(notice).toContainText("or type in the box.");
  await expect(talk).toBeDisabled();
  await talk.press("Enter");
  await expect(notice).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await box(page).fill("Our orchard draft is still here.");
  await page.clock.fastForward(10 * 60_000);
  await expect(talk).toBeEnabled();
  await talk.click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect(attempts).toBe(1);
});

test("speech on needs: one recording becomes one card per need, with no press after Stop", async ({ page }) => {
  await fakeSpeech(page, ["we need seedlings and a meeting room", "and also some funding for fencing"]);
  await typeStepOne(page);
  await page.getByRole("button", { name: "Talk It Out" }).click();
  await expect(box(page)).toHaveValue(/fencing/u);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(cards(page, "Your needs")).toHaveCount(3);
  for (const words of ["Seedlings", "A meeting room", "Some funding for fencing"]) await expect(cards(page, "Your needs").filter({ hasText: words })).toHaveCount(1);
});

test("edit and return: a changed name on a checked card comes straight back to the card with one Continue", async ({ page }) => {
  await describeByTyping(page);
  await page.getByRole("link", { name: "Change Your Card" }).click();
  await expect(page).toHaveURL(/\/start\/initiative$/u);
  await field(page, "Name").fill("River Keepers Nairobi");
  // The needs and offers were checked and did not change, so the person is not walked through them again.
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/your-initiative$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("River Keepers Nairobi");
  await expect(page.getByRole("main").getByText("Teach composting", { exact: false }).first()).toBeVisible();
});
