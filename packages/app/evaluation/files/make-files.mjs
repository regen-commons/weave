// Makes the extraction eval's PDFs and Word file from their Markdown, so they can be made again.
// Run from packages/app: node evaluation/files/make-files.mjs   (macOS, for textutil; Chromium from Playwright)
// The PDFs are printed by Chromium and keep a text layer, except en-scanned-proposal.pdf, which holds only a
// picture of its page, as a scanned letter does. The .docx is written by macOS textutil.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const run = promisify(execFile);

/** Just enough Markdown for these documents: headings, paragraphs, lists, bold and links. */
function html(markdown) {
  const escape = (text) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;");
  const inline = (text) => escape(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>");
  const out = [];
  let list = false;
  for (const line of markdown.split("\n")) {
    const heading = /^(#{1,3}) (.*)$/u.exec(line), item = /^\s*(?:-|\d+\.) (.*)$/u.exec(line);
    if (!item && list) { out.push("</ul>"); list = false; }
    if (heading) out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (item) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(item[1])}</li>`); }
    else if (line.trim() && !/^(---|```)/u.test(line.trim())) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 Georgia,serif;margin:48px;max-width:640px}h1{font-size:24px}</style>${out.join("\n")}`;
}

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
async function pdf(source, target) {
  await page.setContent(html(await readFile(join(here, source), "utf8")));
  await page.pdf({ path: join(here, target), format: "A4" });
}
await pdf("green-goods-readme.md", "green-goods-readme.pdf");
await pdf("tech-and-sun-overview.md", "tech-and-sun-overview.pdf");
await pdf("sources/pt-grant-application.md", "pt-grant-application.pdf");
await pdf("sources/es-project-brief.md", "es-project-brief.pdf");

// A scanned page: a picture of the text and no text layer.
await page.setViewportSize({ width: 794, height: 1123 });
await page.setContent(html(await readFile(join(here, "sources/en-scanned-proposal.md"), "utf8")));
const picture = await page.screenshot({ type: "png" });
await page.setContent(`<!doctype html><style>@page{margin:0}body{margin:0}</style><img style="width:100%" src="data:image/png;base64,${picture.toString("base64")}">`);
await page.pdf({ path: join(here, "en-scanned-proposal.pdf"), format: "A4", printBackground: true });
await browser.close();

// Word: macOS textutil writes .docx from HTML.
const folder = await mkdtemp(join(tmpdir(), "weave-docx-"));
try {
  const source = join(folder, "pt-project-brief.html");
  await writeFile(source, html(await readFile(join(here, "sources/pt-project-brief.md"), "utf8")));
  await run("textutil", ["-convert", "docx", "-output", join(here, "pt-project-brief.docx"), source]);
} finally {
  await rm(folder, { recursive: true, force: true });
}
console.log("Wrote 5 PDFs and 1 .docx in", here);
