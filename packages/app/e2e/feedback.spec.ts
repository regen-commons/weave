// The Feedback tab: it opens the sheet from the keyboard, the sheet passes axe in both themes, and what it
// sends goes through Weave's own server to a stand-in for the Regen Commons website (WEAVE_FEEDBACK_UPSTREAM,
// set in playwright.config.ts). The stand-in records what reached it, so the test sees exactly what the
// website would. A failure keeps the words, a retry of the same words keeps its request key, and the tab never
// covers a step's way forward.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import http from "node:http";
import { FEEDBACK_UPSTREAM_PORT } from "../playwright.config.ts";

interface Received {
  readonly body: unknown;
  readonly headers: http.IncomingHttpHeaders;
}
const received: Received[] = [];
/** What the stand-in answers next. */
let answer: { status: number; body: unknown } = { status: 200, body: { ok: true } };
let upstream: http.Server;

test.beforeAll(async () => {
  upstream = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      received.push({ body: JSON.parse(text), headers: request.headers });
      response.writeHead(answer.status, { "content-type": "application/json" }).end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(FEEDBACK_UPSTREAM_PORT, "127.0.0.1", resolve));
});
test.afterAll(() => new Promise<void>((resolve) => upstream.close(() => resolve())));

test.beforeEach(async ({ page }) => {
  received.length = 0;
  answer = { status: 200, body: { ok: true } };
  // Each test is its own connection to the server's count, as each person is.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
});

const tab = (page: Page) => page.getByRole("button", { name: "Feedback", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Share Your Feedback" });

async function openFromKeyboard(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("main").waitFor();
  await page.waitForFunction(() => !document.querySelector("#root[data-first-view]"));
  await tab(page).focus();
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole("textbox", { name: "Your feedback" })).toBeFocused();
}

test("the tab opens the sheet from the keyboard, and what is sent reaches the website through Weave's server", async ({ page }) => {
  await openFromKeyboard(page, "/funding");
  await expect(sheet(page).getByText("Sent with this page's address: /weave/funding")).toBeVisible();
  await page.keyboard.type("The funding list helped us find two grants.");
  await sheet(page).getByRole("checkbox", { name: "Idea" }).check();
  await sheet(page).getByRole("checkbox", { name: "Fine tuning" }).check();
  await sheet(page).getByRole("button", { name: "Send Feedback" }).click();
  await expect(sheet(page).getByRole("status")).toHaveText("Sent to the Regen Commons stewards. Thank you.");
  expect(received).toHaveLength(1);
  expect(received[0]!.body).toEqual({
    message: "The funding list helped us find two grants.",
    categories: ["Idea", "Fine Tuning"],
    page_path: "/weave/funding",
  });
  const headers = received[0]!.headers;
  expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(headers.cookie).toBeUndefined();
  expect(headers.origin).toBeUndefined();
  expect(headers["x-forwarded-for"]).toBeUndefined();
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(tab(page)).toBeFocused();
  // The next message starts afresh.
  await tab(page).click();
  await expect(sheet(page).getByRole("textbox", { name: "Your feedback" })).toHaveValue("");
});

test("a message the website did not confirm keeps its words, and the retry keeps its request key", async ({ page }) => {
  await openFromKeyboard(page, "/");
  await page.keyboard.type("hi");
  await sheet(page).getByRole("button", { name: "Send Feedback" }).click();
  await expect(sheet(page).getByText("Write at least 3 characters.")).toBeVisible();
  expect(received).toHaveLength(0);
  await page.keyboard.type(" there, a small idea");
  answer = { status: 503, body: { error: "provider_unavailable" } };
  await sheet(page).getByRole("button", { name: "Send Feedback" }).click();
  const alert = sheet(page).getByRole("alert");
  await expect(alert).toContainText("We could not confirm your feedback was sent. Your words are still here.");
  await expect(alert.getByRole("link", { name: /Open the website's feedback form/u })).toHaveAttribute(
    "href", "https://regencommons.com/feedback?from=%2Fweave");
  await expect(sheet(page).getByRole("textbox", { name: "Your feedback" })).toHaveValue("hi there, a small idea");
  answer = { status: 200, body: { ok: true } };
  await sheet(page).getByRole("button", { name: "Send Feedback" }).click();
  await expect(sheet(page).getByRole("status")).toHaveText("Sent to the Regen Commons stewards. Thank you.");
  expect(received).toHaveLength(2);
  expect(received[1]!.headers["idempotency-key"]).toBe(received[0]!.headers["idempotency-key"]);
  expect((received[1]!.body as { page_path: string }).page_path).toBe("/weave");
});

for (const colorScheme of ["light", "dark"] as const)
  test(`the open sheet passes axe in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openFromKeyboard(page, "/initiatives");
    await page.keyboard.type("x");
    await sheet(page).getByRole("button", { name: "Send Feedback" }).click();
    await expect(sheet(page).getByRole("alert")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include("dialog[open]")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

test("on a step the tab never covers the way forward: on a phone it steps aside, on a wide screen it is clear of the Step bar", async ({ page }, info) => {
  await page.goto("/start/initiative");
  await page.getByRole("main").waitFor();
  const forward = page.getByRole("button", { name: "Fill In The Fields" }).or(page.getByRole("button", { name: "Continue", exact: true })).last();
  if (info.project.name === "phone") {
    await expect(tab(page)).toBeHidden();
    return;
  }
  await expect(tab(page)).toBeVisible();
  const box = (await tab(page).boundingBox())!;
  const bar = await page.locator(".rc-step-bar").boundingBox();
  if (bar) expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  const action = await forward.boundingBox();
  if (action) expect(action.x + action.width <= box.x || action.y >= box.y + box.height || action.y + action.height <= box.y).toBe(true);
});
