// Development-only invented content. App's import.meta.env.DEV boundary removes it from production.
import { addAnswer, newDraft, revise } from "./describe/contracts.ts";
import { keywordSuggestion } from "./describe/keywords.ts";
import { confirmDraft } from "./describe/contracts.ts";
import { emptyAskStep } from "./intake/contracts.ts";
import { answerStep, changeStep, decide, formFromAsk, reconcile, reviewStep } from "./intake/state.ts";
import { chunksFrom, keywordExtraction } from "./intake/keywords.ts";
import type { ListingRecord } from "./listing.ts";
import { parseBundle } from "./funding/catalog.ts";
import type { TeamAsk } from "./funding/team.ts";
/**
 * Where the example card stands: nothing yet, on this device, saved privately, saved in a
 * linked project's team workspace, shared for matching, published, or a signed-in return
 * with nothing on this device.
 */
export type Scenario = "visitor" | "draft" | "private" | "workspace" | "shared" | "published" | "returning";
export const SCENARIOS: readonly Scenario[] = [
  "visitor",
  "draft",
  "private",
  "workspace",
  "shared",
  "published",
  "returning",
];
export type ListState = "ready" | "empty" | "loading" | "offline" | "error" | "long" | "partial";
export type DescribeView =
  | "fresh"
  | "talking"
  | "listening"
  | "attached"
  | "building"
  | "offline"
  | "speech-error"
  | "long"
  | "manual"
  | "weak"
  | "download"
  | "downloading"
  | "download-error"
  | "browser"
  | "cloud"
  | "cloud-error"
  | "review"
  | "correcting"
  | "kept"
  | "storage-error";
export const DESCRIBE_VIEWS: readonly DescribeView[] = [
  "fresh",
  "talking",
  "listening",
  "attached",
  "building",
  "offline",
  "speech-error",
  "long",
  "manual",
  "weak",
  "download",
  "downloading",
  "download-error",
  "browser",
  "cloud",
  "cloud-error",
  "review",
  "correcting",
  "kept",
  "storage-error",
];
export interface FixtureContext {
  intake: IntakeView;
  describe: DescribeView;
  scenario: Scenario;
  /** How the example Certified page answers a publication. */
  certified: "ok" | "fail";
  /** Whether the example person already has projects on Certified. */
  projects: "some" | "none";
  asOf: string;
  state: ListState;
  initiatives: readonly ListingRecord[];
  funding: readonly ListingRecord[];
}
export const INTAKE_VIEWS = [
  "off",
  "ready",
  "empty",
  "loading",
  "offline",
  "error",
  "long",
  "editing",
  "removed",
  "kept",
  "manual",
  "storage-error",
  "saved",
  "shared",
] as const;
export type IntakeView = (typeof INTAKE_VIEWS)[number];
const initiatives: readonly ListingRecord[] = [
  {
    id: "orchard-circle",
    kind: "initiative",
    title: "Orchard learning circle",
    description:
      "Families restore an old orchard and share what they learn about soil, water and seed saving.",
    country: "Brazil",
    place: "Upper valley, Brazil",
    work: ["Place-based community", "Research"],
    stage: "sprout",
    needs: ["material", "financial"],
    offers: ["living", "experiential"],
    fit: "strong",
    reasons: [
      "Offers seedlings and growing skills in this example.",
      "Needs tools that your example initiative offers.",
    ],
    confirmed: "2026-11-02",
    sharedOn: "2026-11-03",
  },
  {
    id: "willow-tools",
    kind: "initiative",
    title: "Willow tools cooperative",
    description: "A shared workshop repairs growing tools and lends equipment to community gardens.",
    country: "Kenya",
    place: "Hill district, Kenya",
    work: ["Technology", "Place-based community"],
    stage: "flowering",
    needs: ["social", "living"],
    offers: ["material", "intellectual"],
    fit: "good",
    reasons: ["Offers shared tools in this example."],
    confirmed: "2026-10-25",
    sharedOn: "2026-10-24",
  },
  {
    id: "seed-stories",
    kind: "initiative",
    title: "Seed stories studio",
    description:
      "Artists and seed keepers collect stories, hold listening circles and make a seasonal community journal.",
    country: "Portugal",
    place: "Coastal valley, Portugal",
    work: ["Art and culture"],
    stage: "seed",
    needs: ["material"],
    offers: ["cultural", "spiritual", "social"],
    fit: "possible",
    reasons: ["Brings a different kind of work to this example."],
    confirmed: "2026-10-20",
    sharedOn: "2026-10-19",
  },
  {
    id: "river-maps",
    kind: "initiative",
    title: "River maps collective",
    description: "Researchers and residents map springs and publish practical notes about caring for water.",
    country: "Brazil",
    place: "Upper valley, Brazil",
    work: ["Research", "Technology"],
    stage: "tree",
    needs: ["living"],
    offers: ["intellectual", "experiential"],
    fit: "good",
    reasons: ["Offers mapping knowledge in this example."],
    confirmed: "2026-10-18",
    sharedOn: "2026-10-16",
  },
  {
    id: "commons-fund",
    kind: "initiative",
    title: "Community commons circle",
    description: "A fictional funder circle supports shared learning and community-led restoration.",
    country: "Kenya",
    place: "Hill district, Kenya",
    work: ["Funders"],
    stage: "flowering",
    needs: ["intellectual"],
    offers: ["financial", "social"],
    fit: "possible",
    reasons: ["Offers financial support in this example."],
    confirmed: "2026-10-12",
    sharedOn: "2026-10-10",
  },
  {
    id: "field-school",
    kind: "initiative",
    title: "Field learning school",
    description: "A community learning space shares growing skills and seasonal care practices.",
    country: "Portugal",
    place: "Coastal valley, Portugal",
    work: ["Place-based community", "Art and culture"],
    stage: "sprout",
    needs: ["financial"],
    offers: ["experiential", "spiritual", "living"],
    fit: "strong",
    reasons: ["Shares growing skills in this example."],
    confirmed: "2026-11-01",
    sharedOn: "2026-11-02",
  },
];
const funding: readonly ListingRecord[] = [
  {
    id: "headwater-learning",
    kind: "funding",
    title: "Headwater learning grant",
    description: "A fictional grant for community learning around springs and rivers.",
    country: "Brazil",
    place: "Brazil",
    work: ["Research", "Place-based community"],
    stage: "sprout",
    needs: [],
    offers: ["financial"],
    fit: "good",
    reasons: ["Supports community water learning in this example."],
    amount: "US$ 15,000",
    closes: "2026-11-30",
    confirmed: "2026-11-01",
  },
  {
    id: "shared-tools",
    kind: "funding",
    title: "Shared tools fund",
    description: "A fictional fund for practical tools that communities maintain together.",
    country: "Kenya",
    place: "Kenya",
    work: ["Technology"],
    stage: "flowering",
    needs: [],
    offers: ["financial", "material"],
    fit: "strong",
    reasons: ["Supports shared equipment in this example."],
    amount: "US$ 20,000",
    closes: "2027-01-15",
    confirmed: "2026-10-25",
  },
  {
    id: "culture-and-care",
    kind: "funding",
    title: "Culture and care award",
    description: "A fictional award for stories, art and care rooted in place.",
    country: "Portugal",
    place: "Portugal",
    work: ["Art and culture"],
    stage: "seed",
    needs: [],
    offers: ["financial"],
    fit: "possible",
    reasons: ["Supports community arts in this example."],
    amount: "€ 10,000",
    closes: "2027-02-28",
    confirmed: "2026-10-29",
  },
];
export function readFixtures(search: string): FixtureContext {
  const params = new URLSearchParams(search);
  const requested = params.get("fixture") as Scenario;
  const scenario: Scenario = SCENARIOS.includes(requested) ? requested : "visitor";
  const stateValue = params.get("state");
  const state: ListState =
    stateValue === "empty" ||
    stateValue === "loading" ||
    stateValue === "offline" ||
    stateValue === "error" ||
    stateValue === "long" ||
    stateValue === "partial"
      ? stateValue
      : "ready";
  const records =
    state === "empty"
      ? []
      : state === "long"
        ? initiatives.map((record, i) =>
            i === 0
              ? {
                  ...record,
                  title:
                    "Associação Comunitária de Aprendizagem, Arte e Cuidado das Nascentes e dos Pomares do Vale das Sementes",
                  description: record.description.repeat(12),
                }
              : record,
          )
        : state === "partial"
          ? initiatives.slice(0, 1)
          : initiatives;
  const publicRecords = records.map((record) => ({
    ...record,
    publicDetails: {
      needs: record.needs.map((capital) => ({
        title: `Example ${capital} support`,
        description: "A fictional request for a community learning session.",
        capitals: [capital],
        terms: "Anywhere, open to anything",
      })),
      offers: record.offers.map((capital) => ({
        title: `Example ${capital} session`,
        description: "A fictional offer for shared learning and practical care.",
        capitals: [capital],
        terms: "One example session, gift",
      })),
      links:
        state === "partial"
          ? []
          : [
              {
                url: "https://example.org",
                title: "Example community website",
                description: "A supplied fictional preview. No page was fetched.",
              },
            ],
    },
  }));
  return {
    scenario,
    certified: params.get("certified") === "fail" ? "fail" : "ok",
    projects: params.get("projects") === "none" ? "none" : "some",
    intake: INTAKE_VIEWS.includes(params.get("intake") as IntakeView)
      ? (params.get("intake") as IntakeView)
      : "off",
    describe: DESCRIBE_VIEWS.includes(params.get("view") as DescribeView)
      ? (params.get("view") as DescribeView)
      : "fresh",
    state,
    asOf: "2026-11-04",
    initiatives: publicRecords,
    funding:
      state === "empty"
        ? []
        : state === "partial"
          ? funding.slice(0, 1).map((record) => ({ ...record, amount: undefined }))
          : funding,
  };
}
export const EXAMPLE_SUBJECT = {
  needs: ["living", "intellectual"],
  offers: ["material", "cultural"],
} as const;

// Public-safe fixtures are kept in memory and never written to the device draft database.
export function describeFixture(view: DescribeView) {
  let draft = newDraft();
  if (view === "fresh") return draft;
  draft = addAnswer(
    draft,
    "We are Orchard learning circle, a group of families restoring an orchard and sharing skills in soil and water care.",
  );
  draft = addAnswer(draft, "Upper valley, Brazil");
  draft = addAnswer(
    draft,
    "We are getting going. Families and students take part. We share learning through community research.",
  );
  if (view === "long")
    draft = addAnswer(
      draft,
      "Somos a Associação Comunitária de Aprendizagem, Arte e Cuidado das Nascentes e dos Pomares do Vale das Sementes. ".repeat(
        25,
      ),
    );
  if (view === "attached") {
    const blob = new Blob(["Field notes: families care for soil and water."], { type: "text/plain" });
    draft = revise(
      draft,
      {
        attachments: [
          { id: crypto.randomUUID(), name: "field-notes.txt", type: blob.type, bytes: blob.size, blob },
        ],
        links: ["https://example.org/orchard"],
      },
      true,
    );
  }
  if (view === "manual") draft = revise(draft, { mode: "fields" });
  if (["review", "correcting", "kept"].includes(view)) {
    const proposal = keywordSuggestion(draft, draft.turns.map((turn) => turn.text).join("\n\n"));
    draft = revise(draft, {
      proposal,
      proposalVersion: draft.inputVersion,
      derivedEdits:
        view === "kept"
          ? {
              stage: proposal.stage,
              lenses: proposal.lenses,
              themes: proposal.themes,
              beneficiaries: proposal.beneficiaries,
              languages: proposal.languages,
            }
          : {},
      kept: view === "kept" ? ["stage", "lenses", "themes", "beneficiaries", "languages"] : [],
    });
  }
  if (view === "correcting")
    draft = revise(draft, {
      reviewEdits: { stage: { value: draft.proposal?.stage ?? "", lenses: [], wasKept: false } },
    });
  return draft;
}

// Step 4 examples seed only an isolated in-memory draft, never IndexedDB.
export function intakeFixture(view: IntakeView, path: string) {
  let draft = confirmDraft(describeFixture("kept"));
  if (view === "long")
    draft = confirmDraft(
      revise(draft, {
        publicEdits: {
          ...draft.publicEdits,
          name: "Associação Comunitária de Aprendizagem, Arte e Cuidado das Nascentes e dos Pomares do Vale das Sementes",
        },
        confirmed: null,
      }),
    );
  for (const kind of ["needs", "offers"] as const) {
    let step = emptyAskStep();
    if (view !== "empty") {
      const words =
        kind === "needs"
          ? "Native seedlings for our valley; Tools and volunteers for planting here; Financial support for fencing"
          : "A workshop on water mapping; Cultural stories and a practice of care";
      step = answerStep(
        step,
        kind,
        view === "long"
          ? words +
              "; " +
              "A method for community research and learning in our valley, shared with everyone. ".repeat(5) +
              "; Equipment for the nursery; Introductions to partners; Care for volunteers; A research template"
          : words,
      );
      const chunks = chunksFrom(step.turns[0]!.text, step.turns[0]!.id);
      step = reconcile(step, keywordExtraction(chunks, kind));
      const allKept = !path.startsWith("/start/") || ["kept", "saved", "shared"].includes(view);
      if (allKept) {
        for (const item of step.items) step = decide(step, item.id, "kept");
        step = reviewStep(step);
      } else if (view === "removed") step = decide(step, step.items[0]!.id, "removed");
      if (view === "editing" && path === `/start/${kind}`)
        step = changeStep(step, {
          editor: { id: step.items[0]!.id, form: formFromAsk(step.items[0]!.value) },
        });
    } else step = reviewStep(step);
    if (view === "manual") step = changeStep(step, { mode: "manual" });
    draft = revise(draft, { [kind]: step });
  }
  return draft;
}

export function fundingFixture(fixture: FixtureContext) {
  const funds = fixture.funding
    .map((record) =>
      fixture.state === "long"
        ? {
            ...record,
            title: "Fundo Comunitário de Aprendizagem e Cuidado das Nascentes do Vale das Sementes",
            description: record.description.repeat(8),
          }
        : record,
    )
    .map((record) => ({
      id: record.id,
      name: record.title,
      displayName: record.title,
      description: record.description,
      sectors: ["restoration", "water"],
      regions: [record.country],
      approaches: [],
      access: "open",
      amount: record.amount ?? "Award not stated",
      timing: "Fictional call",
      deadlineDate: record.closes ?? null,
      deadlineInstant: null,
      verifiedOn: record.confirmed,
      website: "https://example.org",
      evidenceUrl: "https://example.org",
      enrichment: {
        reviewStatus: "program_reviewed",
        focus: ["restoration", "water"],
        sources: [{ url: "https://example.org", checkedOn: record.confirmed }],
        programs: [
          {
            id: `${record.id}-call`,
            name: record.title,
            instrument: "grant",
            focus: ["restoration", "water", "community learning"],
            beneficiaries: [],
            geography: { scope: record.place, workCountries: [], applicantCountries: [], exclusions: [] },
            applicants: {
              types: ["organisations"],
              fiscalSponsorship: "unknown",
              requirements: ["Registered organisations with accounts in this fictional example."],
              exclusions: [],
            },
            award: {
              currency: null,
              min: null,
              max: null,
              basis: "not_stated",
              note: record.amount ?? "Not stated",
            },
            application: {
              route: "open",
              url: "https://example.org",
              opensOn: null,
              closesOn: record.closes ?? null,
              deadlineInstant: null,
              note: "Fictional application route",
            },
            evidence: [{ url: "https://example.org", checkedOn: record.confirmed }],
            unknowns: ["This is invented content, not a real funder's terms."],
          },
        ],
      },
    }));
  return parseBundle(
    { funds, compiledAt: `${fixture.asOf}T12:00:00Z`, researchCheckedOn: fixture.asOf },
    { version: 1, rules: [] },
    { version: 1, conditions: [] },
  );
}
export function teamFixture(view: string | null): TeamAsk[] {
  if (view === "alone") return [];
  const orchard = {
    id: "orchard-circle",
    name: "Orchard learning circle",
    reason: "A fictional registered host with four years of accounts.",
  };
  const water = {
    id: "river-maps",
    name: "River maps collective",
    reason: "A fictional research group monitoring springs and publishing data.",
  };
  return [
    {
      id: "host",
      label: "A registered partner with two years of accounts",
      candidates: view === "nogap" ? [] : [orchard],
    },
    {
      id: "monitor",
      label: "A research or monitoring partner",
      candidates: view === "nogap" ? [] : [orchard, water],
    },
    { id: "country", label: "A co-applicant working in another country", candidates: [] },
  ];
}

/** The example person's own initiative. It is never a partner for itself. */
const EXAMPLE_OWN = "orchard-circle";
/** One of the person's shared needs or offers, as the example partner rule reads it. */
export interface ExampleEntry {
  readonly kind: "needs" | "offers";
  readonly title: string;
  readonly kinds: ListingRecord["needs"];
}
/** An invented direct fit: an example initiative's own need or offer, as if it were shared for matching. */
export interface ExamplePartner {
  readonly id: string;
  readonly name: string;
  /** The person's own need or offer the result is for. */
  readonly entry: { readonly kind: "need" | "offer"; readonly title: string };
  readonly kind: "confirmed_offer" | "confirmed_need";
  readonly title: string;
  readonly passage: string;
  readonly confirmedOn: string;
}
/**
 * Invented partners for the example world. Each shared need gets the first example initiative that
 * offers one of its kinds of support, and each shared offer the first that needs one. An initiative
 * appears once, so a later entry moves on to the next.
 */
export function examplePartners(
  entries: readonly ExampleEntry[],
  records: readonly ListingRecord[],
): ExamplePartner[] {
  const used = new Set([EXAMPLE_OWN]);
  const partners: ExamplePartner[] = [];
  for (const entry of entries) {
    const need = entry.kind === "needs";
    for (const record of records) {
      if (used.has(record.id)) continue;
      const theirs = record.publicDetails?.[need ? "offers" : "needs"].find((ask) =>
        ask.capitals.some((capital) => entry.kinds.includes(capital)),
      );
      if (!theirs) continue;
      used.add(record.id);
      partners.push({
        id: record.id,
        name: record.title,
        entry: { kind: need ? "need" : "offer", title: entry.title },
        kind: need ? "confirmed_offer" : "confirmed_need",
        title: theirs.title,
        passage: theirs.description,
        confirmedOn: record.confirmed,
      });
      break;
    }
  }
  return partners;
}
