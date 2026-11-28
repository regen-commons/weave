import { expect, test, type Page } from "@playwright/test";
import { parseTeamSaved } from "../../api/src/account-contract.ts";
import { rankPartnerMatches, type ListingPartnerEntry, type PartnerEntry, type ProjectEvidence } from "../../api/src/partner-matcher.ts";
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

// A third project that publishes in the snapshot only.
const seedKeepers = { ...greenGoods, id: "00000000-0000-4000-8000-000000000041", did: "did:plc:efghijklmnopqrstuvwxyzab", name: "Valley Seed Keepers",
  offer: ask("00000000-0000-4000-8000-000000000043", "Community groups to trial a pilot app",
    "Our community groups can trial the app, test documenting activities and reviewing evidence, and give feedback.", ["experiential"]) };

/** A project's need and offer as Weave publishes them: another project's listings, read back (DL-155, step 5). */
function listingsOf(project: Project): ListingPartnerEntry[] {
  return [[project.offer, "offer", "3mlstoffraaaa"], [project.need, "need", "3mlstneedaaaa"]].map(([entry, kind, rkey]) => {
    const { value } = entry as typeof project.offer;
    return { kind: kind as "offer" | "need", uri: `at://${project.did}/com.regencommons.weave.supportListing/${rkey as string}`,
      cid: `b${"q".repeat(58)}`, projectUri: uriOf(project.did), projectName: project.name, title: value.title,
      description: value.description, capitalForms: [...value.capitalForms], createdAt: date, expiresAt: null };
  });
}
/** The snapshot's form of a listing: the record Weave read back, with its address, version and project name. */
const snapshotListing = (listing: ListingPartnerEntry) => ({
  kind: listing.kind, uri: listing.uri, cid: listing.cid, projectUri: listing.projectUri, projectName: listing.projectName,
  record: { $type: "com.regencommons.weave.supportListing", projectUri: listing.projectUri, kind: listing.kind, title: listing.title,
    description: listing.description, capitalForms: listing.capitalForms, status: "open", createdAt: listing.createdAt },
});

async function openWorkspace(page: Page, project: Project, counterpart: Project, {
  listed = true, additionalNeed = true, publicAvailable = true, extraEvidence = [] as ProjectEvidence[],
  snapshotListings = [] as ListingPartnerEntry[],
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
  // The server's answer for the team's published listings: the other project's listings, as direct fits.
  const results = listed ? rankPartnerMatches({ queries, listings: listingsOf(counterpart) }) : [];
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
    available: true, signIn: "certified", user: { id: "00000000-0000-4000-8000-000000000099" },
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
          indexedAt: date, availableUntil: new Date(Date.now() + 600_000).toISOString(), truncated: false, evidence: publicEvidence,
          listings: snapshotListings.map(snapshotListing), listingsTruncated: false } });
      default:
        return route.fulfill({ status: 400, json: { error: "invalid_request" } });
    }
  });
  await page.route("**/api/matching", (route) => {
    const command = route.request().postDataJSON();
    switch (command.action) {
      case "state":
        return route.fulfill({ json: { initiativeId: project.id, initiativeRevision: 1, entries: queries.map(({ kind, entryId, revision }) => ({
          kind, entryId, revision, shareVersion: 1, status: "open", sharing: "private", confirmedAt: null, expiresAt: null,
        })) } });
      case "listing_search":
        return route.fulfill({ json: { initiativeId: project.id, results, coverage: {
          shared: "available", external: "unavailable", corpusVersion: null, modelVersion: null, engineVersion: "partner-concepts-v2",
        } } });
      default:
        // Sharing for matching has ended (DL-155, step 5): nothing else is asked of the matching endpoint.
        return route.fulfill({ status: 410, json: { error: "matching_shares_retired" } });
    }
  });
  await page.goto("/your-initiatives");
  const workspace = page.getByRole("region", { name: "Certified Projects" }).getByRole("button", { name: project.name, exact: true });
  await workspace.focus();
  await page.keyboard.press("Enter");
  return page.getByRole("region", { name: "Partners For You" });
}

test.use({ serviceWorkers: "block" });

for (const [project, counterpart] of [[greenGoods, techAndSun], [techAndSun, greenGoods]] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${project.name} finds ${counterpart.name.split(":")[0]}'s published listings first, kept with a bookmark, in ${colorScheme}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme });
      const partners = await openWorkspace(page, project, counterpart);
      const card = partners.locator(".rc-card").first();
      await expect(card.getByRole("heading", { level: 3 })).toHaveText(counterpart.name);
      await expect(card.locator(".rc-fit")).toHaveText("Strong fit");
      await expect(card.getByText(project.need.value.title, { exact: true })).toBeVisible();
      await expect(card.getByRole("link", { name: `Open Initiative : ${counterpart.name}` })).toBeVisible();
      // A partner is kept on this device's shortlist: no Save, Hide, sharing or withdrawal anywhere (DL-155, step 5).
      await expect(page.getByRole("button", { name: /^(Save|Hide|Stop Sharing|Withdraw From Matching|Remove From Saved)$/u })).toHaveCount(0);
      const bookmark = card.getByRole("button", { name: `Add to shortlist: ${counterpart.name}` });
      await bookmark.focus();
      await page.keyboard.press("Enter");
      await expect(bookmark).toHaveAttribute("aria-pressed", "true");

      const why = card.getByText("Why these fit", { exact: true });
      await why.focus();
      await page.keyboard.press("Enter");
      await expect(card.getByText("The project published this offer. Check the details before making plans.")).toBeVisible();

      if (process.env.WEAVE_PARTNER_PROOF) {
        await card.screenshot({ path: info.outputPath(`listing-partner-${colorScheme}.png`) });
        if (info.project.name === "phone") {
          await page.setViewportSize({ width: 375, height: 780 });
          await card.screenshot({ path: info.outputPath(`listing-partner-${colorScheme}-375.png`) });
        }
      }
    });
  }
}

test("Tech & Sun can find Green Goods from public details without a published listing", async ({ page }) => {
  const partners = await openWorkspace(page, techAndSun, greenGoods, { listed: false, additionalNeed: false });
  const card = partners.locator(".rc-card", { has: page.getByRole("heading", { name: "Green Goods", exact: true }) });
  await expect(card.locator(".rc-fit")).toHaveText("Possible fit");
  await expect(card.getByText("Availability is unknown.", { exact: true })).toBeVisible();
});

test("Green Goods keeps the server's listing matches when public evidence is unavailable", async ({ page }) => {
  const partners = await openWorkspace(page, greenGoods, techAndSun, { publicAvailable: false, additionalNeed: false });
  await expect(partners.getByText("Public Certified evidence is unavailable right now.")).toBeVisible();
  await expect(partners.getByRole("heading", { name: techAndSun.name, exact: true })).toBeVisible();
});

test("a published offer in the public snapshot is a direct fit on the device, with no server match", async ({ page }) => {
  const partners = await openWorkspace(page, greenGoods, techAndSun, {
    listed: false, additionalNeed: false, snapshotListings: listingsOf(seedKeepers).filter(({ kind }) => kind === "offer"),
  });
  const card = partners.locator(".rc-card", { has: page.getByRole("heading", { name: seedKeepers.name, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByText("They offer what you need", { exact: false })).toBeVisible();
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
    const partners = await openWorkspace(page, project, techAndSun, { listed: false, additionalNeed: false, extraEvidence });
    const direct = partners.locator(".rc-card", { has: page.getByRole("heading", { name: "Plastic batch tracking", exact: true }) });
    await expect(direct.locator(".rc-fit")).toHaveText("Possible fit");
    const partial = partners.getByRole("region", { name: "Partial Fits" });
    await expect(partial.getByRole("heading", { level: 4 })).toHaveText(["Circular supply chain platform"]);
    await expect(partial.locator(".rc-fit")).toHaveText(["Partial fit"]);
    await expect(partial.getByText("Provides traceability for circular supply chains.", { exact: true })).toBeVisible();
    await expect(partial.getByText("Check whether the tool tracks individual lots of recycled plastic.", { exact: true })).toBeVisible();
    const partialSource = partial.getByRole("link", { name: /Open Initiative.*Circular supply chain platform/u });
    await partialSource.focus();
    await expect(partialSource).toBeFocused();
    if (process.env.WEAVE_PARTNER_PROOF) {
      const partialHeading = partners.getByRole("heading", { name: "Partial Fits", exact: true });
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
