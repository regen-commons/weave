import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import type { Evaluation } from "../src/funding/contracts.ts";
import { csvCell } from "../src/export/document.ts";
import { pdfBytes, pdfText, wrapText } from "../src/export/pdf-document.ts";
import {
  exportedFund,
  exportIntro,
  fundingCsv,
  fundingDocument,
  fundingExport,
  fundingFileName,
  fundLines,
  type ExportedFund,
  type FundingExport,
} from "../src/funding/export.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const entries = catalogEntries(parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions")));
const at = new Date("2026-11-26T12:00:00Z");
const program = entries.find((entry) => entry.program && entry.program.applicants.requirements.length)!;

const fund: ExportedFund = {
  name: "Watershed Small Grants",
  funder: "River Network Fund",
  kind: "Grant",
  award: "Up to USD 50,000.",
  howToApply: "Open call",
  closes: "2026-12-07",
  where: "United States",
  whoCanApply: "Registered nonprofits.",
  fit: "Good fit",
  readiness: "Ready to check",
  sourcesChecked: "2026-11-20",
  funderPage: "https://example.org/grants",
  weavePage: "https://weave.regencommons.com/funding/river?program=small",
};
const data = (funds: ExportedFund[], initiative: string | null = "Garden commons"): FundingExport => ({
  shortlist: true,
  initiative,
  exportedOn: "2026-11-26",
  catalogCheckedOn: "2026-11-20",
  funds,
});

test("a program exports the facts its opportunity shows, with its Weave address", () => {
  const exported = exportedFund(program, undefined, at);
  assert.equal(exported.name, program.program!.name);
  assert.equal(exported.funder, program.fund.displayName);
  assert.ok(exported.whoCanApply.includes(program.program!.applicants.requirements[0]!));
  assert.equal(exported.fit, "", "no fit without an initiative compared");
  assert.match(exported.weavePage, /^https:\/\/weave\.regencommons\.com\/funding\/[\w-]+\?program=[\w-]+$/u);
  assert.ok(exported.funderPage === "" || exported.funderPage.startsWith("https://"));
});

test("fit is a word when an initiative was compared, and says so when it could not be assessed", () => {
  const result = (score: number | null) =>
    ({ documentId: program.id, thematicFit: { score, evidenceTerms: [] }, readiness: { label: "Check the route" } }) as unknown as Evaluation;
  assert.equal(exportedFund(program, result(70), at).fit, "Strong fit");
  assert.equal(exportedFund(program, result(null), at).fit, "Fit not assessed");
  assert.equal(exportedFund(program, result(70), at).readiness, "Check the route");
  const all = fundingExport([program], new Map([[program.id, result(45)]]), { shortlist: false, initiative: "Garden", catalogCheckedOn: null }, at);
  assert.equal(all.funds[0]!.fit, "Good fit");
  assert.equal(all.exportedOn, "2026-11-26");
});

test("every CSV cell is quoted, and a cell a spreadsheet would run as a formula is written as text", () => {
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  for (const lead of ["+", "-", "@", "\t"]) assert.ok(csvCell(`${lead}1`).startsWith(`"'${lead}`), lead);
  assert.equal(csvCell("Line one\nline two"), '"Line one\nline two"');
});

test("the CSV has a heading row, keeps every letter and leaves fit out when nothing was compared", () => {
  const csv = fundingCsv(data([{ ...fund, name: "Фонд Жизнь, 婦女基金" }]));
  assert.ok(csv.startsWith("\uFEFF"), "a byte order mark, so spreadsheets read UTF-8");
  const [head, row] = csv.slice(1).split("\r\n");
  assert.equal(head, '"Program","Funder","Kind of funding","Award","How to apply","Closes","Where","Who can apply","Fit","Readiness","Sources checked","Funder\'s page","Weave page"');
  assert.ok(row!.startsWith('"Фонд Жизнь, 婦女基金","River Network Fund"'));
  assert.ok(row!.includes('"2026-12-07"'));
  const browsing = fundingCsv(data([fund], null)).split("\r\n")[0]!;
  assert.ok(!browsing.includes("Fit") && !browsing.includes("Readiness"));
  assert.ok(csv.endsWith("\r\n"));
});

test("the file is named for what it holds and the day", () => {
  assert.equal(fundingFileName(data([]), "csv"), "weave-funding-shortlist-2026-11-26.csv");
  assert.equal(fundingFileName({ ...data([]), shortlist: false }, "pdf"), "weave-funding-2026-11-26.pdf");
});

test("PDF text keeps Western letters, drops an accent the font lacks, and marks what it cannot draw", () => {
  assert.deepEqual(pdfText("Associação Comunitária, Zürich"), { text: "Associação Comunitária, Zürich", lost: false });
  assert.deepEqual(pdfText("Māori \u2192 fund \u2212 2"), { text: "Maori to fund - 2", lost: false });
  assert.deepEqual(pdfText("Фонд"), { text: "????", lost: true });
  assert.deepEqual(pdfText("  two\n lines "), { text: "two lines", lost: false });
});

test("long lines wrap at spaces, and a long address breaks inside itself", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = wrapText(`See ${"a".repeat(200)} for more`, font, 10, 200);
  assert.ok(lines.length > 2);
  assert.ok(lines.every((line) => font.widthOfTextAtSize(line, 10) <= 200));
  assert.equal(lines.join("").replaceAll(" ", ""), `See${"a".repeat(200)}formore`);
});

test("each fund reads as its facts in order, and the opening says what, when and for whom", () => {
  const lines = fundLines(fund, "2026-11-26").map((line) => line.text);
  assert.deepEqual(lines.slice(0, 3), [
    "Watershed Small Grants",
    "River Network Fund. Grant. Up to USD 50,000.",
    "Open call. Closes 7 December 2026.",
  ]);
  assert.ok(lines.includes("Good fit. Ready to check"));
  assert.ok(lines.includes("Funder's page: https://example.org/grants"));
  assert.equal(exportIntro(data([fund])), "1 fund, exported from Weave on 26 November 2026. Catalog checked 20 November 2026. Fit is for Garden commons.");
  assert.equal(fundLines(fund, "2026-12-08")[2]!.text, "Open call. Closed on 7 December 2026.", "a day already past reads as past");
  assert.equal(fundLines({ ...fund, closes: "" }, "2026-11-26")[2]!.text, "Open call. No closing date stated.");
  assert.ok(!fundLines({ ...fund, fit: "", readiness: "" }, "2026-11-26").some((line) => /^\w+ fit\./u.test(line.text)), "no fit line without a comparison");
});

test("the PDF opens as a document with every fund and the reminder that fit is not eligibility", async () => {
  const funds = entries.slice(0, 60).map((entry) => exportedFund(entry, undefined, at));
  const bytes = await pdfBytes(fundingDocument(data([...funds, { ...fund, name: "Фонд" }], null)));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() > 3, "sixty funds run over several pages");
  assert.equal(doc.getTitle(), "Funding shortlist");
  const empty = await PDFDocument.load(await pdfBytes(fundingDocument(data([]))));
  assert.equal(empty.getPageCount(), 1);
});
