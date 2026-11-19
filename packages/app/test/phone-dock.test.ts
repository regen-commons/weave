// On a phone a focused step docks its way forward where the tab bar would be (DL-089). The page
// shell draws the dock, each intake step fills it, and a wide screen keeps the action in its place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
const count = (text: string, part: string) => text.split(part).length - 1;

test("the page shell draws the dock on a focused step and the tab bar on every other page", () => {
  const page = source("ui/Page.tsx");
  const dock = page.indexOf('{form && <div className="rc-dock" ref={setDock} />}');
  assert.notEqual(dock, -1, "a focused step has a dock");
  assert.ok(page.includes("{!form && <BottomNav pathname={pathname} />}"), "and no tab bar");
  // Outside the main column, which is a size container and would hold a fixed bar inside itself,
  // and before the footer, so the action reads after the step.
  assert.ok(dock > page.indexOf("</Main>"), "the dock is outside the main column");
  assert.ok(dock < page.indexOf("<Footer"), "the dock reads before the footer");
  assert.ok(page.includes("<DockContext.Provider value={dock}>"), "steps reach the dock through its context");
});

test("each intake step docks its way forward, and shows the same action in its place on a wide screen", () => {
  const steps: readonly [file: string, actions: readonly string[]][] = [
    ["pages/Describe.tsx", ["forward"]],
    ["pages/AskStep.tsx", ["forward"]],
  ];
  for (const [file, actions] of steps) {
    const text = source(file);
    for (const action of actions) {
      assert.equal(count(text, `<Dock>{${action}()}</Dock>`), 1, `${file} docks ${action} once`);
      assert.equal(count(text, `{${action}("wide")}`), 1, `${file} shows ${action} in its place on a wide screen`);
    }
    // One definition serves both places, so the two can never say different things.
    assert.equal(count(text, "<Dock>"), actions.length, `${file} docks nothing else`);
    assert.match(text, /data-from=\{from\}|from=\{from\}/u, `${file} marks the copy on the page as a wide screen's`);
  }
});

test("a docked submit names the form it sends, because the dock is outside the form", () => {
  const describe = source("pages/Describe.tsx");
  assert.ok(describe.includes('<form className="rc-form" id={FIELDS_ID} noValidate onSubmit={next} onKeyDown={moveOnEnter}>'));
  assert.match(describe, /type="submit"\s+form=\{FIELDS_ID\}/u);
});

test("a problem a docked action raises is drawn where the person is", () => {
  const text = source("pages/Describe.tsx");
  assert.ok(text.includes("revealProblem(PROBLEM_ID,"), "the describe step brings its problem into view");
  assert.ok(text.includes('role="alert" id={PROBLEM_ID}'), "and names the problem it reveals");
  // The problem's place is always on the page, so showing it pushes nothing down (DL-113).
  assert.ok(text.includes('className="rc-error rc-status-slot" role="alert" id={PROBLEM_ID}'));
  // Needs and offers already moves the focus to the list that stopped the page.
  assert.match(source("pages/AskStep.tsx"), /getElementById\(`ask-\$\{first\}-blocker`\)\?\.focus\(\)/u);
});
