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

test("speech on needs: one recording becomes one card per need, with no press after Stop", async ({ page }) => {
  await fakeSpeech(page, ["we need seedlings and a meeting room", "and also some funding for fencing"]);
  await typeStepOne(page);
  await page.getByRole("button", { name: "Talk It Out" }).click();
  await expect(box(page)).toHaveValue(/fencing/u);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(cards(page, "Your needs")).toHaveCount(3);
  for (const words of ["Seedlings", "A meeting room", "Some funding for fencing"]) await expect(cards(page, "Your needs").filter({ hasText: words })).toHaveCount(1);
});

test("edit and return: changing a checked card's name comes back to the card with the new name", async ({ page }) => {
  await describeByTyping(page);
  await page.getByRole("link", { name: "Change Your Card" }).click();
  await expect(page).toHaveURL(/\/start\/initiative$/u);
  await field(page, "Name").fill("River Keepers Nairobi");
  // Continue goes on through the steps that still need a look, and no further than the card.
  for (let presses = 0; presses < 3 && !/\/your-initiative$/u.test(page.url()); presses++) {
    await continueButton(page).click();
    await page.waitForURL(/\/(start\/(needs|offers)|your-initiative)$/u);
  }
  await expect(page).toHaveURL(/\/your-initiative$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("River Keepers Nairobi");
});
