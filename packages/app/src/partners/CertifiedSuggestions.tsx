import { useEffect, useId, useState } from "react";
import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import type { PartnerEntry, PartnerMatch } from "@weave/api/partner-matcher";
import { AccountFailure } from "../account/client.ts";
import { Card, CardGrid } from "../ui/Card.tsx";
import { entryLine, FIT_BASIS, fitLead, fitStrength, strongestFit } from "./groups.ts";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { MatchDetails } from "./NetworkResults.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import { projectSuggestions, rankCertifiedSuggestions, type ProjectSuggestion } from "./certified-suggestions.ts";
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
  const Title = compact ? "h4" : "h3";
  // A project that fits several needs and offers shows once, naming each (DL-052).
  const projects = matches ? projectSuggestions(matches, queries, compact ? 2 : undefined) : [];
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
            {projects.length > 0 && (
              <CardGrid>
                {projects.map((project) => (
                  <li key={project.id}>
                    <ProjectCard project={project} Title={Title} />
                  </li>
                ))}
              </CardGrid>
            )}
          </>
        )}
    </section>
  );
}

/**
 * One project (DL-052, DL-064): how strong its best fit is, each of the person's needs and offers it
 * fits and which way, then the project's own words once and why each fits on request.
 */
function ProjectCard({ project, Title }: { project: ProjectSuggestion; Title: "h3" | "h4" }) {
  const sources = [...new Set(project.passages.flatMap(({ sourceUrl }) => (sourceUrl ? [sourceUrl] : [])))];
  const several = project.fits.length > 1;
  const strength = strongestFit(project.fits.map(({ match }) => fitStrength(match.evidenceKind, match.reciprocal)));
  return (
    <Card>
      <Fit level={strength} explanation={FIT_BASIS[strength]} />
      <Title className="rc-card-title">{project.name}</Title>
      <ul className="rc-reasons">
        {project.fits.map(({ query, match }) => {
          const { direction, lead } = fitLead(match.evidenceKind);
          return (
            <li className="rc-reason" key={`${query.kind}:${query.entryId}`}>
              <Icon name={direction === "they-offer" ? "offer" : "need"} size="sm" />
              <span>
                {lead}: <strong>{String(query.value.title)}</strong>
                {match.unknowns.includes("availability") && ". Availability is unknown."}
              </span>
            </li>
          );
        })}
      </ul>
      {project.passages.map(({ text }) => <blockquote className="rc-prose" key={text}>{text}</blockquote>)}
      <details className="rc-stack">
        <summary>{several ? "Why these fit" : "Why this fits"}</summary>
        {project.fits.map(({ query, match }) => (
          <div className="rc-stack" key={`${query.kind}:${query.entryId}`}>
            {several && <p><strong>{entryLine(query.kind, String(query.value.title))}</strong></p>}
            <MatchDetails match={match} />
          </div>
        ))}
      </details>
      {sources.length > 0 && (
        <div className="rc-action-bar">
          {sources.map((url, index) => (
            <a key={url} className="rc-button" data-variant="secondary" href={url} target="_blank" rel="noopener noreferrer">
              {sources.length > 1 ? `View source ${index + 1}` : "View source"}
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
