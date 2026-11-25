import { useEffect, useId, useState, type ReactNode } from "react";
import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import type { PartnerEntry } from "@weave/api/partner-matcher";
import type { RankedPartnerMatch } from "@weave/api/partner-ranking";
import { AccountFailure } from "../account/client.ts";
import { Card, CardGrid } from "../ui/Card.tsx";
import { availabilityUnknownForAll, entryLine, FIT_BASIS, fitLead, fitStrength, strongestFit } from "./groups.ts";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { MatchDetails, PartialFitDetails } from "./NetworkResults.tsx";
import { MatchingDate } from "./SharingReview.tsx";
import { projectSuggestions, rankCertifiedSuggestions, type ProjectSuggestion } from "./certified-suggestions.ts";
import { requestPublicEvidence } from "./matching-client.ts";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { projectAddress } from "./public-project.ts";
import { pathTo } from "../routes.ts";
import { partnersWaitingLine, waitingAction } from "../social/words.ts";

type SnapshotState = { workspaceId: string } & (
  | { status: "ready"; snapshot: PublicEvidenceSnapshot }
  | { status: "error"; code: string }
);

export type CertifiedPartnerResults = {
  checked: boolean;
  renderCards: (select: (query: PartnerEntry) => boolean, level: 3 | 4 | 5 | 6, group?: "matches" | "partial") => ReactNode;
};

export function CertifiedSuggestions({ workspaceId, queries, waiting = [], compact, online, onAccessLost, renderResults }: {
  workspaceId: string;
  queries: readonly PartnerEntry[];
  /**
   * Suggestions from the project page still in pencil. Partner suggestions compare kept needs and
   * offers only, so with none kept these say why the list is empty and where to keep them.
   */
  waiting?: readonly { kind: "needs" | "offers" }[];
  compact: boolean;
  online: boolean;
  onAccessLost?: (code: string) => void;
  renderResults?: (publicResults: CertifiedPartnerResults) => ReactNode;
}) {
  const heading = useId();
  const [loaded, setLoaded] = useState<SnapshotState | null>(null);
  const [ranked, setRanked] = useState<{
    snapshot: PublicEvidenceSnapshot; queries: typeof queries; matches: RankedPartnerMatch[];
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
    const show = (matches: RankedPartnerMatch[]) => setRanked({ snapshot, queries, matches });
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
      worker.onmessage = ({ data }: MessageEvent<RankedPartnerMatch[]>) => {
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
  const PartialHeading = compact ? "h4" : "h3";
  const renderCards: CertifiedPartnerResults["renderCards"] = (select, level, group = "matches") => {
    // A project that fits several entries within this group shows once, naming each.
    const projects = matches ? projectSuggestions(matches.filter((match) => !!match.partial === (group === "partial")), queries.filter(select), compact ? 2 : undefined) : [];
    if (!projects.length) return null;
    const Title = `h${level}` as const;
    return (
      <CardGrid>
        {projects.map((project) => (
          <li key={project.id}><ProjectCard project={project} Title={Title} /></li>
        ))}
      </CardGrid>
    );
  };
  const partialCards = !renderResults && renderCards(() => true, compact ? 5 : 4, "partial");
  return (
    <section className="rc-stack" aria-labelledby={heading}>
      <Heading id={heading} className="rc-heading" data-size="section">Partners For You</Heading>
      {renderResults?.({ checked: matches !== null, renderCards })}
      {!hasQueries ? (waiting.length ? (
        <>
          <p>{partnersWaitingLine(waiting)}</p>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo(waiting[0]!.kind)} variant="secondary" size="sm">{waitingAction(waiting)}</ButtonLink>
          </div>
        </>
      ) : <p>Keep an open need or offer to see suggestions.</p>)
        : !online ? <p>Reconnect to check public Certified evidence.</p>
        : current?.status === "error" ? (
          <p role="status">{["not_found", "project_not_found", "workspace_access_required"].includes(current.code)
            ? "Link an available Certified project to see suggestions."
            : current.code === "project_consent_required" ? "Confirm Certified project access to see suggestions."
              : "Public Certified evidence is unavailable right now."}</p>
        ) : !matches ? <CardGridSkeleton kind="partner" count={compact ? 2 : 3} label="Checking public Certified evidence" /> : (
          <>
            <p className="rc-meta">
              Compared on this device with a limited set of public Certified projects.
              {snapshot?.status === "stale" && " The index may be out of date."}
              {snapshot?.status === "partial" && " The index is incomplete."}
              {snapshot?.truncated && " More projects are indexed."}
              {snapshot?.indexedAt && <> Last full check <MatchingDate value={snapshot.indexedAt} />.</>}
            </p>
            {!renderResults && matches.length === 0 && <p>No matches in this collection.</p>}
            {!renderResults && renderCards(() => true, compact ? 4 : 3)}
            {partialCards && (
              <section className="rc-section" aria-labelledby={`${heading}-partial`}>
                <PartialHeading className="rc-heading" data-size="section" id={`${heading}-partial`}>Partial Fits</PartialHeading>
                {partialCards}
              </section>
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
function ProjectCard({ project, Title }: { project: ProjectSuggestion; Title: "h3" | "h4" | "h5" | "h6" }) {
  // The project opens at its Weave address, as on Initiatives (DL-136). Only one without an address
  // falls back to its public record's data.
  const address = projectAddress(project.id);
  const sources = address ? [] : [...new Set(project.passages.flatMap(({ sourceUrl }) => (sourceUrl ? [sourceUrl] : [])))];
  const several = project.fits.length > 1;
  const strength = strongestFit(project.fits.map(({ match }) => fitStrength(match.evidenceKind, match.reciprocal)));
  const onlyPartial = project.fits.every(({ match }) => match.partial);
  const unknownForAll = availabilityUnknownForAll(project.fits);
  return (
    <Card>
      <Fit level={strength} explanation={onlyPartial ? "Public evidence covers part of the need." : FIT_BASIS[strength]}
        label={onlyPartial ? "Partial fit" : undefined} />
      <Title className="rc-card-title">{project.name}</Title>
      <ul className="rc-reasons">
        {project.fits.map(({ query, match }) => {
          const { direction, lead } = fitLead(match.evidenceKind);
          return (
            <li className="rc-reason" key={`${query.kind}:${query.entryId}`}>
              <Icon name={direction === "they-offer" ? "offer" : "need"} size="sm" />
              <span>
                {match.partial ? "They cover part of your need" : lead}: <strong>{String(query.value.title)}</strong>
                {!unknownForAll && match.unknowns.includes("availability") && ". Availability is unknown."}
              </span>
            </li>
          );
        })}
      </ul>
      {project.fits.map(({ query, match }) => match.partial && <PartialFitDetails key={query.entryId} partial={match.partial} />)}
      {unknownForAll && <p className="rc-meta">Availability is unknown.</p>}
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
      {address && (
        <div className="rc-action-bar">
          <ButtonLink href={address} variant="secondary">
            Open Initiative<span className="rc-visually-hidden">: {project.name}</span>
          </ButtonLink>
        </div>
      )}
      {sources.length > 0 && (
        <div className="rc-action-bar">
          {sources.map((url, index) => (
            <ButtonLink key={url} href={url} variant="secondary">
              {sources.length > 1 ? `View Source ${index + 1}` : "View Source"}
            </ButtonLink>
          ))}
        </div>
      )}
    </Card>
  );
}
