import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PdfDocumentModel, PdfLine } from "./document.ts";

/**
 * An export as a PDF file, made on this device (DL-152). The page loads this module, and `pdf-lib`
 * with it, only when a person asks for a PDF, so no page pays for it before then; the installed app
 * does not keep it ahead of time either, so a phone on a slow connection never downloads it unasked
 * (DL-153).
 *
 * It uses Helvetica, a font every PDF reader has, so the file stays small and nothing is fetched.
 * That font draws Western European letters only. A letter it cannot draw is written without its
 * accent where it has one, or as `?`, and the file says so; the CSV keeps every name whole.
 */

/** The characters Helvetica's Windows encoding can draw, past plain ASCII. */
const WIN_ANSI_EXTRA = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
    0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ].map((code) => String.fromCodePoint(code)),
);
const SWAPS: Readonly<Record<string, string>> = {
  "\u2192": "to",
  "\u2212": "-",
  "\u2010": "-",
  "\u2011": "-",
  "\u20B9": "INR ",
  "\u00AD": "",
  "\u200B": "",
  "\u200C": "",
  "\u200D": "",
  "\uFEFF": "",
};

function drawable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char);
}

/** Text Helvetica can draw, and whether any letter had to be replaced with `?` to get there. */
export function pdfText(text: string): { text: string; lost: boolean } {
  let lost = false;
  let out = "";
  for (const char of text.normalize("NFC").replace(/\s+/gu, " ")) {
    if (drawable(char)) out += char;
    else if (char in SWAPS) out += SWAPS[char];
    else {
      // A letter with an accent this font lacks, such as ā, keeps its base letter.
      const base = char.normalize("NFD").replace(/\p{M}/gu, "");
      if (base && [...base].every(drawable)) out += base;
      else {
        out += "?";
        lost = true;
      }
    }
  }
  return { text: out.trim(), lost };
}

/** Lines that fit `width`, breaking at spaces, and inside a word only where one word is too long. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let rest = word;
    while (!fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const INK = rgb(0.11, 0.12, 0.11);
const QUIET = rgb(0.36, 0.38, 0.36);
const RULE = rgb(0.82, 0.83, 0.81);

/** The document as PDF bytes: its title, its opening, a block per record kept whole on a page where it fits, and a foot on every page. */
export async function pdfBytes(model: PdfDocumentModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(model.title);
  doc.setCreator("Weave");
  doc.setProducer("Weave");
  doc.setCreationDate(new Date(`${model.createdOn}T00:00:00Z`));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - 2 * PAGE.margin;
  const bottom = PAGE.margin + 28;
  let lost = false;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const fonts = { name: { font: bold, size: 12, color: INK }, body: { font: regular, size: 10, color: INK }, quiet: { font: regular, size: 9, color: QUIET } };
  const measure = (text: string, style: PdfLine["style"]) => {
    const safe = pdfText(text);
    lost ||= safe.lost;
    return wrapText(safe.text, fonts[style].font, fonts[style].size, width);
  };
  const height = (lines: string[], style: PdfLine["style"]) => lines.length * fonts[style].size * 1.35;
  const draw = (lines: string[], style: PdfLine["style"]) => {
    const { font, size, color } = fonts[style];
    for (const line of lines) {
      y -= size * 1.35;
      page.drawText(line, { x: PAGE.margin, y, size, font, color });
    }
  };
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
  };

  draw(measure(model.title, "name"), "name");
  y -= 4;
  draw(measure(model.intro, "quiet"), "quiet");
  y -= 10;

  for (const record of model.blocks) {
    const block = record.map(({ text, style }) => ({ lines: measure(text, style), style }));
    const blockHeight = block.reduce((sum, part) => sum + height(part.lines, part.style), 0) + 20;
    // A record stays on one page unless it is taller than a page on its own.
    if (y - blockHeight < bottom && y < PAGE.height - PAGE.margin - 1) newPage();
    y -= 10;
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.5, color: RULE });
    y -= 4;
    for (const part of block) {
      for (const line of part.lines) {
        if (y - fonts[part.style].size * 1.35 < bottom) newPage();
        draw([line], part.style);
      }
    }
  }
  if (!model.blocks.length) draw(measure(model.empty, "body"), "body");
  if (lost) {
    y -= 12;
    const note = measure("Some names use letters this PDF's font cannot draw, shown as ?. The CSV export keeps them in full.", "quiet");
    if (y - height(note, "quiet") < bottom) newPage();
    draw(note, "quiet");
  }

  const pages = doc.getPages();
  pages.forEach((each, index) => {
    const foot = `${model.foot} Page ${index + 1} of ${pages.length}.`;
    const lines = wrapText(foot, regular, 8, width);
    lines.forEach((line, row) =>
      each.drawText(line, { x: PAGE.margin, y: PAGE.margin - row * 10, size: 8, font: regular, color: QUIET }),
    );
  });
  return doc.save();
}
