import { expect, test, type Page } from "@playwright/test";
import { emptyFundingForm } from "../src/funding/contracts.ts";
import { describeByTyping } from "./flow.ts";

// Public project descriptions, with fixture accounts, membership and workspace documents.
const greenGoods = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "Green Goods",
  description: "Green Goods supports community-led regenerative projects in land restoration, waste, education and clean energy. Communities can plan work, document evidence, review contributions and connect their activity with support.",
  isGlobal: true,
};
const techAndSun = {
  id: "00000000-0000-4000-8000-000000000022",
  name: "Tech & Sun: Solar Hubs for Builders and Communities in Nigeria",
  description: "Tech & Sun builds solar-powered hubs that transform how students and builders in Nigeria access electricity, internet, and opportunity. Our pilot hub in Awka is already live, and students and builders use it daily. Now we're scaling to Enugu and beyond.",
  isGlobal: false,
};

test.use({ serviceWorkers: "block" });

async function fixtureAccount(page: Page, project: typeof greenGoods) {
  const repoDid = "did:plc:fundingworkspacefixture";
  const uri = `at://${repoDid}/org.hypercerts.collection/funding-qa`;
  const publicProject = { uri, repoDid, groupDid: repoDid, cid: "test", title: project.name, description: project.description };
  await page.route("**/api/account", (route) => route.fulfill({ json: {
    available: true, signIn: "certified", user: { id: "00000000-0000-4000-8000-000000000033" },
  } }));
  await page.route("**/api/projects", (route) => {
    const command = route.request().postDataJSON();
    switch (command.action) {
      case "list_project_groups":
        return route.fulfill({ json: { groups: [{ groupDid: repoDid, role: "member" }] } });
      case "list_workspaces":
        return route.fulfill({ json: { workspaces: [
          { workspaceId: project.id, projectUri: uri, kind: "group", accessRole: "viewer", project: publicProject },
        ] } });
      case "list_projects":
        return route.fulfill({ json: { projects: [] } });
      case "team_load":
        if (command.workspaceId !== project.id)
          return route.fulfill({ status: 403, json: { error: "workspace_access_required" } });
        return route.fulfill({ json: { accessRole: "viewer", saved: {
          id: project.id, revision: 1, updatedAt: "2026-11-24T00:00:00Z",
          document: {
            version: 1,
            initiative: {
              name: project.name, description: project.description, locations: [], isGlobal: project.isGlobal,
              links: [], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [],
            },
            needs: [], offers: [], funding: { form: emptyFundingForm(), programAnswers: {} },
          },
        } } });
      default:
        return route.fulfill({ status: 400, json: { error: "invalid_request" } });
    }
  });
}

/** Read the stored drafts, backups and active draft pointer without changing any of them. */
async function deviceState(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      value.onsuccess = () => resolve(value.result);
      value.onerror = () => reject(value.error);
    });
    const database = await request(indexedDB.open("weave-drafts"));
    try {
      const tx = database.transaction(["drafts", "backups", "meta"]);
      return await Promise.all([
        request(tx.objectStore("drafts").getAll()),
        request(tx.objectStore("backups").getAll()),
        request(tx.objectStore("meta").get("last")),
      ]);
    } finally {
      database.close();
    }
  });
}

for (const project of [greenGoods, techAndSun]) {
  for (const withDraft of [false, true]) {
    test(`${project.name} keeps the same funding order and details ${withDraft ? "with another draft" : "without a draft"}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: withDraft ? "dark" : "light" });
      await fixtureAccount(page, project);
      if (withDraft) await describeByTyping(page);
      await page.goto("/your-initiatives");
      const certified = page.getByRole("region", { name: "Certified Projects" });
      await expect(certified.getByRole("button", { name: project.name })).toBeVisible();
      if (withDraft) await expect(page.getByRole("button", { name: "River Keepers" })).toBeVisible();
      const before = await deviceState(page);

      await certified.getByRole("button", { name: project.name }).click();
      const preview = page.getByRole("region", { name: "Funding That Fits" });
      const previewLinks = preview.locator("h3 a");
      await expect(previewLinks).toHaveCount(2);
      const expected = await previewLinks.allTextContents();
      const firstFit = await preview.locator(".rc-fit").first().innerText();
      const browse = preview.getByRole("link", { name: "Browse All Funding" });
      await expect(browse).toHaveAttribute("href", `/funding?workspace=${project.id}`);
      await expect(previewLinks.first()).toHaveAttribute("href", new RegExp(`workspace=${project.id}`, "u"));
      await browse.focus();
      await page.keyboard.press("Enter");

      const main = page.getByRole("main");
      await expect(main.getByText(`Showing what fits ${project.name}.`)).toBeVisible();
      const fundLinks = main.locator("h2.rc-card-title a");
      await expect(fundLinks.first()).toHaveText(expected[0]!);
      await expect(fundLinks.nth(1)).toHaveText(expected[1]!);
      await expect(main.getByRole("button", { name: "Edit Details" })).toHaveCount(0);
      const selector = main.getByRole("button", { name: "Change Initiative" });
      await selector.focus();
      await page.keyboard.press("Enter");
      await expect(main.getByRole("radio", { name: project.name })).toBeChecked();
      await expect(main.getByRole("radio", { name: "River Keepers" })).toHaveCount(withDraft ? 1 : 0);
      await page.keyboard.press("Escape");
      if (process.env.WEAVE_FUNDING_PROOF) {
        await page.screenshot({ path: info.outputPath("funding.png") });
        if (info.project.name === "phone") {
          await page.setViewportSize({ width: 375, height: 780 });
          await page.screenshot({ path: info.outputPath("funding-375.png") });
        }
      }

      await fundLinks.first().click();
      const details = page.getByRole("dialog");
      await expect(details.getByText(`Showing what fits ${project.name}.`)).toBeVisible();
      await expect(details.locator(".rc-fit")).toHaveText(firstFit);
      await expect(details.locator("select")).toHaveCount(0);
      await page.goBack();
      await expect(main.getByText(`Showing what fits ${project.name}.`)).toBeVisible();
      await expect(fundLinks.first()).toHaveText(expected[0]!);
      expect(await deviceState(page)).toEqual(before);

      await selector.click();
      await main.getByRole("radio", { name: "No initiative" }).check();
      await expect(main.getByText("No initiative chosen, so fit is not shown or sorted on.")).toBeVisible();
      await expect(page).toHaveURL(/initiative=none$/u);
      const projectChoice = main.getByRole("radio", { name: project.name });
      await projectChoice.click();
      await expect(projectChoice).toBeChecked();
      await expect(fundLinks.first()).toHaveText(expected[0]!);
      expect(await deviceState(page)).toEqual(before);

      const detailHref = await fundLinks.first().getAttribute("href");
      expect(detailHref).toContain(`workspace=${project.id}`);
      await page.goto(detailHref!);
      await expect(main.getByText(`Showing what fits ${project.name}.`)).toBeVisible();
      await expect(main.locator(".rc-fit")).toHaveText(firstFit);
      await expect(main.locator("select")).toHaveCount(0);
      expect(await deviceState(page)).toEqual(before);
    });
  }
}

test("a refused workspace comparison leaves the existing draft intact", async ({ page }) => {
  await fixtureAccount(page, greenGoods);
  await describeByTyping(page);
  const before = await deviceState(page);
  await page.goto(`/funding?workspace=${techAndSun.id}`);
  await expect(page.getByText("Weave could not open this workspace to compare funding.")).toBeVisible();
  await expect(page.getByText("Showing what fits River Keepers.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Details" })).toHaveCount(0);
  expect(await deviceState(page)).toEqual(before);
});
