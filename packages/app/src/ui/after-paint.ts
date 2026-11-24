// Runs work just after the browser's next paint. Work that measures the page, run in the same task
// that changed it, makes the browser lay the page out early, inside the task (a forced reflow); run
// after the next paint, the same measurements read the layout that paint already made.

/** The parts of the window this uses. */
export interface PaintWindow {
  requestAnimationFrame(run: () => void): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/** Runs `work` once the next frame has been painted; the returned function cancels it if it has not run. */
export function afterPaint(win: PaintWindow, work: () => void): () => void {
  let timer = 0;
  // A task queued from the frame callback runs after that frame's paint.
  const frame = win.requestAnimationFrame(() => {
    timer = win.setTimeout(work, 0);
  });
  return () => {
    win.cancelAnimationFrame(frame);
    win.clearTimeout(timer);
  };
}
