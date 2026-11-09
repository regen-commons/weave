import { z } from "../validation.ts";
import catalogUrl from "../../../../dist/data/funders.json?url";
import rulesUrl from "../../../../dist/data/eligibility-rules.json?url";
import conditionsUrl from "../../../../dist/data/program-conditions.json?url";
import { parseBundle } from "./catalog.ts";
import { EvaluationSchema, type Bundle } from "./contracts.ts";
import type { Project } from "./engine.ts";
let loaded: Promise<Bundle> | undefined;
async function read(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The catalog could not load.");
  return response.json() as Promise<unknown>;
}
export function loadCatalog(retry = false): Promise<Bundle> {
  if (retry) loaded = undefined;
  return (loaded ??= Promise.all([read(catalogUrl), read(rulesUrl), read(conditionsUrl).catch(() => null)])
    .then(([catalog, rules, conditions]) => parseBundle(catalog, rules, conditions))
    .catch((error) => {
      loaded = undefined;
      throw error;
    }));
}
export async function rankCatalog(bundle: Bundle, project: Project, signal: AbortSignal) {
  signal.throwIfAborted();
  if (typeof Worker === "undefined") return (await import("./engine.ts")).evaluateCatalog(bundle, project);
  return new Promise<z.infer<typeof EvaluationSchema>[]>((resolve, reject) => {
    const worker = new Worker(new URL("./rank-worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      const parsed = z.array(EvaluationSchema).safeParse(event.data?.results);
      if (event.data?.ok && parsed.success) resolve(parsed.data);
      else reject(new Error("The local matching result could not be checked."));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The local matcher could not start."));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("The local matching result could not be read."));
    };
    try {
      worker.postMessage({
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
