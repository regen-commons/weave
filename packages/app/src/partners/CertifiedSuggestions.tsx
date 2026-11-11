import { useEffect, useId, useState } from "react";
import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import type { PartnerEntry, PartnerMatch } from "@weave/api/partner-matcher";
import { AccountFailure } from "../account/client.ts";
import { Card, CardGrid } from "../ui/Card.tsx";
import { MatchEvidence } from "./NetworkResults.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import { rankCertifiedSuggestions } from "./certified-suggestions.ts";
import { requestPublicEvidence } from "./matching-client.ts";

type SnapshotState = { workspaceId: string } & (
  | { status: "ready"; snapshot: PublicEvidenceSnapshot }
  | { status: "error"; code: string }
);

export function CertifiedSuggestions({ workspaceId, queries, compact, online, onAccessLost }: {
  workspaceId: string;
  queries: readonly PartnerEntry[];
  compact: boolean;
  online: boolean;
  onAccessLost?: (code: string) => void;
}) {
  const heading = useId();
  const [loaded, setLoaded] = useState<SnapshotState | null>(null);
  const [ranked, setRanked] = useState<{
    snapshot: PublicEvidenceSnapshot; queries: typeof queries; matches: PartnerMatch[];
  } | null>(null);
  const hasQueries = queries.length > 0;
  useEffect(() => {
    if (!online || !hasQueries) {
      setLoaded(null);
      setRanked(null);
      return;
    }
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout>;
    function load() {
      setLoaded(null);
      void requestPublicEvidence(workspaceId, controller.signal).then((snapshot) => {
        if (controller.signal.aborted) return;
        setLoaded({ workspaceId, status: "ready", snapshot });
        refresh = setTimeout(load, Math.max(0, Date.parse(snapshot.availableUntil) - Date.now()));
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof AccountFailure ? error.code : "";
        setLoaded({ workspaceId, status: "error", code });
        if (["sign_in_required", "workspace_access_required", "not_found", "project_authority_required", "project_consent_required"].includes(code))
          onAccessLost?.(code);
      });
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(refresh);
    };
  }, [workspaceId, hasQueries, online, onAccessLost]);

  const current = online && hasQueries && loaded?.workspaceId === workspaceId ? loaded : null;
  const snapshot = current?.status === "ready" && Date.parse(current.snapshot.availableUntil) > Date.now()
    ? current.snapshot : null;
  useEffect(() => {
    if (!snapshot) return;
    const input = [workspaceId, queries, snapshot.evidence] as const;
    const show = (matches: PartnerMatch[]) => setRanked({ snapshot, queries, matches });
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      worker?.terminate();
      clearTimeout(timeout);
    };
    const fallback = () => {
      stop();
      show(rankCertifiedSuggestions(...input));
    };
    try {
      worker = new Worker(new URL("./certified-suggestions-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<PartnerMatch[]>) => {
        stop();
        show(data);
      };
      worker.onerror = worker.onmessageerror = fallback;
      timeout = setTimeout(fallback, 3000);
      worker.postMessage(input);
    } catch {
      fallback();
    }
    return stop;
  }, [workspaceId, snapshot, queries]);

  const matches = snapshot && ranked?.snapshot === snapshot && ranked.queries === queries
    ? ranked.matches : null;
  const Heading = compact ? "h3" : "h2";
  const Group = compact ? "h4" : "h3";
  const Title = compact ? "h5" : "h4";
  return (
    <section className="rc-stack" aria-labelledby={heading}>
      <Heading id={heading} className="rc-heading" data-size="section">Partners for you</Heading>
      {!hasQueries ? <p>Keep an open need or offer to see suggestions.</p>
        : !online ? <p>Reconnect to check public Certified evidence.</p>
        : current?.status === "error" ? (
          <p role="status">{["not_found", "project_not_found", "workspace_access_required"].includes(current.code)
            ? "Link an available Certified project to see suggestions."
            : current.code === "project_consent_required" ? "Confirm Certified project access to see suggestions."
              : "Public Certified evidence is unavailable right now."}</p>
        ) : !matches ? <p role="status">Checking public Certified evidence</p> : (
          <>
            <p className="rc-meta">
              Compared on this device with a limited set of public Certified projects.
              {snapshot?.status === "stale" && " The index may be out of date."}
              {snapshot?.status === "partial" && " The index is incomplete."}
              {snapshot?.truncated && " More projects are indexed."}
              {snapshot?.indexedAt && <> Last full check <MatchingDate value={snapshot.indexedAt} />.</>}
            </p>
            {matches.length === 0 && <p>No matches in this collection.</p>}
            {queries.map((query) => {
              const candidates = matches.filter(({ query: entry }) => entry.kind === query.kind && entry.entryId === query.entryId);
              if (!candidates.length) return null;
              return (
                <section key={`${query.kind}:${query.entryId}`} className="rc-stack">
                  <Group className="rc-heading" data-size="section">{String(query.value.title)}</Group>
                  <CardGrid>
                    {(compact ? candidates.slice(0, 2) : candidates).map((match) => (
                      <li key={match.candidateId}>
                        <Card>
                          <Title className="rc-card-title">{match.counterpart.name}</Title>
                          <MatchEvidence match={match} discloseDetails />
                          {match.evidence.type === "public" && (
                            <div className="rc-action-bar">
                              <a className="rc-button" data-variant="secondary" href={match.evidence.sourceUrl}
                                target="_blank" rel="noopener noreferrer">View source</a>
                            </div>
                          )}
                        </Card>
                      </li>
                    ))}
                  </CardGrid>
                </section>
              );
            })}
          </>
        )}
    </section>
  );
}
