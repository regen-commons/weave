import { useEffect, useRef, useState } from "react";
import { AccountFailure } from "../account/client.ts";
import type { ActiveInitiative } from "../account/active-initiative.ts";
import {
  entryKey, entryReference, matchingMessage, matchingRequest,
  type EntryRef, type MatchingEntry, type MatchingMutation, type MatchingSearch, type MatchingState,
  type NetworkLead, type SharingPreview,
} from "./matching-client.ts";

export function sharedEntries(entries: MatchingEntry[], now = Date.now()): MatchingEntry[] {
  return entries.filter(({ sharing, status, expiresAt }) =>
    sharing === "shared" && status === "open" && (expiresAt === null || Date.parse(expiresAt) > now));
}

export function useNetworkMatching(active: ActiveInitiative, onExpired: () => void) {
  const [state, setState] = useState<MatchingState | null>(null);
  const [search, setSearch] = useState<MatchingSearch | null>(null);
  const [leads, setLeads] = useState<NetworkLead[] | null>(null);
  const [preview, setPreview] = useState<{ review: SharingPreview; action: "share" | "renew" } | null>(null);
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

  function failure(cause: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    if (cause instanceof AccountFailure && cause.code === "sign_in_required") expiryHandler.current();
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
      const next = await matchingRequest(id, "state", {}, signal);
      if (signal.aborted) return;
      setState(next);
      const entries = sharedEntries(next.entries).map(entryReference);
      const matching = next.initiativeRevision === active.revision && entries.length
        ? matchingRequest(id, "search", { entries }, signal).then((result) => {
          const queried = new Map(entries.map((entry) => [entryKey(entry), entry.revision]));
          if (result.results.some(({ query }) => queried.get(entryKey(query)) !== query.revision))
            throw new AccountFailure("matching_unavailable");
          if (!signal.aborted) setSearch(result);
        }).catch((cause) => failure(cause, signal))
        : Promise.resolve();
      const saved = matchingRequest(id, "leads", {}, signal).then((result) => {
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
      setPreview(null);
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
    setPreview(null);
    void read(signal);
  }

  async function review(entries: EntryRef[], action: "share" | "renew") {
    const signal = scope.current?.signal;
    if (!signal || !state || reading.current || writing.current || pending) return;
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const response = await matchingRequest(active.id, "preview", { initiativeRevision: state.initiativeRevision, entries }, signal);
      const returned = new Map(response.entries.map((entry) => [entryKey(entry), entry]));
      if (response.initiativeRevision !== state.initiativeRevision || returned.size !== entries.length ||
          response.entries.length !== entries.length || entries.some((entry) => {
            const item = returned.get(entryKey(entry));
            return item?.revision !== entry.revision || item.shareVersion !== entry.shareVersion;
          })) throw new AccountFailure("matching_conflict");
      if (!signal.aborted) setPreview({ review: response, action });
    } catch (cause) {
      failure(cause, signal);
      if (cause instanceof AccountFailure && cause.code === "matching_conflict" && !signal.aborted)
        await read(signal);
    } finally {
      writing.current = false;
      if (!signal.aborted) setBusy(false);
    }
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
        const response = await matchingRequest(active.id, command.action, command.input, signal);
        if (signal.aborted) return;
        setLeads(response.leads);
        setNotice({
          saved: "Lead saved privately.",
          dismissed: "Lead hidden.",
          removed: "Lead choice cleared.",
        }[command.input.disposition]);
      } else {
        await matchingRequest(active.id, command.action, command.input, signal);
        if (signal.aborted) return;
        setPreview(null);
        setNotice({
          share: "Selected entries shared for matching.",
          renew: "Sharing renewed.",
          withdraw: "Selected entry withdrawn from matching.",
        }[command.action]);
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
        if (code !== "sign_in_required") {
          setPreview(null);
          await read(signal);
        }
      }
    } finally {
      writing.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  return { state, search, leads, preview, pending, loading, busy, error, notice, refresh, review, mutate,
    cancelReview: () => setPreview(null) };
}
