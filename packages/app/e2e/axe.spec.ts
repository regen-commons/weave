// axe on every route, in light and dark, at 360 and 1280: a first visit, and the same routes with a checked
// card. WCAG 2.2 AA is the PRD's bar. A failure lists each rule, its impact and the elements it found.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { describeByTyping } from "./flow.ts";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Every page a person can reach without an account. A record is the fund page every catalog holds. */
const FIRST_VISIT = ["/", "/initiatives", "/funding", "/funding/local-nlnet", "/start/initiative", "/your-initiatives", "/partners", "/settings", "/no-such-page"];
/** The pages that change once a card is checked. */
const WITH_A_CARD = ["/start/initiative", "/start/needs", "/start/offers", "/your-initiative", "/your-initiatives", "/funding", "/"];

async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("main").waitFor();
  // A page drawn by the app settles once its first data has arrived.
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n")}`);
  expect(report, `axe found WCAG 2.2 AA problems on ${path}:\n${report.join("\n")}`).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of FIRST_VISIT)
      test(`first visit ${path}`, async ({ page }) => {
        await scan(page, path);
      });

    test("with a checked card, every page it changes", async ({ page }) => {
      await describeByTyping(page);
      for (const path of WITH_A_CARD) await test.step(path, () => scan(page, path));
    });
  });
}
