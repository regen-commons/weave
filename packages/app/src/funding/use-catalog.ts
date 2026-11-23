import { useEffect, useState } from "react";
import { hasCheckedCard } from "../describe/checked-hint.ts";
import type { Bundle, Evaluation } from "./contracts.ts";
import { loadCatalog, loadClosingSoon, loadedCatalog, rankCatalog } from "./client.ts";
import { closingSoonOf, type ClosingSoon } from "./catalog-requests.ts";
import { projectFrom } from "./profile.ts";
import { useDraft } from "../describe/use-draft.ts";
import { DeviceDraftSchema, type DeviceDraft } from "../describe/contracts.ts";
import { useSetAside } from "../account/set-aside.ts";
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

/**
 * Home's closing-soon strip, without the catalog: the open calls closing soonest, as card-ready
 * entries, and how many close within 30 days. The catalog is read and checked off the page, and
 * only these come back (Q-01). Where the page already holds the catalog, or the example world
 * brings its own, they are worked out at once. With `idle`, the first read waits for an idle moment.
 */
export function useClosingSoon(example?: Bundle, { idle = false }: { idle?: boolean } = {}) {
  const known = () => {
    const bundle = example ?? loadedCatalog();
    return bundle ? closingSoonOf(bundle, new Date()) : undefined;
  };
  const [value, setValue] = useState<ClosingSoon | undefined>(known);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(() => !value);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const now = attempt === 0 ? known() : example && closingSoonOf(example, new Date());
    if (now) {
      setValue(now);
      setLoading(false);
      setFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    const load = () => {
      void loadClosingSoon(new Date(), attempt > 0)
        .then((result) => {
          if (active) setValue(result);
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
  return {
    upcoming: value?.upcoming ?? [],
    closingSoon: value?.closingSoon ?? 0,
    loading,
    failed,
    retry: () => setAttempt((count) => count + 1),
  };
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

/**
 * The catalog and, unless `compare` is off, how it fits the initiative: the tab's own, or `subject`.
 * With `compare` off, as when someone browses Funding with no initiative, nothing is ranked.
 */
export function useCatalog(example?: Bundle, subject?: FundingSubject, { compare = true }: { compare?: boolean } = {}) {
  const device = useDraft();
  // Another account's card on this device fits nothing for this one (DL-055).
  const setAside = useSetAside();
  const draft = subject ?? (setAside ? { ...device.draft, confirmed: null } : device.draft);
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
    if (!bundle || !compare) return;
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
  }, [bundle, subjectKey, attempt, compare]);
  return {
    bundle,
    results,
    error: (failed ? "The catalog could not load. Your initiative and filter choices are still here." : "") || rankError,
    loading,
    ranking,
    retry,
    personalized: hasCheckedCard(draft),
    /** Whether the card to compare with is known yet. Until the device draft opens, `personalized` is a guess. */
    subjectKnown: !!subject || device.ready,
  };
}
