import { useEffect, useReducer } from "react";
import { requestPublicProject } from "../partners/public-project.ts";
import type { InitiativeLookup } from "./rows.ts";

/** At most this many asks at once, so a long shortlist never floods a slow connection. */
const AT_ONCE = 4;

/**
 * What the public list says now about each shortlisted initiative, asked once a visit per address
 * from the list's cached lookup. An address the list could not answer is asked again next time the
 * shortlist opens. Nothing of the person's is sent: each ask names one public project.
 */
const known = new Map<string, InitiativeLookup>();

export function useInitiativeLookups(uris: readonly string[]): ReadonlyMap<string, InitiativeLookup> {
  const [, heard] = useReducer((count: number) => count + 1, 0);
  const key = uris.join("\n");
  useEffect(() => {
    const abort = new AbortController();
    const todo = uris.filter((uri) => !known.has(uri) || known.get(uri)!.status === "failed");
    if (!todo.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      for (const uri of todo) known.set(uri, { status: "failed" });
      heard();
      return;
    }
    let next = 0;
    async function work() {
      while (next < todo.length && !abort.signal.aborted) {
        const uri = todo[next++]!;
        try {
          const lookup = await requestPublicProject(uri, abort.signal);
          known.set(uri, lookup.status === "found" ? { status: "found", card: lookup.card } : { status: lookup.status });
        } catch {
          if (abort.signal.aborted) return;
          known.set(uri, { status: "failed" });
        }
        heard();
      }
    }
    void Promise.all(Array.from({ length: Math.min(AT_ONCE, todo.length) }, work));
    return () => abort.abort();
    // The addresses, not the array that carries them, decide what to ask.
  }, [key]);
  return new Map(uris.map((uri) => [uri, known.get(uri) ?? { status: "checking" }]));
}
