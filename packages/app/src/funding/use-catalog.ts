import { useEffect, useState } from "react";
import type { Bundle, Evaluation } from "./contracts.ts";
import { loadCatalog, rankCatalog } from "./client.ts";
import { projectFrom } from "./profile.ts";
import { useDraft } from "../describe/use-draft.ts";
import { DeviceDraftSchema } from "../describe/contracts.ts";
export function useCatalog(example?: Bundle) {
  const { draft } = useDraft();
  const [bundle, setBundle] = useState<Bundle | undefined>(example);
  const [results, setResults] = useState<Evaluation[] | null>(null);
  const [error, setError] = useState("");
  const [rankError, setRankError] = useState("");
  const [loading, setLoading] = useState(!example);
  const [ranking, setRanking] = useState(false);
  const [retry, setRetry] = useState(0);
  const subjectKey = JSON.stringify({
    id: draft.id,
    confirmed: draft.confirmed,
    funding: { ...draft.funding, editor: null },
  });
  useEffect(() => {
    if (example) {
      setBundle(example);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void loadCatalog(retry > 0)
      .then((value) => {
        if (active) setBundle(value);
      })
      .catch(() => {
        if (active)
          setError("The catalog could not load. Your initiative and filter choices are still here.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [example, retry]);
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
  }, [bundle, subjectKey, retry]);
  return {
    bundle,
    results,
    error: error || rankError,
    loading,
    ranking,
    retry: () => setRetry((value) => value + 1),
    personalized: !!draft.confirmed?.description.trim(),
  };
}
