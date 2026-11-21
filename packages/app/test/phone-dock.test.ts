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

test("the page shell draws a step bar after the page body, and the steps fill it on a wide screen (DL-124)", () => {
  const page = source("ui/Page.tsx");
  const bar = page.indexOf('<div className="rc-step-bar" ref={setStepBar} />');
  assert.notEqual(bar, -1, "every page has the bar's place, and an empty one is not drawn");
  // After the page body, so the keyboard reaches the way forward after the step's fields; the
  // design system's grid draws it under the app bar.
  assert.ok(bar > page.indexOf("</Main>"), "the step bar comes after the page's content");
  assert.ok(bar < page.indexOf("<Footer"), "and before the footer");
  assert.ok(page.includes("<StepBarContext.Provider value={stepBar}>"), "steps reach the bar through its context");
  const stepper = source("ui/Stepper.tsx");
  // The steps are in the markup twice and on screen once: a phone's copy at the top of the page,
  // and the bar's with the step's way forward beside it.
  assert.ok(stepper.includes('<Stepper current={current} steps={steps} until="wide" />'), "the copy on the page is a phone's");
  assert.match(stepper, /createPortal\(\s*<>\s*<Stepper current=\{current\} steps=\{steps\} \/>\s*\{children && <div className="rc-action-bar">\{children\}<\/div>\}/u);
});

test("each intake step docks its way forward, and shows the same action in the step bar on a wide screen", () => {
  const steps: readonly [file: string, actions: readonly string[]][] = [
    ["pages/Describe.tsx", ["forward"]],
    ["pages/AskStep.tsx", ["forward"]],
  ];
  for (const [file, actions] of steps) {
    const text = source(file);
    for (const action of actions) {
      assert.equal(count(text, `<Dock>{${action}()}</Dock>`), 1, `${file} docks ${action} once`);
      assert.equal(count(text, `{${action}("wide")}`), 1, `${file} shows ${action} once on a wide screen`);
      // The wide screen's copy is in the Step bar, beside the steps (DL-124).
      const steps = text.slice(text.indexOf("<IntakeStepper"), text.indexOf("</IntakeStepper>"));
      assert.ok(steps.includes(`{${action}("wide")}`), `${file} shows ${action} in the step bar`);
    }
    // One definition serves both places, so the two can never say different things.
    assert.equal(count(text, "<Dock>"), actions.length, `${file} docks nothing else`);
    assert.match(text, /data-from=\{from\}|from=\{from\}/u, `${file} marks the copy on the page as a wide screen's`);
  }
});

test("a docked submit names the form it sends, because the dock is outside the form", () => {
  const describe = source("pages/Describe.tsx");
  assert.ok(describe.includes('<form className="rc-form" data-width="full" id={FIELDS_ID} noValidate onSubmit={next} onKeyDown={moveOnEnter}>'));
  assert.match(describe, /type="submit"\s+form=\{FIELDS_ID\}/u);
});

test("a problem a docked action raises is drawn where the person is", () => {
  const text = source("pages/Describe.tsx");
  assert.ok(text.includes("revealProblem(PROBLEM_ID,"), "the describe step brings its problem into view");
  assert.ok(text.includes('role="alert" id={PROBLEM_ID}'), "and names the problem it reveals");
  // The problem's place is always on the page, so showing it pushes nothing down (DL-113).
  assert.ok(text.includes('className="rc-error rc-status-slot" role="alert" id={PROBLEM_ID}'));
  // A problem about one field is written at that field, which takes the focus (DL-124).
  assert.ok(text.includes(`event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();`));
  assert.ok(source("ui/RecordFields.tsx").includes('<p className="rc-error" role="alert" id={`${id}-${name}-hint`}>'));
  // Needs and offers already moves the focus to the list that stopped the page.
  assert.match(source("pages/AskStep.tsx"), /getElementById\(`ask-\$\{first\}-blocker`\)\?\.focus\(\)/u);
});
