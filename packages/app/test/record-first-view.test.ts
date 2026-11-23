import assert from "node:assert/strict";
import { test } from "node:test";
import { RECORD_FIRST_VIEW_ID, withRecordFirstView, type RecordFirstView } from "@weave/api/record-first-view";
import { keepRecordFirstView, parseRecordFirstView, recordFirstView } from "../src/record-first-view.ts";

const FUND = "/funding/local-people-powered";
const view: RecordFirstView = {
  section: "funding", crumbs: { trail: [{ label: "Funding", href: "/funding" }], current: "Opportunity" },
  path: FUND, program: "people-powered-cda-2027",
  title: "Climate Democracy Accelerator: March 2027 cohort", summary: `Training & <b>funding</b> </script>  now.`,
};

/** The app's root as the server drew it: the JSON is read back as the browser would hand it over. */
function drawnRoot(page: string) {
  const json = new RegExp(`<script type="application/json" id="${RECORD_FIRST_VIEW_ID}">([^<]*)</script>`).exec(page)?.[1];
  return {
    querySelector: (selectors: string) =>
      selectors === `#${RECORD_FIRST_VIEW_ID}` && json !== undefined ? { textContent: json } : null,
  };
}

test("the words the server drew are the words the app shows while the record loads", () => {
  keepRecordFirstView(drawnRoot(withRecordFirstView('<div id="root"></div>', view)));
  assert.deepEqual(recordFirstView(FUND, "people-powered-cda-2027"), {
    path: FUND, program: "people-powered-cda-2027", title: view.title, summary: "Training & <b>funding</b> </script> now.",
  });
});

test("another record, or the same fund's other program, has none of them", () => {
  keepRecordFirstView(drawnRoot(withRecordFirstView('<div id="root"></div>', view)));
  assert.equal(recordFirstView(FUND, null), undefined);
  assert.equal(recordFirstView(FUND, "other-program"), undefined);
  assert.equal(recordFirstView("/funding/other-fund", "people-powered-cda-2027"), undefined);
  // An initiative's words ask for no program.
  const initiative = "/initiatives/c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j";
  keepRecordFirstView(drawnRoot(withRecordFirstView('<div id="root"></div>', { ...view, section: "initiatives", path: initiative, program: null })));
  assert.equal(recordFirstView(initiative)?.title, view.title);
  assert.equal(recordFirstView(initiative, "x"), undefined);
});

test("a page with no drawn words, as every page in development, leaves the app as it was", () => {
  keepRecordFirstView(drawnRoot('<div id="root"></div>'));
  assert.equal(recordFirstView(FUND, "people-powered-cda-2027"), undefined);
});

test("JSON that is not exactly what the server writes is not read", () => {
  const good = { path: FUND, program: null, title: "Name", summary: "" };
  assert.deepEqual(parseRecordFirstView(JSON.stringify(good)), good);
  for (const bad of [
    "", "{", "[]", "null", "1",
    { ...good, path: "/settings" }, { ...good, path: "/funding/../x" }, { ...good, path: "https://example.org/funding/x" },
    { ...good, title: "  " }, { ...good, title: "x".repeat(301) }, { ...good, title: 1 },
    { ...good, summary: null }, { ...good, summary: "x".repeat(4001) },
    { ...good, program: "" }, { ...good, program: 1 }, { path: FUND, title: "Name", summary: "" },
  ])
    assert.equal(parseRecordFirstView(typeof bad === "string" ? bad : JSON.stringify(bad)), undefined, JSON.stringify(bad));
});
