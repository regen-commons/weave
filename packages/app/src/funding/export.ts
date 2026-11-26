import { effectiveAccess } from "../../../../dist/domain.mjs";
import { programFund } from "../../../../dist/matching.mjs";
import { PUBLIC_ORIGIN } from "../public-origin.ts";
import { accessSign, opportunityHref } from "./catalog.ts";
import { FundSchema, type Entry, type Evaluation } from "./contracts.ts";
import { FIT_LABELS, fundingFit } from "./fit.ts";
import { FUNDING_KINDS } from "./select.ts";
import { fundingSourceUrl } from "./source.ts";
import { csvText, day, exportFileName, sentence, type PdfDocumentModel, type PdfLine } from "../export/document.ts";

/**
 * One fund as an export carries it (DL-152): the facts the opportunity shows, in plain words, with
 * dates as ISO days so a spreadsheet can sort them. Fit is only there when an initiative was compared,
 * and it is never eligibility.
 */
export interface ExportedFund {
  readonly name: string;
  readonly funder: string;
  readonly kind: string;
  readonly award: string;
  readonly howToApply: string;
  /** The closing day, or empty where the source states none. */
  readonly closes: string;
  readonly where: string;
  readonly whoCanApply: string;
  readonly fit: string;
  readonly readiness: string;
  /** The day its sources were last checked, or empty where that is unverified. */
  readonly sourcesChecked: string;
  readonly funderPage: string;
  readonly weavePage: string;
}

export interface FundingExport {
  /** The shortlist, or Funding's list as filtered. */
  readonly shortlist: boolean;
  /** The initiative the fit was worked out for, where one was compared. */
  readonly initiative: string | null;
  readonly exportedOn: string;
  /** The latest day the catalog records checking a source, or null where it is unknown. */
  readonly catalogCheckedOn: string | null;
  readonly funds: readonly ExportedFund[];
}

/** The facts of one catalog entry, as its opportunity shows them. */
export function exportedFund(entry: Entry, result: Evaluation | undefined, now = new Date()): ExportedFund {
  const fund = FundSchema.parse(programFund(entry.fund, entry.program));
  const program = entry.program;
  const level = result ? fundingFit(result.thematicFit.score) : null;
  // One way out to the funder, the same one the opportunity offers.
  const funderPage =
    program?.evidence.map((evidence) => fundingSourceUrl(fund, evidence.url)).find(Boolean) ||
    fundingSourceUrl(fund, fund.evidenceUrl);
  return {
    name: program?.name ?? fund.displayName,
    funder: fund.displayName,
    kind: program ? (FUNDING_KINDS[program.instrument] ?? "Funding") : "Funding",
    award: fund.amount,
    howToApply: accessSign(effectiveAccess(fund, now)).label,
    closes: fund.deadlineDate ?? "",
    where: program?.geography.scope || fund.regions.join(", ") || "Scope unverified",
    whoCanApply: program
      ? [...program.applicants.requirements, ...program.applicants.exclusions].join(" ") || "Requirements not verified"
      : "No researched program terms",
    fit: result ? (level ? FIT_LABELS[level] : "Fit not assessed") : "",
    readiness: result?.readiness.label ?? "",
    sourcesChecked: fund.verifiedOn ?? "",
    funderPage,
    weavePage: `${PUBLIC_ORIGIN}${opportunityHref(entry)}`,
  };
}

/** The funds shown, in the order shown, with what the export says about where they came from. */
export function fundingExport(
  entries: readonly Entry[],
  results: ReadonlyMap<string, Evaluation>,
  context: { shortlist: boolean; initiative: string | null; catalogCheckedOn: string | null },
  now = new Date(),
): FundingExport {
  return {
    ...context,
    exportedOn: now.toISOString().slice(0, 10),
    funds: entries.map((entry) => exportedFund(entry, results.get(entry.id), now)),
  };
}

/** The CSV's columns, in order, with their headings. */
export const CSV_COLUMNS: readonly (readonly [keyof ExportedFund, string])[] = [
  ["name", "Program"],
  ["funder", "Funder"],
  ["kind", "Kind of funding"],
  ["award", "Award"],
  ["howToApply", "How to apply"],
  ["closes", "Closes"],
  ["where", "Where"],
  ["whoCanApply", "Who can apply"],
  ["fit", "Fit"],
  ["readiness", "Readiness"],
  ["sourcesChecked", "Sources checked"],
  ["funderPage", "Funder's page"],
  ["weavePage", "Weave page"],
];

/** The export as CSV. Fit and readiness are left out when no initiative was compared, since they would be empty. */
export function fundingCsv(data: FundingExport): string {
  const columns = CSV_COLUMNS.filter(([key]) => data.initiative !== null || (key !== "fit" && key !== "readiness"));
  return csvText(columns, data.funds);
}

/** The file's name: what it holds and the day. */
export function fundingFileName(data: FundingExport, extension: "csv" | "pdf"): string {
  return exportFileName(data.shortlist ? "funding-shortlist" : "funding", data.exportedOn, extension);
}

/** What the export is called, at the top of the PDF. */
export function exportTitle(data: Pick<FundingExport, "shortlist">): string {
  return data.shortlist ? "Funding shortlist" : "Funding from Weave";
}

/** When a fund closes, said as past once its day is before the export's. */
function closing(closes: string, today: string): string {
  if (!closes) return "No closing date stated.";
  return closes < today ? `Closed on ${day(closes)}.` : `Closes ${day(closes)}.`;
}

/** What one fund says in the PDF, line by line, in reading order. `today` is the export's day. */
export function fundLines(fund: ExportedFund, today: string): PdfLine[] {
  const lines: PdfLine[] = [
    { text: fund.name, style: "name" },
    { text: sentence([fund.funder !== fund.name ? fund.funder : "", fund.kind, fund.award]), style: "quiet" },
    { text: `${fund.howToApply}. ${closing(fund.closes, today)}`, style: "body" },
    { text: `Who can apply: ${fund.whoCanApply}`, style: "body" },
    { text: `Where: ${fund.where}`, style: "body" },
  ];
  if (fund.fit) lines.push({ text: `${fund.fit}.${fund.readiness ? ` ${fund.readiness}` : ""}`, style: "body" });
  lines.push({ text: fund.funderPage ? `Funder's page: ${fund.funderPage}` : "The funder's page needs checking.", style: "body" });
  lines.push({ text: `In Weave: ${fund.weavePage}`, style: "quiet" });
  lines.push({ text: fund.sourcesChecked ? `Sources checked ${day(fund.sourcesChecked)}.` : "Source date unverified.", style: "quiet" });
  return lines;
}

/** The export's opening line: how many, when, from which catalog and for which initiative. */
export function exportIntro(data: FundingExport): string {
  const count = `${data.funds.length} ${data.funds.length === 1 ? "fund" : "funds"}`;
  const fit = data.initiative ? ` Fit is for ${data.initiative}.` : "";
  const checked = data.catalogCheckedOn ? ` Catalog checked ${day(data.catalogCheckedOn)}.` : "";
  return `${count}, exported from Weave on ${day(data.exportedOn)}.${checked}${fit}`;
}

/** The export as a document for the PDF maker. */
export function fundingDocument(data: FundingExport): PdfDocumentModel {
  return {
    title: exportTitle(data),
    intro: exportIntro(data),
    blocks: data.funds.map((fund) => fundLines(fund, data.exportedOn)),
    empty: "No funds were shown when this was exported.",
    foot: "Fit is not eligibility. Check the official requirements with the funder before applying.",
    createdOn: data.exportedOn,
  };
}
