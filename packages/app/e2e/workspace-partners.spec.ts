import { expect, test, type Page } from "@playwright/test";
import { parseTeamSaved } from "../../api/src/account-contract.ts";
import { rankPartnerMatches, type PartnerEntry, type ProjectEvidence, type SharedPartnerEntry } from "../../api/src/partner-matcher.ts";
import { emptyFundingForm } from "../src/funding/contracts.ts";
import { EMPTY_ASK, type AskFields } from "../src/intake/contracts.ts";

const ask = (entryId: string, title: string, description: string, capitalForms: AskFields["capitalForms"]) => ({
  entryId, value: { ...EMPTY_ASK, title, description, capitalForms },
});

// Public project descriptions with synthetic needs, offers, accounts and matching consent.
const greenGoods = {
  id: "00000000-0000-4000-8000-000000000011",
  did: "did:plc:abcdefghijklmnopqrstuvwx",
  name: "Green Goods",
  isGlobal: true,
  passages: [
    "Green Goods supports community-led regenerative projects in land restoration, waste, education and clean energy.",
    "Communities can plan work, document evidence, review contributions and connect their activity with support.",
  ],
  need: ask("00000000-0000-4000-8000-000000000012", "Local groups for a Green Goods pilot",
    "We want community groups to trial the app, test documenting activities and reviewing evidence, and give feedback on the pilot.",
    ["intellectual", "experiential"]),
  offer: ask("00000000-0000-4000-8000-000000000013", "Open-source tool for community impact records",
    "With our tool, teams can log hub activities, document evidence and report outcomes from local projects.",
    ["material", "intellectual"]),
};
const techAndSun = {
  id: "00000000-0000-4000-8000-000000000021",
  did: "did:plc:bcdefghijklmnopqrstuvwxy",
  name: "Tech & Sun: Solar Hubs for Builders and Communities in Nigeria",
  isGlobal: false,
  passages: [
    "Tech & Sun builds solar-powered hubs that transform how students and builders in Nigeria access electricity, internet, and opportunity.",
    "Our pilot hub in Awka is already live, and students and builders use it daily.",
  ],
  need: ask("00000000-0000-4000-8000-000000000022", "A tracking tool for solar hub impact",
    "We need a tool to document evidence, log activities and report the impact of our solar hubs. Our first pilot operates in Awka, Nigeria.",
    ["material"]),
  offer: ask("00000000-0000-4000-8000-000000000023", "An Awka hub for app pilots",
    "Our working solar hub in Awka is a community site for a pilot. We can trial the app for recording activities and give feedback.",
    ["material", "experiential"]),
};
techAndSun.offer.value.placeScope = "here";

type Project = typeof greenGoods;
const uriOf = (did: string, key = "3n25s3idfzszo") => `at://${did}/org.hypercerts.collection/${key}`;
const date = new Date(Date.now() - 60_000).toISOString();
const unfilled = ask("00000000-0000-4000-8000-000000000031", "Legal translation into Icelandic",
  "A certified translator to review contracts in Icelandic.", ["intellectual"]);

function summaryOf(project: Project) {
  return { name: project.name, description: project.passages.join(" "), locations: [], isGlobal: project.isGlobal, lenses: [], themes: [] };
}

function evidence(uri: string, name: string, passages: string[]): ProjectEvidence[] {
  return passages.map((passage, index) => ({
    id: `${uri}#${index}`, projectUri: uri, projectName: name, sourceUri: uri,
    sourceUrl: "https://example.test/public-project", cid: "fixture", contentHash: "fixture",
    fieldPath: `$.passages[${index}]`, passage, sourceCreatedAt: date, sourceIndexedAt: date,
    fetchedAt: date, extractionVersion: "fixture", kind: "work",
  }));
}

function entriesOf(project: Project, additionalNeed: boolean): PartnerEntry[] {
  const common = { initiativeId: project.id, revision: 1, summary: summaryOf(project) };
  return [
    { ...common, kind: "need", ...project.need },
    ...(additionalNeed ? [{ ...common, kind: "need" as const, ...unfilled }] : []),
    { ...common, kind: "offer", ...project.offer },
  ];
}

async function openWorkspace(page: Page, project: Project, counterpart: Project, {
  confirmed = true, additionalNeed = true, publicAvailable = true, extraEvidence = [] as ProjectEvidence[],
} = {}) {
  const queries = entriesOf(project, additionalNeed);
  const uri = uriOf(project.did);
  const saved = parseTeamSaved({
    id: project.id, revision: 1, updatedAt: date,
    document: {
      version: 1,
      initiative: { ...summaryOf(project), links: [], stage: null, beneficiaries: [], languages: [] },
      needs: queries.filter(({ kind }) => kind === "need").map(({ entryId, value }) => ({ id: entryId, value })),
      offers: [{ id: project.offer.entryId, value: project.offer.value }],
      funding: { form: emptyFundingForm(), programAnswers: {} },
    },
  });
  const shared: SharedPartnerEntry[] = confirmed
    ? entriesOf(counterpart, false).map((entry) => ({ ...entry, confirmedAt: date, expiresAt: null }))
    : [];
  const results = rankPartnerMatches({ queries, shared });
  const publicEvidence = [
    ...extraEvidence,
    ...evidence(uriOf(counterpart.did), counterpart.name, counterpart.passages),
    ...evidence(uriOf("did:plc:cdefghijklmnopqrstuvwxyz"), "Seeds of Hope: Growing Climate Leaders", [
      "Our school tree-planting report documents activities and evidence to track our impact.",
    ]),
    ...evidence(uriOf("did:plc:defghijklmnopqrstuvwxyza"), "Nkhoma Mountain bioacoustic monitoring", [
      "We use an open-source platform to log activities, document evidence and track impact.",
    ]),
  ];

  await page.route("**/api/account", (route) => route.fulfill({ json: {
    available: true, signIn: "certified", user: { id: "00000000-0000-4000-8000-000000000099" }, items: [],
  } }));
  await page.route("**/api/projects", (route) => {
    const command = route.request().postDataJSON();
    switch (command.action) {
      case "team_load":
        return route.fulfill({ json: { saved, projectUri: uri, accessRole: "viewer" } });
      case "list_project_groups":
        return route.fulfill({ json: { groups: [{ groupDid: project.did, role: "member" }] } });
      case "list_workspaces":
        return route.fulfill({ json: { workspaces: [{ workspaceId: project.id, projectUri: uri, kind: "group", accessRole: "viewer",
          project: { uri, repoDid: project.did, groupDid: project.did, cid: "fixture", title: project.name, description: saved.document.initiative.description } }] } });
      case "list_projects":
        return route.fulfill({ json: { projects: [] } });
      case "public_evidence":
        if (!publicAvailable) return route.fulfill({ status: 503, json: { error: "public_evidence_unavailable" } });
        return route.fulfill({ json: { workspaceId: project.id, corpusVersion: "fixture", status: "bounded",
          indexedAt: date, availableUntil: new Date(Date.now() + 600_000).toISOString(), truncated: false, evidence: publicEvidence } });
      default:
        return route.fulfill({ status: 400, json: { error: "invalid_request" } });
    }
  });
  await page.route("**/api/matching", (route) => {
    const command = route.request().postDataJSON();
    switch (command.action) {
      case "state":
        return route.fulfill({ json: { initiativeId: project.id, initiativeRevision: 1, entries: queries.map(({ kind, entryId, revision }) => ({
          kind, entryId, revision, shareVersion: 1, status: "open", sharing: "shared", confirmedAt: date, expiresAt: null,
        })) } });
      case "search":
        return route.fulfill({ json: { initiativeId: project.id, results, coverage: {
          shared: "available", external: "unavailable", corpusVersion: null, modelVersion: null, engineVersion: "partner-concepts-v2",
        } } });
      case "leads":
        return route.fulfill({ json: { initiativeId: project.id, leads: [] } });
      default:
        return route.fulfill({ status: 400, json: { error: "invalid_request" } });
    }
  });
  await page.goto("/your-initiatives");
  const workspace = page.getByRole("region", { name: "On Certified" }).getByRole("button", { name: project.name, exact: true });
  await workspace.focus();
  await page.keyboard.press("Enter");
  return page.getByRole("region", { name: "Partners For You" });
}

test.use({ serviceWorkers: "block" });

for (const [project, counterpart] of [[greenGoods, techAndSun], [techAndSun, greenGoods]] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${project.name} puts confirmed offers first for each shared need in ${colorScheme}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme });
      const partners = await openWorkspace(page, project, counterpart);
      const need = partners.getByRole("region", { name: project.need.value.title, exact: true });
      await expect(need.getByRole("heading", { level: 4 })).toHaveText(["Confirmed Offers", "From Public Project Details"]);
      await expect(need.getByRole("heading", { level: 5 }).first()).toHaveText(counterpart.name);
      await expect(need.locator(".rc-fit").first()).toHaveText("Strong fit");
      await expect(need.getByRole("link", { name: `Open Initiative : ${counterpart.name}` })).toBeVisible();
      await expect(need.getByRole("heading", { name: /Seeds of Hope|Nkhoma Mountain/ })).toHaveCount(0);

      const empty = partners.getByRole("region", { name: unfilled.value.title, exact: true });
      await expect(empty.getByText("No partners found for this need yet.")).toBeVisible();
      const offers = partners.getByRole("region", { name: "Direct Fits" });
      await expect(offers.getByText(project.offer.value.title, { exact: true })).toBeVisible();
      const headings = partners.getByRole("heading", { level: 3 });
      await expect(headings.nth(0)).toHaveText(project.need.value.title);
      await expect(headings.nth(1)).toHaveText(unfilled.value.title);

      const why = need.getByText("Why this fits", { exact: true });
      await why.focus();
      await page.keyboard.press("Enter");
      await expect(need.getByText(/Details to check include/)).toBeVisible();
      await page.keyboard.press("Enter");

      if (process.env.WEAVE_PARTNER_PROOF) {
        await partners.screenshot({ path: info.outputPath("partners.png") });
        if (info.project.name === "phone") {
          await page.setViewportSize({ width: 375, height: 780 });
          await partners.screenshot({ path: info.outputPath("partners-375.png") });
        }
      }
    });
  }
}

test("Tech & Sun can find Green Goods from public details without a confirmed offer", async ({ page }) => {
  const partners = await openWorkspace(page, techAndSun, greenGoods, { confirmed: false, additionalNeed: false });
  const need = partners.getByRole("region", { name: techAndSun.need.value.title, exact: true });
  await expect(need.getByRole("heading", { level: 4 })).toHaveText(["From Public Project Details"]);
  await expect(need.getByRole("heading", { level: 5 })).toHaveText(["Green Goods"]);
  await expect(need.locator(".rc-fit")).toHaveText("Possible fit");
  await expect(need.getByText("Availability is unknown.", { exact: true })).toBeVisible();
});

test("Green Goods keeps confirmed offers when public evidence is unavailable", async ({ page }) => {
  const partners = await openWorkspace(page, greenGoods, techAndSun, { publicAvailable: false, additionalNeed: false });
  const need = partners.getByRole("region", { name: greenGoods.need.value.title, exact: true });
  await expect(need.getByRole("heading", { level: 4 })).toHaveText(["Confirmed Offers"]);
  await expect(need.getByRole("heading", { name: techAndSun.name, exact: true })).toBeVisible();
  await expect(partners.getByText("Public Certified evidence is unavailable right now.")).toBeVisible();
  await expect(need.getByText("No partners found for this need yet.")).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`specific public matches and partial fits have separate groups in ${colorScheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme });
    const project = { ...greenGoods, need: ask(greenGoods.need.entryId, "Traceability for recycled plastic lots",
      "We need software for tracing batches of recycled plastic.", ["intellectual"]) };
    const extraEvidence = [
      ...evidence(uriOf("did:plc:efghijklmnopqrstuvwxyzab"), "Circular supply chain platform", [
        "It is a cloud-based Traceability Intelligence Platform for circular supply chains.",
      ]),
      ...evidence(uriOf("did:plc:fghijklmnopqrstuvwxyzabc"), "Plastic batch tracking", [
        "We provide a traceability platform tracking recycled plastic lots in circular supply chains.",
      ]),
      ...evidence(uriOf("did:plc:ghijklmnopqrstuvwxyzabcd"), "Plastic cleanup project", [
        "We collect plastic for recycling and use a traceability app.",
      ]),
    ];
    const partners = await openWorkspace(page, project, techAndSun, { confirmed: false, additionalNeed: false, extraEvidence });
    const need = partners.getByRole("region", { name: project.need.value.title, exact: true });
    await expect(need.getByRole("heading", { level: 4 })).toHaveText(["From Public Project Details", "Partial Fits"]);
    await expect(need.getByRole("heading", { level: 5 })).toHaveText(["Plastic batch tracking", "Circular supply chain platform"]);
    await expect(need.locator(".rc-fit")).toHaveText(["Possible fit", "Partial fit"]);
    await expect(need.getByText("Provides traceability for circular supply chains.", { exact: true })).toBeVisible();
    await expect(need.getByText("Check whether the tool tracks individual lots of recycled plastic.", { exact: true })).toBeVisible();
    const partialSource = need.getByRole("link", { name: /Open Initiative.*Circular supply chain platform/u });
    await partialSource.focus();
    await expect(partialSource).toBeFocused();
    if (process.env.WEAVE_PARTNER_PROOF) {
      const partialHeading = need.getByRole("heading", { name: "Partial Fits", exact: true });
      const framePartialFits = () => partialHeading.evaluate((heading) => {
        heading.scrollIntoView({ block: "start" });
        window.scrollBy(0, -150);
      });
      await framePartialFits();
      await page.screenshot({ path: info.outputPath("partial-fits.png") });
      if (info.project.name === "phone") {
        await page.setViewportSize({ width: 375, height: 780 });
        await framePartialFits();
        await page.screenshot({ path: info.outputPath("partial-fits-375.png") });
      }
    }
  });
}
