import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { csvCell, exportCsv, importCsv, parseCsv, readGrade, serializeLabels } from "../evaluation/fund-labels.ts";
import { LABEL_FILES, gateMetrics, loadRankingData, loadRankingSet, measure, rankSet, validateLabels, type LabelSet } from "../evaluation/fund-ranking.ts";

const setup = (async () => {
  const raw = await readFile(LABEL_FILES[0]!, "utf8");
  const labels = JSON.parse(raw) as LabelSet;
  const [data, set] = await Promise.all([loadRankingData(), loadRankingSet(labels.initiatives)]);
  return { raw, labels, data, set };
})();

test("drafts are signed by agents, confirmations by people, for 40 real initiatives, laid out as the importer writes them", async () => {
  const { raw, labels, data, set } = await setup;
  validateLabels(labels, set, new Set(data.names.keys()));
  assert.equal(raw, serializeLabels(labels));
  assert.equal(set.initiatives.length, 40);
  // A confirmation comes only from `eval:labels -- --import`, under a person's name and the day.
  for (const label of labels.labels)
    if (label.status === "draft") assert.match(label.by, /^agent:/u, `${label.initiative} ${label.documentId}`);
    else assert.ok(!/^agent:/u.test(label.by) && /^\d{4}-\d{2}-\d{2}$/u.test(label.confirmedOn ?? ""), `${label.initiative} ${label.documentId}`);
  const perInitiative = new Map<string, number>();
  for (const label of labels.labels) perInitiative.set(label.initiative, (perInitiative.get(label.initiative) ?? 0) + 1);
  assert.equal(perInitiative.size, 40);
  assert.ok([...perInitiative.values()].every((count) => count >= 20), "each pool holds at least Funding's first 20");
});

test("each initiative is a public Certified record, its words the passages the public list shows", async () => {
  const { set } = await setup;
  const corpus = JSON.parse(await readFile(new URL("../../api/evaluation/partner-real-v1-corpus.json", import.meta.url), "utf8")) as { projects: { uri: string; passages: string[] }[] };
  const passages = new Map(corpus.projects.map((project) => [project.uri, project.passages.join(" ").replace(/\s+/gu, " ").trim()]));
  for (const row of set.initiatives) {
    assert.equal(row.source, "certified", row.id);
    assert.ok(passages.get(row.sourceUri!)?.startsWith(row.description), row.id);
  }
});

test("a reviewer's spreadsheet confirms exactly the rows they graded, under their name", async () => {
  const { labels, data, set } = await setup;
  const csv = exportCsv(labels, set, data);
  const [header, ...rows] = parseCsv(csv);
  assert.equal(rows.length, labels.labels.length);
  assert.ok(header!.includes("draft grade") && header!.includes("your grade"));
  assert.ok(!parseCsv(exportCsv(labels, set, data, { blind: true }))[0]!.includes("draft grade"), "a blind sheet hides the drafts");
  // Grade three rows the first initiative's way, and leave the rest blank.
  const grade = header!.indexOf("your grade"), note = header!.indexOf("your note");
  const graded = rows.map((row, i) => (i < 3 ? row.map((value, j) => (j === grade ? ["Fits", "doesn't", "maybe"][i]! : j === note && i === 0 ? "Same place, same work" : value)) : row));
  const sheet = [header!, ...graded].map((row) => row.map((value) => (/[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join(",")).join("\n");
  const { labels: next, confirmed } = importCsv(labels, sheet, "Ana Reviewer", "2026-11-25");
  assert.equal(confirmed, 3);
  assert.deepEqual(next.labels.slice(0, 3).map((label) => [label.grade, label.status, label.by, label.confirmedOn]), [
    ["fits", "confirmed", "Ana Reviewer", "2026-11-25"], ["doesnt", "confirmed", "Ana Reviewer", "2026-11-25"], ["maybe", "confirmed", "Ana Reviewer", "2026-11-25"]]);
  assert.equal(next.labels[0]!.note, "Same place, same work");
  assert.deepEqual(next.labels[0]!.draft, { grade: labels.labels[0]!.grade, by: labels.labels[0]!.by, note: labels.labels[0]!.note }, "the draft it answered stays beside it");
  assert.deepEqual(next.labels.slice(3), labels.labels.slice(3), "a blank row keeps its draft");

  // The next sheet shows Ana's grades in their own columns and leaves "your grade" blank, so nobody else's grade is carried over.
  const [again, ...againRows] = parseCsv(exportCsv(next, set, data));
  const at = (name: string) => again!.indexOf(name);
  assert.deepEqual([againRows[0]![at("confirmed grade")], againRows[0]![at("confirmed by")], againRows[0]![at("your grade")]], ["fits", "Ana Reviewer, 2026-11-25", ""]);
  const blind = parseCsv(exportCsv(next, set, data, { blind: true }))[0]!;
  assert.ok(!blind.includes("confirmed grade") && !blind.includes("draft grade"), "a blind sheet shows nobody else's judgment");
  // Ben grading a row Ana confirmed is refused unless he says he means to replace it, and then the note says whose it was.
  const ben = [again!, againRows[0]!.map((value, j) => (j === at("your grade") ? "maybe" : value))].map((row) => row.map(csvCell).join(",")).join("\n");
  assert.throws(() => importCsv(next, ben, "Ben Reviewer", "2026-11-26"), { message: /^confirmed_by_someone_else: .*Ana Reviewer/u });
  const replaced = importCsv(next, ben, "Ben Reviewer", "2026-11-26", { replace: true }).labels.labels[0]!;
  assert.deepEqual([replaced.grade, replaced.by, replaced.note], ["maybe", "Ben Reviewer", "Replaces Ana Reviewer's fits of 2026-11-25."]);
  // Ana importing the same grade again changes nothing, not even the day.
  const same = [again!, againRows[0]!.map((value, j) => (j === at("your grade") ? "fits" : value))].map((row) => row.map(csvCell).join(",")).join("\n");
  const unchanged = importCsv(next, same, "Ana Reviewer", "2026-11-30");
  assert.deepEqual([unchanged.confirmed, unchanged.labels.labels[0]!.confirmedOn], [0, "2026-11-25"]);
  assert.throws(() => importCsv(labels, `${sheet}\n${sheet.split("\n")[1]}`, "Ana Reviewer", "2026-11-25"), { message: /^pair_graded_twice/u });
  validateLabels(next, set, new Set(data.names.keys()));
  // The first confirmed fit makes the metrics count, and they fail until a baseline is recorded in the same change.
  const ranked = await rankSet(data, { ...set, initiatives: set.initiatives.filter((row) => row.id === next.labels[0]!.initiative) });
  const report = measure(next, ranked);
  assert.equal(report.confirmed, 3);
  assert.ok(report.paths);
  assert.match(gateMetrics(report, null).message, /--record-baseline/u);
});

test("an import refuses an agent as reviewer, a pair the file does not hold and a grade it cannot read", async () => {
  const { labels, data, set } = await setup;
  const [header, first] = parseCsv(exportCsv(labels, set, data));
  const sheet = (row: string[]) => [header!, row].map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
  const grade = header!.indexOf("your grade"), program = header!.indexOf("program id");
  const with_ = (j: number, value: string) => first!.map((v, i) => (i === j ? value : v));
  assert.throws(() => importCsv(labels, sheet(with_(grade, "fits")), " agent: claude", "2026-11-25"), { message: "reviewer_must_be_a_person" });
  assert.throws(() => importCsv(labels, sheet(with_(program, "nope::nope")), "Ana Reviewer", "2026-11-25"), { message: "unknown_pair: rel-001 nope::nope" });
  assert.throws(() => importCsv(labels, sheet(with_(grade, "great")), "Ana Reviewer", "2026-11-25"), { message: "unknown_grade: great" });
  assert.deepEqual(["fits", "Doesn't fit", "", " maybe "].map(readGrade), ["fits", "doesnt", null, "maybe"]);
});

test("spreadsheet text is read back exactly, and a cell that would run as a formula is kept as text", () => {
  assert.deepEqual(parseCsv('a,"b, ""c""",d\r\n"line\none",2\n'), [["a", 'b, "c"', "d"], ["line\none", "2"]]);
  // Excel's "CSV UTF-8" starts with a byte order mark, and some languages save with semicolons.
  assert.deepEqual(parseCsv("\uFEFFinitiative;your grade\nrel-001;fits\n"), [["initiative", "your grade"], ["rel-001", "fits"]]);
  assert.throws(() => parseCsv('a,"b'), { message: "csv_unclosed_quote" });
  assert.deepEqual(["=HYPERLINK(1)", "+1", "-x", "@sum", "plain", 'say "hi", then go'].map(csvCell), ["'=HYPERLINK(1)", "'+1", "'-x", "'@sum", "plain", '"say ""hi"", then go"']);
});

test("a note that opened with a formula character comes back as written", async () => {
  const { labels, data, set } = await setup;
  const [header, first] = parseCsv(exportCsv(labels, set, data));
  const row = first!.map((value, j) => (j === header!.indexOf("your grade") ? "doesnt" : j === header!.indexOf("your note") ? "-outside scope" : value));
  const sheet = [header!, row].map((r) => r.map(csvCell).join(",")).join("\n");
  assert.equal(importCsv(labels, sheet, "Ana Reviewer", "2026-11-25").labels.labels[0]!.note, "-outside scope");
});
