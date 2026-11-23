import { z } from "../validation.ts";
import catalogUrl from "../../../../dist/data/funders.json?url";
import rulesUrl from "../../../../dist/data/eligibility-rules.json?url";
import conditionsUrl from "../../../../dist/data/program-conditions.json?url";
import {
  closingSoonOf,
  readCatalog,
  type CatalogRequest,
  type CatalogSources,
  type ClosingSoon,
} from "./catalog-requests.ts";
import { EvaluationSchema, type Bundle } from "./contracts.ts";
import type { Project } from "./engine.ts";

const sources = (): CatalogSources => ({
  catalog: new URL(catalogUrl, location.href).href,
  rules: new URL(rulesUrl, location.href).href,
  conditions: new URL(conditionsUrl, location.href).href,
});

/**
 * One worker reads and checks the catalog for the whole session and answers each page with what it
 * shows (`catalog-requests.ts`). It is started on the first request and kept. If it fails, every
 * waiting request is refused and the next request starts another.
 */
let worker: Worker | undefined;
let lastId = 0;
const waiting = new Map<number, (reply: { ok: true; value: unknown } | { ok: false }) => void>();
function catalogWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  const started = new Worker(new URL("./catalog-worker.ts", import.meta.url), { type: "module" });
  const fail = () => {
    started.terminate();
    if (worker === started) worker = undefined;
    for (const settle of waiting.values()) settle({ ok: false });
    waiting.clear();
  };
  started.onmessage = (event: MessageEvent<unknown>) => {
    const reply = event.data as { id?: unknown; ok?: unknown; value?: unknown } | null;
    if (typeof reply?.id !== "number") return;
    const settle = waiting.get(reply.id);
    waiting.delete(reply.id);
    settle?.(reply.ok === true ? { ok: true, value: reply.value } : { ok: false });
  };
  started.onerror = fail;
  started.onmessageerror = fail;
  return (worker = started);
}
type Question = CatalogRequest extends infer R ? (R extends unknown ? Omit<R, "id" | "sources"> : never) : never;
function ask(port: Worker, question: Question, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const id = ++lastId;
  return new Promise((resolve, reject) => {
    const abort = () => {
      waiting.delete(id);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    waiting.set(id, (reply) => {
      signal?.removeEventListener("abort", abort);
      if (reply.ok) resolve(reply.value);
      else reject(new Error("The catalog could not load."));
    });
    try {
      port.postMessage({ ...question, id, sources: sources() });
    } catch {
      waiting.delete(id);
      reject(new Error("The catalog could not load."));
    }
  });
}

let loaded: Promise<Bundle> | undefined;
/** The catalog once it has loaded in this session, so a page opened again shows it at once. */
let ready: Bundle | undefined;
/** The bundle the worker holds too, which it can rank without being sent it again. */
let shared: Bundle | undefined;
export function loadedCatalog(): Bundle | undefined {
  return ready;
}
export function loadCatalog(retry = false): Promise<Bundle> {
  if (retry) {
    loaded = undefined;
    ready = undefined;
  }
  const port = catalogWorker();
  return (loaded ??= (
    port
      ? // The worker ran the same checks (`parseBundle`) before sending it, so it is not checked twice.
        ask(port, { kind: "bundle", retry }).then((value) => (shared = value as Bundle))
      : readCatalog(sources())
  )
    .then((bundle) => (ready = bundle))
    .catch((error: unknown) => {
      loaded = undefined;
      throw error;
    }));
}

/**
 * Home's closing-soon strip. Where the page already holds the catalog it works it out at once;
 * otherwise only the four cards and the count come back from the worker, never the catalog.
 */
export async function loadClosingSoon(now: Date, retry = false): Promise<ClosingSoon> {
  if (ready && !retry) return closingSoonOf(ready, now);
  const port = catalogWorker();
  if (!port) return closingSoonOf(await loadCatalog(retry), now);
  return (await ask(port, { kind: "closing-soon", now: now.toISOString(), retry })) as ClosingSoon;
}

export async function rankCatalog(bundle: Bundle, project: Project, signal: AbortSignal) {
  signal.throwIfAborted();
  if (typeof Worker === "undefined") return (await import("./engine.ts")).evaluateCatalog(bundle, project);
  const port = bundle === shared ? catalogWorker() : null;
  if (port) {
    const parsed = z.array(EvaluationSchema).safeParse(await ask(port, { kind: "rank", project, retry: false }, signal));
    if (parsed.success) return parsed.data;
    throw new Error("The local matching result could not be checked.");
  }
  // A bundle the worker does not hold, such as the example world's, goes to a worker of its own.
  return new Promise<z.infer<typeof EvaluationSchema>[]>((resolve, reject) => {
    const ranker = new Worker(new URL("./rank-worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      ranker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    ranker.onmessage = (event) => {
      cleanup();
      const parsed = z.array(EvaluationSchema).safeParse(event.data?.results);
      if (event.data?.ok && parsed.success) resolve(parsed.data);
      else reject(new Error("The local matching result could not be checked."));
    };
    ranker.onerror = () => {
      cleanup();
      reject(new Error("The local matcher could not start."));
    };
    ranker.onmessageerror = () => {
      cleanup();
      reject(new Error("The local matching result could not be read."));
    };
    try {
      ranker.postMessage({
        catalog: bundle.catalog,
        rules: { version: 1, rules: bundle.rules },
        conditions: bundle.conditions === null ? null : { version: 1, conditions: bundle.conditions },
        project,
      });
    } catch {
      cleanup();
      reject(new Error("The local matcher could not receive your card."));
    }
  });
}
