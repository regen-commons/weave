// Pictures of the describe flow's key steps at 360 and 1280, compared with the committed ones. They are
// taken and compared only in the Playwright Linux image CI runs in, because fonts render differently
// elsewhere, so the test runs only where WEAVE_SCREENSHOTS=1, as the workflow sets. To accept a change,
// take the new pictures from the failed run's "screenshots" artifact, as the README in this folder says.
import { expect, test, type Page } from "@playwright/test";
import { RIVER_KEEPERS, addTyped, box, continueButton, field } from "./flow.ts";

const stylePath = new URL("./screenshot.css", import.meta.url).pathname;
const picture = (page: Page, name: string) => expect(page).toHaveScreenshot(name, { fullPage: true, stylePath });

test.skip(!process.env.WEAVE_SCREENSHOTS, "Pictures are compared only in the image CI takes them in (WEAVE_SCREENSHOTS=1).");

test("the describe flow's key steps", async ({ page }) => {
  await page.goto("/start/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tell Us About Your Initiative");
  await picture(page, "1-describe-blank.png");

  await box(page).fill(RIVER_KEEPERS);
  await page.getByRole("button", { name: "Fill In The Fields" }).click();
  await expect(field(page, "Name")).toHaveValue("River Keepers");
  await picture(page, "2-describe-filled.png");

  await continueButton(page).click();
  await expect(page).toHaveURL(/\/start\/needs$/u);
  await addTyped(page, "We need native seedlings.\nWe need a water pump.");
  await expect(page.locator('ul[aria-label="Your needs"] > li')).toHaveCount(2);
  await picture(page, "3-needs.png");

  await continueButton(page).click();
  await addTyped(page, "We can teach composting.");
  await expect(page.locator('ul[aria-label="Your offers"] > li')).toHaveCount(1);
  await picture(page, "4-offers.png");

  await continueButton(page).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("River Keepers");
  // Only the card itself: funding and partners come from the catalog and the public list, which change on
  // their own and would change the page's height with them.
  await expect(page.locator('section[aria-labelledby="finish-card"]')).toHaveScreenshot("5-your-card.png", { stylePath });
});
