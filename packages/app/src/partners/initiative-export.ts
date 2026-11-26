import type { PublicInitiative } from "@weave/api/public-initiative-contract";
import { PUBLIC_ORIGIN } from "../public-origin.ts";
import { csvText, day, exportFileName, sentence, type PdfDocumentModel, type PdfLine } from "../export/document.ts";
import { projectSlug } from "@weave/api/public-projects-contract";
import { keyLabel } from "./public-projects.ts";

/**
 * One shortlisted initiative as an export carries it (DL-153): what its public page shows, read fresh
 * when the export is made, so a project its publisher withdrew, or a need or offer that ended, is never
 * written into a file. Dates are ISO days so a spreadsheet can sort them.
 */
export interface ExportedInitiative {
  readonly name: string;
  readonly publisher: string;
  readonly place: string;
  readonly groupKinds: string;
  readonly workKinds: string;
  /** Its own public words, as it published them. */
  readonly words: string;
  /** Its current public needs, by title, newest first. */
  readonly needs: string;
  readonly offers: string;
  readonly sharedOn: string;
  readonly checkedOn: string;
  readonly weavePage: string;
  readonly publicRecord: string;
}

export interface InitiativeExport {
  readonly exportedOn: string;
  readonly initiatives: readonly ExportedInitiative[];
  /** How many on the shortlist were left out, because they are no longer public or could not be read. */
  readonly leftOut: number;
}

const isoDay = (value: string) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time).toISOString().slice(0, 10);
};

export function exportedInitiative(initiative: PublicInitiative): ExportedInitiative {
  const { project } = initiative;
  const slug = projectSlug(project.uri);
  return {
    name: project.name,
    publisher: project.publisher ?? "",
    place: project.place ?? "",
    groupKinds: project.organizationTypes.map(keyLabel).join(", "),
    workKinds: project.focus.map(keyLabel).join(", "),
    words: project.description.join(" "),
    needs: initiative.needs.map((need) => need.title).join("; "),
    offers: initiative.offers.map((offer) => offer.title).join("; "),
    sharedOn: isoDay(project.sharedAt),
    checkedOn: isoDay(initiative.checkedAt),
    weavePage: slug ? `${PUBLIC_ORIGIN}/initiatives/${slug}` : "",
    publicRecord: project.sourceUrl,
  };
}

export function initiativeExport(found: readonly PublicInitiative[], leftOut: number, now = new Date()): InitiativeExport {
  return { exportedOn: now.toISOString().slice(0, 10), initiatives: found.map(exportedInitiative), leftOut };
}

export const INITIATIVE_COLUMNS: readonly (readonly [keyof ExportedInitiative, string])[] = [
  ["name", "Initiative"],
  ["publisher", "Shared by"],
  ["place", "Place"],
  ["groupKinds", "Kind of group"],
  ["workKinds", "Focus"],
  ["words", "Their words"],
  ["needs", "What they need"],
  ["offers", "What they can offer"],
  ["sharedOn", "Shared on"],
  ["checkedOn", "Checked by Weave on"],
  ["weavePage", "Weave page"],
  ["publicRecord", "Public record"],
];

export const initiativeCsv = (data: InitiativeExport): string => csvText(INITIATIVE_COLUMNS, data.initiatives);

export const initiativeFileName = (data: InitiativeExport, extension: "csv" | "pdf"): string =>
  exportFileName("initiative-shortlist", data.exportedOn, extension);

/** What one initiative says in the PDF, line by line, in reading order. */
export function initiativeLines(initiative: ExportedInitiative): PdfLine[] {
  const lines: PdfLine[] = [
    { text: initiative.name, style: "name" },
    { text: sentence([initiative.publisher, initiative.place, initiative.groupKinds]), style: "quiet" },
  ];
  if (initiative.words) lines.push({ text: initiative.words, style: "body" });
  lines.push({ text: initiative.needs ? `What they need: ${initiative.needs}.` : "No public needs listed.", style: "body" });
  lines.push({ text: initiative.offers ? `What they can offer: ${initiative.offers}.` : "No public offers listed.", style: "body" });
  if (initiative.weavePage) lines.push({ text: `In Weave: ${initiative.weavePage}`, style: "quiet" });
  lines.push({ text: `Public record: ${initiative.publicRecord}`, style: "quiet" });
  lines.push({
    text: sentence([
      initiative.sharedOn ? `Shared ${day(initiative.sharedOn)}` : "",
      initiative.checkedOn ? `Checked by Weave ${day(initiative.checkedOn)}` : "",
    ]),
    style: "quiet",
  });
  return lines.filter((line) => line.text);
}

export function initiativeIntro(data: InitiativeExport): string {
  const count = `${data.initiatives.length} ${data.initiatives.length === 1 ? "initiative" : "initiatives"}`;
  const left = data.leftOut
    ? ` ${data.leftOut} more on the shortlist ${data.leftOut === 1 ? "is" : "are"} left out: no longer public, or not reachable just now.`
    : "";
  return `${count}, exported from Weave on ${day(data.exportedOn)}. Each was read from its public record when exported.${left}`;
}

export function initiativeDocument(data: InitiativeExport): PdfDocumentModel {
  return {
    title: "Initiative shortlist",
    intro: initiativeIntro(data),
    blocks: data.initiatives.map(initiativeLines),
    empty: "None of the shortlisted initiatives could be read as public when this was exported.",
    foot: "From each initiative's public record. Their words are their own; check their page for the latest.",
    createdOn: data.exportedOn,
  };
}
