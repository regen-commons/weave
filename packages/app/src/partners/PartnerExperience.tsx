import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSocial } from "../social/context.tsx";
import { useAccount } from "../account/context.tsx";
import { activeInitiative, type ActiveInitiative } from "../account/active-initiative.ts";
import { accountKey } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { projectLinkLine } from "../initiative/list.ts";
import { useProjectLink } from "../initiative/use-project-link.ts";
import { STATUS } from "../intake/contracts.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { NetworkResults } from "./NetworkResults.tsx";
import { MatchingFeedback } from "./MatchingFeedback.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { CardGridSkeleton, LinesSkeleton } from "../ui/CardSkeleton.tsx";
import { waitingSuggestions } from "../initiative/import.ts";
import { CertifiedSuggestions, type CertifiedPartnerResults } from "./CertifiedSuggestions.tsx";
import { privatePartnerQueries } from "./certified-suggestions.ts";
import { MatchingDate } from "./SharingReview.tsx";
import { entryKey, entryReference, type MatchingEntry } from "./matching-client.ts";
import { sharedEntries, sharedLine, useNetworkMatching } from "./use-network-matching.ts";

const sharingLabels: Record<MatchingEntry["sharing"], string> = {
  private: "Not shared",
  shared: "Shared for matching",
  needs_review: "Changed since you shared, so no longer shown",
  withdrawn: "Withdrawn from matching",
  expired: "Sharing ended",
};
const selectionKey = (entry: MatchingEntry) => `${entryKey(entry)}/${entry.revision}/${entry.shareVersion}`;
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const isOnline = () => navigator.onLine;

/** The kinds of support a saved entry names. The saved document is checked data, but its values are untyped here. */
const kindsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((kind): kind is string => typeof kind === "string") : [];

export function PartnerExperience({ mode, separateActions = false, refreshVersion = 0, onShared }: {
  mode: "matches" | "preview"; separateActions?: boolean; refreshVersion?: number;
  /** Hears that the share step opened here closed, so the page's sharing row reads its status again. */
  onShared?(): void;
}) {
  const { state } = useAccount();
  const social = useSocial();
  const project = social?.mode === "live" ? social.state.project : null;
  const { draft, ready } = useDraft();
  const link = useProjectLink();
  const owner = state?.user?.id;
  const saved = draft.account.saved;
  const active = useMemo(() => activeInitiative(saved, owner), [saved, owner]);
  const linkedId = project?.workspaceId;
  const linkedPersonal = !!active && linkedId === active.id && !project?.group;
  const queries = useMemo(() => linkedId ? privatePartnerQueries(linkedId, active?.revision ?? 0,
    draft.needs.items.filter(({ decision }) => decision === "kept"),
    draft.offers.items.filter(({ decision }) => decision === "kept"),
    draft.confirmed,
  ) : [], [linkedId, active, draft.needs.items, draft.offers.items, draft.confirmed]);
  const compact = mode === "preview";
  // Why there are no partner suggestions yet, and what opens them.
  const unlinkedLine = project?.group && !linkedId
    ? project.role === "member"
      ? "Your team workspace needs approval and an access grant before partner suggestions can open."
      : "Set up the team workspace to open partner suggestions."
    : project && !linkedId ? "Partner suggestions for this project are not ready yet. Make your needs and offers public so other initiatives can find them."
      : link === "signed-out" ? "Sign in to get partner suggestions for your linked Certified project."
        : link === "checking" || link === "unchecked" ? projectLinkLine(link)
          : "Link a Certified project to get partner suggestions for your private needs and offers.";
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const synced = !!active && active.contentKey === accountKey(draft);
  const combined = synced && linkedPersonal;
  const savedMatching = (publicResults?: CertifiedPartnerResults) => active && (
    <SavedMatching key={`${active.owner}/${active.id}/${active.revision}`}
      active={active} synced={synced} compact={compact} online={online} fixture={state?.fixture === true}
      presentation={separateActions ? "results" : "all"} refreshVersion={refreshVersion}
      publicResults={publicResults} onShared={onShared} />
  );
  return (
    <div className="rc-stack">
      {linkedId && ready && <CertifiedSuggestions key={`${owner}/${linkedId}`}
        workspaceId={linkedId} queries={queries} waiting={waitingSuggestions(draft)} compact={compact} online={online}
        renderResults={combined ? savedMatching : undefined} />}
      {active && ready && linkedPersonal ? (
        !combined && savedMatching()
      ) : (
        // With no card yet there is nothing to save: the list below asks for the card first. A session
        // that ended is said once, by the page's own notice (SessionEndedNotice).
        ready && !!draft.confirmed && (compact ? (
          // On the card's page the steps to link a project sit in Saving And Sharing, so this line
          // offers what can be done now: the initiatives already in the directory.
          <StatusLine
            actions={
              <ButtonLink href={pathTo("initiatives")} variant="secondary" size="sm">
                Browse All Initiatives
              </ButtonLink>
            }
          >
            {unlinkedLine}
          </StatusLine>
        ) : (
          <p>{unlinkedLine}</p>
        ))
      )}
      {compact && active && !separateActions && (
        <div className="rc-action-bar"><ButtonLink href={pathTo("partners")} variant="secondary">See All Partners</ButtonLink></div>
      )}
    </div>
  );
}

export function SavedMatching({ active, synced, compact, online, onExpired, fixture, readOnly = false, team = false, presentation = "all", visible = true, refreshVersion = 0, publicResults, onShared }: {
  active: ActiveInitiative;
  synced: boolean;
  compact: boolean;
  online: boolean;
  /** Hears of a session that ended, after the screen was cleared. */
  onExpired?(): void;
  fixture: boolean;
  readOnly?: boolean;
  team?: boolean;
  presentation?: "all" | "sharing" | "results";
  visible?: boolean;
  refreshVersion?: number;
  publicResults?: CertifiedPartnerResults;
  onShared?(): void;
}) {
  const heading = useId();
  const { confirm } = useAccount();
  const network = useNetworkMatching(active, confirm, onExpired);
  const lastRefresh = useRef(refreshVersion);
  useEffect(() => {
    if (lastRefresh.current === refreshVersion) return;
    lastRefresh.current = refreshVersion;
    // A pending write keeps its exact command; the hook declines refresh until it is resolved.
    network.refresh();
  }, [refreshVersion]);
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    notice.current?.focus();
  }, [network.notice]);
  // Stopping a share still on, from Partners For You (DL-155, step 4: nothing new is shared).
  const [sharing, setSharing] = useState(false);
  const [withdrawal, setWithdrawal] = useState<string | null>(null);
  const Title = compact || publicResults ? "h3" : "h2";
  const state = network.state;
  const stale = state !== null && state.initiativeRevision !== active.revision;
  const blocked = network.loading || network.busy || !!network.pending || !online;
  const entries = stale ? [] : (state?.entries ?? []).flatMap((entry) => {
    const item = active.document[entry.kind === "need" ? "needs" : "offers"].find(({ id }) => id === entry.entryId);
    return typeof item?.value.title === "string" ? [{ ...entry, title: item.value.title, kinds: kindsOf(item.value.capitalForms), classified: Array.isArray(item.value.capitalForms) && item.value.capitalForms.length > 0 }] : [];
  });
  const withdrawing = entries.find((entry) => selectionKey(entry) === withdrawal);
  // What is still shared from before Weave stopped sharing, each with a way to withdraw it. Nothing else is
  // listed: an entry never shared, or already withdrawn, has nothing left to do here.
  const stillShared = entries.filter(({ sharing }) => sharing === "shared" || sharing === "expired" || sharing === "needs_review");
  const listing = presentation === "sharing" || stillShared.length > 0;

  const results = (<NetworkResults search={online ? network.search : null} leads={online ? network.leads : null} entries={entries}
        compact={compact} blocked={blocked} readOnly={readOnly} includePublic={presentation !== "results" && !publicResults}
        publicResults={publicResults} sharedNeeds={sharedEntries(entries).filter(({ kind }) => kind === "need")}
        matchingLoading={network.loading}
        onChange={(entry, candidateId, disposition) => void network.mutate({
          action: "set_lead", input: { entry: entryReference(entry), candidateId, disposition, requestId: crypto.randomUUID() },
        })}
        onRemove={({ kind, entryId }, candidateId) => void network.mutate({
          action: "set_lead", input: { entry: { kind, entryId }, candidateId, disposition: "removed", requestId: crypto.randomUUID() },
        })} />);
  if (presentation === "results") return <div className="rc-stack">
    <MatchingFeedback {...network} online={online} readOnly={readOnly} noticeRef={notice}
      first={state === null ? <CardGridSkeleton kind="partner" label="Checking partners" /> : undefined}
      onRetry={command => void network.mutate(command)} onRefresh={network.refresh} refreshBlocked={blocked} />
    {/* Only from the entries as they stand: before they load, after a failed read or for an earlier
        version, an empty list would read as having no needs or offers. */}
    {/* Nothing new is shared for matching (DL-155, step 4). A share still on can be stopped until step 5 ends them. */}
    {!network.loading && state !== null && !stale && sharedEntries(entries).length > 0 && (
      <StatusLine actions={!readOnly && (
        <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={blocked}
          onClick={() => setSharing(true)}>Stop Sharing</button>
      )}>{sharedLine(sharedEntries(entries).length, team)}</StatusLine>
    )}
    {results}
    <TaskDialog title="Stop Sharing" open={sharing} onClose={() => { setSharing(false); network.refresh(); onShared?.(); }} retainContents>
      {sharing && <SavedMatching active={active} synced={synced} compact={false} online={online} onExpired={onExpired}
        fixture={fixture} team={team} readOnly={readOnly} presentation="sharing" visible={sharing} />}
    </TaskDialog>
  </div>;
  // Beside the Certified suggestions, with nothing still shared, there is nothing to say under them.
  if (publicResults && !listing) return <>
    {results}
    <MatchingFeedback {...network} online={online} readOnly={readOnly} noticeRef={notice} onRetry={command => void network.mutate(command)} />
  </>;
  return <>
    {publicResults && results}
    <section className="rc-stack" aria-labelledby={presentation === "sharing" ? undefined : heading} aria-label={presentation === "sharing" ? "Sharing for matching" : undefined}>
      {presentation !== "sharing" && <Title id={heading} className="rc-heading" data-size="section">{team || publicResults ? "Sharing For Matching" : String(active.document.initiative.name)}</Title>}
      {import.meta.env.DEV && fixture && (
        <p className="rc-notice" data-tone="info">Local matching fixture. Changes last until the development server restarts.</p>
      )}
      {listing && <p>Weave no longer shares needs and offers with people signed in. Withdraw any listed here. One still shared stays visible to them until you do.</p>}
      {stale && (
        <p className="rc-notice" data-tone="warning" role="alert">{team ? "This workspace changed. Reload to see the latest entries. Copy any unsaved changes first."
          : "This initiative changed in your account. Load the latest saved version to continue. Loading keeps a backup on this device."}</p>
      )}
      {listing && <div className="rc-action-bar">
        <button className="rc-button" data-variant="quiet" type="button" disabled={blocked} onClick={network.refresh}>Check Again</button>
      </div>}
      <MatchingFeedback {...network} online={online} readOnly={readOnly} noticeRef={notice}
        first={state === null ? <LinesSkeleton label="Checking partners" /> : undefined} onRetry={command => void network.mutate(command)} />
      {listing && state && !stale && (stillShared.length ? (
        <fieldset className="rc-stack">
          <legend>Shared before</legend>
          <ul className="rc-ask-summary">
            {stillShared.map((entry) => {
              const shared = sharedEntries([entry]).length > 0;
              const expired = entry.sharing === "expired" || (entry.sharing === "shared" && !shared);
              return (
                <li key={entryKey(entry)}>
                  <strong>{entry.kind === "need" ? "Need" : "Offer"}, {entry.title}</strong>
                  <p className="rc-meta">
                    {entry.status === "open" ? sharingLabels[expired ? "expired" : entry.sharing] : STATUS[entry.status]}
                    {shared && entry.expiresAt && <> until <MatchingDate value={entry.expiresAt} /></>}
                  </p>
                  {!readOnly && (
                    <div className="rc-action-bar">
                      <button className="rc-button" data-variant="quiet" type="button" disabled={blocked}
                        aria-label={`Withdraw ${entry.title} from matching`}
                        onClick={() => setWithdrawal(selectionKey(entry))}>Withdraw From Matching</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {/* Asked in a dialog, so the row's buttons stay where they are. */}
          <TaskDialog title="Withdraw From Matching?" open={withdrawing !== undefined} onClose={() => setWithdrawal(null)}>
            {withdrawing && (
              <div className="rc-stack">
                <p>{withdrawing.title} leaves matching, so people signed in will not see it.</p>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="danger" type="button" disabled={blocked}
                    onClick={() => {
                      setWithdrawal(null);
                      void network.mutate({ action: "withdraw", input: { entries: [entryReference(withdrawing)], requestId: crypto.randomUUID() } });
                    }}>Withdraw From Matching</button>
                  <button className="rc-button" data-variant="quiet" type="button" data-task-focus onClick={() => setWithdrawal(null)}>Cancel</button>
                </div>
              </div>
            )}
          </TaskDialog>
        </fieldset>
      ) : <p>Nothing is shared for matching now.</p>)}
      {presentation !== "sharing" && !publicResults && results}
    </section>
  </>;
}
