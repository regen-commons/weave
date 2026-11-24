import { z } from "../validation.ts";
import { fundingPreviews } from "../home.ts";
import { catalogEntries, parseBundle } from "./catalog.ts";
import type { Bundle, Entry, Evaluation } from "./contracts.ts";
import { evaluateCatalog } from "./engine.ts";

/**
 * What the catalog worker answers. The catalog is 3.6 MB of JSON, checked field by field, and
 * reading it on the page blocked a phone for over a second (quality finding Q-01). The worker
 * reads and checks it once and keeps it, so the page receives only what it shows: the whole
 * bundle for Funding and a fund's sheet, four cards and a count for Home, and a ranking.
 */

/** An initiative as the matcher reads it. */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  /** The words of the kept needs and offers, which the matcher reads for topics (DL-142). */
  asks: z.array(z.string()),
  /** Where you work, as the card says it, read for fit only (DL-143). */
  places: z.array(z.string()),
  workCountries: z.array(z.string()),
  benefitCountries: z.array(z.string()),
  applicantBaseCountry: z.string(),
  registrationCountry: z.string(),
  applicantType: z.enum(["unknown", "nonprofit", "informal", "individual", "business", "university", "public-body"]),
  fundingInstruments: z.array(z.enum(["grant", "prize", "investment", "fellowship", "scholarship"])),
  goalMin: z.number().nullable(),
  goalMax: z.number().nullable(),
  currency: z.string(),
  usWorkStates: z.array(z.string()),
  usBenefitStates: z.array(z.string()),
  programAnswers: z.record(z.string(), z.object({ answer: z.enum(["yes", "no"]), sourceCheckedOn: z.string() })),
});

/** Where the catalog's three files are served. The page knows; the worker is told. */
const SourcesSchema = z.object({ catalog: z.string(), rules: z.string(), conditions: z.string() });
export type CatalogSources = z.infer<typeof SourcesSchema>;

const asked = { id: z.number().int(), sources: SourcesSchema, retry: z.boolean() };
export const CatalogRequestSchema = z.discriminatedUnion("kind", [
  z.object({ ...asked, kind: z.literal("bundle") }),
  z.object({ ...asked, kind: z.literal("closing-soon"), now: z.iso.datetime() }),
  z.object({ ...asked, kind: z.literal("rank"), project: ProjectSchema }),
]);
export type CatalogRequest = z.infer<typeof CatalogRequestSchema>;

/** Home's strip: the open calls closing soonest, card-ready, and how many close within 30 days. */
export interface ClosingSoon {
  readonly upcoming: Entry[];
  readonly closingSoon: number;
}
export const closingSoonOf = (bundle: Bundle, now: Date): ClosingSoon => fundingPreviews(catalogEntries(bundle), now);

/** The answer to one request, from the bundle the worker holds. */
export function answerCatalog(bundle: Bundle, request: CatalogRequest): Bundle | ClosingSoon | Evaluation[] {
  switch (request.kind) {
    case "bundle":
      return bundle;
    case "closing-soon":
      return closingSoonOf(bundle, new Date(request.now));
    case "rank":
      return evaluateCatalog(bundle, request.project);
  }
}

async function read(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The catalog could not load.");
  return response.json();
}

/** Fetches and checks the three files. Screening conditions are optional: without them screening says it is unavailable. */
export async function readCatalog(sources: CatalogSources): Promise<Bundle> {
  const [catalog, rules, conditions] = await Promise.all([
    read(sources.catalog),
    read(sources.rules),
    read(sources.conditions).catch(() => null),
  ]);
  return parseBundle(catalog, rules, conditions);
}
