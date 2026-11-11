import { useEffect, useState } from "react";
import type { Bundle, Evaluation } from "./contracts.ts";
import { loadCatalog, loadedCatalog, rankCatalog } from "./client.ts";
import { projectFrom } from "./profile.ts";
import { useDraft } from "../describe/use-draft.ts";
import { DeviceDraftSchema, type DeviceDraft } from "../describe/contracts.ts";
export type FundingSubject = Pick<DeviceDraft, "id" | "confirmed" | "funding">;

/**
 * The funding catalog, loaded once and shared, so Home and Funding read the same request. An
 * example bundle replaces it in the fixture world. With `idle`, the first load waits until the
 * browser is idle, so the catalog never delays a page's first paint.
 */
export function useCatalogBundle(example?: Bundle, { idle = false }: { idle?: boolean } = {}) {
  const [bundle, setBundle] = useState<Bundle | undefined>(() => example ?? loadedCatalog());
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(() => !(example ?? loadedCatalog()));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const known = example ?? (attempt === 0 ? loadedCatalog() : undefined);
    if (known) {
      setBundle(known);
      setLoading(false);
      setFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    const load = () => {
      void loadCatalog(attempt > 0)
        .then((value) => {
          if (active) setBundle(value);
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    let cancel = () => {};
    if (idle && attempt === 0) cancel = whenIdle(load);
    else load();
    return () => {
      active = false;
      cancel();
    };
  }, [example, attempt, idle]);
  return { bundle, loading, failed, attempt, retry: () => setAttempt((value) => value + 1) };
}

/** Runs a task once the browser is idle, or shortly where it cannot say. Returns a cancel. */
function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 200);
  return () => clearTimeout(handle);
}

export function useCatalog(example?: Bundle, subject?: FundingSubject) {
  const device = useDraft();
  const draft = subject ?? device.draft;
  const { bundle, loading, failed, attempt, retry } = useCatalogBundle(example);
  const [results, setResults] = useState<Evaluation[] | null>(null);
  const [rankError, setRankError] = useState("");
  const [ranking, setRanking] = useState(false);
  const subjectKey = JSON.stringify({
    id: draft.id,
    confirmed: draft.confirmed,
    funding: { ...draft.funding, editor: null },
  });
  useEffect(() => {
    const abort = new AbortController();
    setResults(null);
    setRanking(false);
    setRankError("");
    if (!bundle) return;
    let project;
    try {
      project = projectFrom(
        DeviceDraftSchema.pick({ id: true, confirmed: true, funding: true }).parse(JSON.parse(subjectKey)),
      );
    } catch {
      setRankError(
        "Your saved funding details need checking. The unranked catalog is available; change those details to continue.",
      );
      return;
    }
    if (!project || !project.description.trim()) return;
    setRanking(true);
    void rankCatalog(bundle, project, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setResults(value);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setRankError("The local matcher could not finish. The unranked catalog is available; try again.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setRanking(false);
      });
    return () => abort.abort();
  }, [bundle, subjectKey, attempt]);
  return {
    bundle,
    results,
    error: (failed ? "The catalog could not load. Your initiative and filter choices are still here." : "") || rankError,
    loading,
    ranking,
    retry,
    personalized: !!draft.confirmed?.description.trim(),
  };
}
