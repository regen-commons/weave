import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FALLBACK_DELAY_MS, IDLE_TIMEOUT_MS, registerWorkerWhenIdle, type WorkerWindow } from "../src/register-worker.ts";

function page(options: { readyState?: string; idle?: boolean; worker?: boolean } = {}) {
  const steps: string[] = [];
  const pending: (() => void)[] = [];
  const win: WorkerWindow = {
    document: { readyState: options.readyState ?? "interactive" },
    navigator: options.worker === false ? {} : {
      serviceWorker: {
        register: async (url, { scope }) => void steps.push(`register ${url} ${scope}`),
      },
    },
    addEventListener: (type, listener) => { steps.push(`wait for ${type}`); pending.push(listener); },
    setTimeout: (run, ms) => { steps.push(`after ${ms} ms`); pending.push(run); },
    ...(options.idle === false ? {} : {
      requestIdleCallback: (run: () => void, { timeout }: { timeout: number }) => { steps.push(`when idle, at most ${timeout} ms`); pending.push(run); },
    }),
  };
  const next = () => pending.shift()?.();
  return { win, steps, next };
}

test("the worker registers once the page has loaded and the browser is idle, never during start-up", () => {
  const { win, steps, next } = page();
  registerWorkerWhenIdle(win);
  assert.deepEqual(steps, ["wait for load"]);
  next();
  assert.deepEqual(steps, ["wait for load", `when idle, at most ${IDLE_TIMEOUT_MS} ms`]);
  next();
  assert.deepEqual(steps.at(-1), "register /sw.js /");
});

test("a page already loaded waits only for idle, and a browser without idle callbacks waits a moment", () => {
  const loaded = page({ readyState: "complete" });
  registerWorkerWhenIdle(loaded.win);
  assert.deepEqual(loaded.steps, [`when idle, at most ${IDLE_TIMEOUT_MS} ms`]);
  const noIdle = page({ readyState: "complete", idle: false });
  registerWorkerWhenIdle(noIdle.win);
  assert.deepEqual(noIdle.steps, [`after ${FALLBACK_DELAY_MS} ms`]);
  noIdle.next();
  assert.equal(noIdle.steps.at(-1), "register /sw.js /");
});

test("a browser with no service workers registers nothing", () => {
  const { win, steps } = page({ worker: false });
  registerWorkerWhenIdle(win);
  assert.deepEqual(steps, []);
});

test("the build injects no register script of its own, and the app registers the worker", () => {
  const config = readFileSync(fileURLToPath(new URL("../vite.config.ts", import.meta.url)), "utf8");
  assert.match(config, /injectRegister: false,/u);
  const main = readFileSync(fileURLToPath(new URL("../src/main.tsx", import.meta.url)), "utf8");
  assert.match(main, /registerWorkerWhenIdle\(window\)/u);
});
