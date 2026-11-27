import { useEffect, useRef, useState } from "react";
import { AccountFailure, type AccountState } from "../account/client.ts";
import type { ActiveInitiative } from "../account/active-initiative.ts";
import {
  confirmedMatchingRequest, entryKey, entryReference, matchingMessage,
  type MatchingEntry, type MatchingMutation, type MatchingSearch, type MatchingState, type NetworkLead,
} from "./matching-client.ts";

export function sharedEntries<Entry extends MatchingEntry>(entries: readonly Entry[], now = Date.now()): Entry[] {
  return entries.filter(({ sharing, status, expiresAt }) =>
    sharing === "shared" && status === "open" && (expiresAt === null || Date.parse(expiresAt) > now));
}

/**
 * What a share still on says, where it can be stopped. Nothing new is shared for matching (DL-155, step 4),
 * and the shares already on end when published listings take over matching (step 5).
 */
export function sharedLine(count: number, team = false): string {
  return `${count} ${count === 1 ? "need or offer is" : "needs and offers are"} still shared with people signed in${team ? " from this workspace" : ""}.`;
}

/**
 * `confirm` asks /api/account, which renews the session, before a refusal from the matching endpoint
 * reads as an ended session. `onExpired` hears of a session that did end, after the screen was cleared.
 */
export function useNetworkMatching(active: ActiveInitiative, confirm: () => Promise<AccountState>, onExpired?: () => void) {
  const [state, setState] = useState<MatchingState | null>(null);
  const [search, setSearch] = useState<MatchingSearch | null>(null);
  const [leads, setLeads] = useState<NetworkLead[] | null>(null);
  const [pending, setPending] = useState<MatchingMutation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scope = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const reading = useRef(false);
  const expiryHandler = useRef(onExpired);
  expiryHandler.current = onExpired;
  const confirmer = useRef(confirm);
  confirmer.current = confirm;
  const request = confirmedMatchingRequest(() => confirmer.current(), active.owner);

  function failure(cause: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    if (cause instanceof AccountFailure && cause.code === "sign_in_required") expiryHandler.current?.();
    else setError(matchingMessage(cause));
  }

  async function read(signal: AbortSignal) {
    reading.current = true;
    setState(null);
    setSearch(null);
    setLeads(null);
    setLoading(true);
    try {
      const id = active.id;
      const next = await request(id, "state", {}, signal);
      if (signal.aborted) return;
      setState(next);
      const entries = sharedEntries(next.entries).map(entryReference);
      const matching = next.initiativeRevision === active.revision && entries.length
        ? request(id, "search", { entries }, signal).then((result) => {
          const queried = new Map(entries.map((entry) => [entryKey(entry), entry.revision]));
          if (result.results.some(({ query }) => queried.get(entryKey(query)) !== query.revision))
            throw new AccountFailure("matching_unavailable");
          if (!signal.aborted) setSearch(result);
        }).catch((cause) => failure(cause, signal))
        : Promise.resolve();
      const saved = request(id, "leads", {}, signal).then((result) => {
        if (!signal.aborted) setLeads(result.leads);
      }).catch((cause) => failure(cause, signal));
      await Promise.all([matching, saved]);
    } catch (cause) {
      failure(cause, signal);
    } finally {
      if (!signal.aborted) {
        reading.current = false;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    void read(controller.signal);
    return () => controller.abort();
  }, [active.id, active.revision]);

  useEffect(() => {
    function reconnect() {
      const signal = scope.current?.signal;
      if (!signal || reading.current || writing.current || pending) return;
      setError("");
      void read(signal);
    }
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [active.id, active.revision, pending]);

  useEffect(() => {
    if (!state || !scope.current || loading || busy || pending) return;
    const now = Date.now();
    const resultExpiries = (search?.results ?? []).flatMap(({ evidence }) =>
      evidence.type === "shared" && evidence.expiresAt !== null && Date.parse(evidence.expiresAt) > now ? [Date.parse(evidence.expiresAt)] : []);
    const expires = Math.min(...sharedEntries(state.entries, now).flatMap(({ expiresAt }) => expiresAt === null ? [] : [Date.parse(expiresAt)]),
      ...resultExpiries);
    if (!Number.isFinite(expires)) return;
    const controller = scope.current;
    const timeout = window.setTimeout(() => {
      if (!controller.signal.aborted && !reading.current && !writing.current) void read(controller.signal);
    }, Math.min(2_147_483_647, Math.max(0, expires - Date.now())));
    return () => window.clearTimeout(timeout);
  }, [state, search, loading, busy, pending]);

  function refresh() {
    const signal = scope.current?.signal;
    if (!signal || reading.current || writing.current || pending) return;
    setError("");
    setNotice("");
    void read(signal);
  }

  async function mutate(command: MatchingMutation) {
    const signal = scope.current?.signal;
    if (!signal || reading.current || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (command.action === "set_lead") {
        const response = await request(active.id, command.action, command.input, signal);
        if (signal.aborted) return;
        setLeads(response.leads);
        setNotice({
          saved: "Lead saved privately.",
          dismissed: "Lead hidden.",
          removed: "Lead choice cleared.",
        }[command.input.disposition]);
      } else {
        await request(active.id, command.action, command.input, signal);
        if (signal.aborted) return;
        setNotice("Selected entry withdrawn from matching.");
        await read(signal);
      }
      setPending(null);
    } catch (cause) {
      failure(cause, signal);
      if (signal.aborted) return;
      const code = cause instanceof AccountFailure ? cause.code : "";
      if (["connection_failed", "matching_unavailable", "account_unavailable", "request_timeout"].includes(code)) {
        // The server may have committed before the response was lost. Replay the exact command.
        setPending(command);
        if (command.action !== "set_lead") setSearch(null);
      } else {
        setPending(null);
        if (code !== "sign_in_required") await read(signal);
      }
    } finally {
      writing.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  return { state, search, leads, pending, loading, busy, error, notice, refresh, mutate };
}
