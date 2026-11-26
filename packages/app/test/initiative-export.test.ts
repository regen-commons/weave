import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import type { PublicInitiative } from "@weave/api/public-initiative-contract";
import { pdfBytes } from "../src/export/pdf-document.ts";
import {
  exportedInitiative,
  initiativeCsv,
  initiativeDocument,
  initiativeExport,
  initiativeFileName,
  initiativeIntro,
  initiativeLines,
} from "../src/partners/initiative-export.ts";

const URI = "at://did:plc:abcdefghijklmnopqrstuvwx/org.hypercerts.collection/3lbmwj6wdkc2a";
const listing = (title: string) => ({
  uri: `${URI}/need`, cid: "c", title, description: null, capitalForms: ["financial"],
  createdAt: "2026-11-01T00:00:00Z", updatedAt: null, expiresAt: null,
});
const initiative: PublicInitiative = {
  project: {
    uri: URI,
    name: "Community seed library",
    description: ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring."],
    focus: [],
    organizationTypes: [],
    publisher: "Lagoa Seed Library",
    place: "São Paulo, Brazil",
    publisherLinks: [],
    sharedAt: "2026-09-03T10:00:00Z",
    checkedAt: "2026-11-25T08:00:00Z",
    sourceUrl: "https://certified.example/record",
  },
  needs: [listing("Seed storage jars"), listing("Volunteers for spring")],
  offers: [listing("Workshops on seed saving")],
  checkedAt: "2026-11-26T09:00:00Z",
};
const NOW = new Date("2026-11-26T12:00:00Z");

test("an initiative exports what its public page shows, with its current needs and offers", () => {
  const row = exportedInitiative(initiative);
  assert.equal(row.name, "Community seed library");
  assert.equal(row.publisher, "Lagoa Seed Library");
  assert.equal(row.words, "We keep heirloom seed in a shared library. Neighbours borrow seed in spring.");
  assert.equal(row.needs, "Seed storage jars; Volunteers for spring");
  assert.equal(row.offers, "Workshops on seed saving");
  assert.equal(row.sharedOn, "2026-09-03");
  assert.equal(row.checkedOn, "2026-11-26");
  assert.equal(row.weavePage, "https://weave.regencommons.com/initiatives/abcdefghijklmnopqrstuvwx-3lbmwj6wdkc2a");
});

test("the CSV keeps every letter and names its columns", () => {
  const csv = initiativeCsv(initiativeExport([initiative], 0, NOW));
  const [head, row] = csv.slice(1).split("\r\n");
  assert.equal(head, '"Initiative","Shared by","Place","Kind of group","Focus","Their words","What they need","What they can offer","Shared on","Checked by Weave on","Weave page","Public record"');
  assert.ok(row!.startsWith('"Community seed library","Lagoa Seed Library","São Paulo, Brazil"'));
  assert.equal(initiativeFileName(initiativeExport([], 0, NOW), "pdf"), "weave-initiative-shortlist-2026-11-26.pdf");
});

test("the opening says how many were left out, without naming a withdrawn one", () => {
  assert.equal(
    initiativeIntro(initiativeExport([initiative], 2, NOW)),
    "1 initiative, exported from Weave on 26 November 2026. Each was read from its public record when exported. 2 more on the shortlist are left out: no longer public, or not reachable just now.",
  );
  const lines = initiativeLines(exportedInitiative({ ...initiative, needs: [], offers: [] })).map((line) => line.text);
  assert.ok(lines.includes("No public needs listed.") && lines.includes("No public offers listed."));
});

test("the PDF opens as a document", async () => {
  const doc = await PDFDocument.load(await pdfBytes(initiativeDocument(initiativeExport([initiative], 0, NOW))));
  assert.equal(doc.getTitle(), "Initiative shortlist");
  assert.equal(doc.getPageCount(), 1);
});
