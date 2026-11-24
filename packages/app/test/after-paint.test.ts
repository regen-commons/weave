import assert from "node:assert/strict";
import { test } from "node:test";
import { afterPaint, type PaintWindow } from "../src/ui/after-paint.ts";

function frames() {
  const steps: string[] = [];
  let frame: (() => void) | undefined;
  let task: (() => void) | undefined;
  const win: PaintWindow = {
    requestAnimationFrame: (run) => { steps.push("frame asked"); frame = run; return 1; },
    cancelAnimationFrame: () => { steps.push("frame cancelled"); frame = undefined; },
    setTimeout: (run, ms) => { steps.push(`task queued after ${ms} ms`); task = run; return 2; },
    clearTimeout: () => { task = undefined; },
  };
  return { win, steps, paint: () => { frame?.(); frame = undefined; }, runTask: () => { task?.(); task = undefined; } };
}

test("the work waits for the next frame, then runs in a task of its own after that frame's paint", () => {
  const page = frames();
  let ran = false;
  afterPaint(page.win, () => { ran = true; });
  assert.deepEqual(page.steps, ["frame asked"]);
  assert.equal(ran, false, "not in the task that asked");
  page.paint();
  assert.equal(ran, false, "not inside the frame either");
  page.runTask();
  assert.equal(ran, true);
});

test("cancelled before the paint, or after it but before its task, the work never runs", () => {
  for (const when of ["before paint", "after paint"]) {
    const page = frames();
    let ran = false;
    const cancel = afterPaint(page.win, () => { ran = true; });
    if (when === "after paint") page.paint();
    cancel();
    page.paint();
    page.runTask();
    assert.equal(ran, false, when);
  }
});
