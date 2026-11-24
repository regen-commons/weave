// The describe flow's steps, shared by the flow tests, the axe scan and the screenshots.
import { expect, type Page } from "@playwright/test";

/** What a person types on step 1 in every test: a name, a place and what the initiative does. */
export const RIVER_KEEPERS = "We are River Keepers, based in Nairobi, Kenya. We restore the riverbank with young people every Saturday.";

/** The step's one box for words. Its label says "Listening" while speech runs, so it is found by its place. */
export const box = (page: Page) => page.locator("textarea.rc-voice-transcript");
export const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
export const continueButton = (page: Page) => page.getByRole("button", { name: "Continue", exact: true });
/** The cards on a list: its own items, not the lists inside each card. */
export const cards = (page: Page, list: "Your needs" | "Your offers") => page.locator(`ul[aria-label="${list}"] > li`);

/**
 * Types into a step's box and adds what it says, as a person does with the keyboard. The step is
 * inert until this device's draft has opened, which no person can type into; a fill made sooner is
 * lost when the draft opens, so this waits for the step first and checks the words are there.
 */
export async function addTyped(page: Page, words: string) {
  const step = page.locator('section[aria-labelledby="ask-needs-title"], section[aria-labelledby="ask-offers-title"]');
  await expect(step).toHaveCount(1);
  await expect(step).not.toHaveAttribute("inert");
  await step.locator("textarea.rc-voice-transcript").fill(words);
  await expect(step.locator("textarea.rc-voice-transcript")).toHaveValue(words);
  await step.getByRole("button", { name: "Add To List" }).click();
}

/** Step 1 by typing, through Fill In The Fields, to the needs step. */
export async function typeStepOne(page: Page) {
  await page.goto("/start/new");
  await expect(page).toHaveURL(/\/start\/initiative$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tell Us About Your Initiative");
  await box(page).fill(RIVER_KEEPERS);
  await page.getByRole("button", { name: "Fill In The Fields" }).click();
  await expect(field(page, "Name")).toHaveValue("River Keepers");
  await expect(field(page, "Where you work")).toHaveValue("Nairobi, Kenya");
  await expect(field(page, "About it")).toHaveValue(/restore the riverbank/u);
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/start\/needs$/u);
}

export async function describeByTyping(page: Page) {
  await typeStepOne(page);
  await addTyped(page, "We need native seedlings.\nWe need a water pump.");
  await expect(cards(page, "Your needs")).toHaveCount(2);
  await continueButton(page).click();

  await expect(page).toHaveURL(/\/start\/offers$/u);
  await addTyped(page, "We can teach composting.");
  await expect(cards(page, "Your offers")).toHaveCount(1);
  await continueButton(page).click();
  await expect(page).toHaveURL(/\/your-initiative$/u);
}
