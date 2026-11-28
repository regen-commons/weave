import { expect, test, type Page } from "@playwright/test";
import { PRESENCE_KEY } from "../src/account/presence.ts";
import { workspaceResumeKey } from "../src/initiative/workspace-resume.ts";

test.use({ serviceWorkers: "block" });

const owner = "10000000-0000-4000-8000-000000000001";
const workspaceId = "10000000-0000-4000-8000-000000000002";
const groupDid = "did:plc:example";
const projectUri = `at://${groupDid}/org.hypercerts.collection/example`;
const signedIn = { available: true, signIn: "certified", user: { id: owner, email: null } };
const homeActions = ".rc-home-actions > a";
const headerSignIn = ".rc-app-header-state .rc-button";

async function homeGeometry(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.locator([
    ".rc-app-head", ".rc-app-header-lead", ".rc-app-header-state", "button[aria-label$=' theme']",
    "[data-account-pending], button[aria-label=Account]", "#home-title", homeActions,
  ].join(",")).evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height, variant: element.closest(".rc-home-actions") && element.getAttribute("data-variant") };
  }));
}

for (const theme of ["light", "dark"] as const) {
  test(`signed-in refresh holds the app header and Home actions in ${theme} mode`, async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === "wide";
    const mobileWidth = Number(process.env.WEAVE_REFRESH_MOBILE_WIDTH ?? 360);
    if (!desktop) await page.setViewportSize({ width: mobileWidth, height: 780 });
    await page.emulateMedia({ colorScheme: theme });
    const appCode = Promise.withResolvers<void>();
    const account = Promise.withResolvers<void>();
    const projects = Promise.withResolvers<void>();
    let reloading = false;
    await page.route(/\/assets\/index-[^/]+\.js$/u, async route => {
      if (reloading) await appCode.promise;
      await route.continue();
    });
    await page.route("**/api/account", async route => {
      if (reloading) await account.promise;
      await route.fulfill({ json: signedIn });
    });
    await page.route("**/api/projects", async route => {
      const { action } = route.request().postDataJSON();
      if (action === "list_workspaces" && reloading) {
        await projects.promise;
        await route.fulfill({ json: { workspaces: [
          { workspaceId, kind: "group", accessRole: "editor", projectUri,
            project: { uri: projectUri, repoDid: groupDid, groupDid, cid: "example", title: "Orchard circle" } },
        ] } });
      } else {
        await route.fulfill({ json: action === "list_workspaces" ? { workspaces: [] }
          : action === "list_project_groups" ? { groups: [] } : { projects: [] } });
      }
    });

    try {
      await page.goto("/");
      await page.waitForFunction(key => localStorage.getItem(key) === "1", PRESENCE_KEY);
      await page.evaluate(({ key, id }) => localStorage.setItem(key, id), { key: workspaceResumeKey(owner), id: workspaceId });
      reloading = true;
      await page.reload({ waitUntil: "commit" });
      await expect(page.locator("#root[data-first-view='/']")).toBeAttached();
      await expect(page.locator(homeActions)).toHaveCount(2);
      const firstView = await homeGeometry(page);
      await expect(page.locator(headerSignIn)).toHaveCount(0);

      appCode.resolve();
      const actions = page.locator(homeActions);
      const accountButton = page.getByRole("button", { name: "Account", exact: true });
      await expect(page.locator("#root[data-first-view]")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Open Your Saved Initiative", exact: true })).toBeVisible();
      await expect(page.locator(headerSignIn)).toHaveCount(0);
      await expect(accountButton).toHaveCount(0);
      expect(await homeGeometry(page)).toEqual(firstView);
      if (process.env.WEAVE_REFRESH_PROOF_DIR) {
        const width = page.viewportSize()?.width;
        await page.screenshot({ path: `${process.env.WEAVE_REFRESH_PROOF_DIR}/home-${width}-${theme}-checking.png` });
      }
      await actions.first().focus();
      await page.keyboard.press("Tab");
      await expect(actions.last()).toBeFocused();

      const workspaceRequest = page.waitForRequest(request =>
        request.url().endsWith("/api/projects") && request.postDataJSON()?.action === "list_workspaces");
      account.resolve();
      await workspaceRequest;
      if (desktop) await expect(accountButton).toBeVisible();
      else await expect(accountButton).toHaveCount(0);
      expect(await homeGeometry(page)).toEqual(firstView);

      projects.resolve();
      await expect(page.getByRole("link", { name: "Continue Your Initiative", exact: true }))
        .toHaveAttribute("href", `/workspaces/${workspaceId}`);
      await expect(actions).toHaveCount(2);
      expect(await homeGeometry(page)).toEqual(firstView);
      await expect(page.locator(headerSignIn)).toHaveCount(0);
      await expect(actions.first()).toHaveText("Start An Initiative");
      await expect(actions.last()).toBeFocused();
      if (desktop) {
        await accountButton.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(accountButton).toBeFocused();
      }
      if (process.env.WEAVE_REFRESH_PROOF_DIR) {
        const width = page.viewportSize()?.width;
        await page.screenshot({ path: `${process.env.WEAVE_REFRESH_PROOF_DIR}/home-${width}-${theme}-signed-in.png` });
      }
    } finally {
      appCode.resolve();
      account.resolve();
      projects.resolve();
    }
  });
}

test("Sign In becomes available when session verification fails", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, "1"), PRESENCE_KEY);
  const account = Promise.withResolvers<void>();
  await page.route("**/api/account", async route => {
    await account.promise;
    await route.abort("failed");
  });
  try {
    await page.goto("/");
    await expect(page.locator("#root[data-first-view]")).toHaveCount(0);
    await expect(page.locator(headerSignIn)).toHaveCount(0);
    account.resolve();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  } finally {
    account.resolve();
  }
});
