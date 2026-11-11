import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAccount } from "../account/context.tsx";
import { activeInitiative, type ActiveInitiative } from "../account/active-initiative.ts";
import { SaveAction } from "../account/door.tsx";
import { accountKey } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { STATUS } from "../intake/contracts.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { NetworkResults } from "./NetworkResults.tsx";
import { CertifiedSuggestions } from "./CertifiedSuggestions.tsx";
import { privatePartnerQueries } from "./certified-suggestions.ts";
import { MatchingDate, SharingReview } from "./SharingReview.tsx";
import { entryKey, entryReference, type MatchingEntry } from "./matching-client.ts";
import { sharedEntries, useNetworkMatching } from "./use-network-matching.ts";

const sharingLabels: Record<MatchingEntry["sharing"], string> = {
  private: "Not shared",
  shared: "Shared for matching",
  needs_review: "Changed since you shared. Review it again",
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

export function PartnerExperience({ mode }: { mode: "matches" | "preview" }) {
  const { state, clear } = useAccount();
  const { draft, ready } = useDraft();
  const [expired, setExpired] = useState(false);
  const owner = state?.user?.id;
  const saved = draft.account.saved;
  const active = useMemo(() => activeInitiative(saved, owner), [saved, owner]);
  const queries = useMemo(() => active ? privatePartnerQueries(active.id, active.revision,
    draft.needs.items.filter(({ decision }) => decision === "kept"),
    draft.offers.items.filter(({ decision }) => decision === "kept"),
  ) : [], [active, draft.needs.items, draft.offers.items]);
  const compact = mode === "preview";
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const onExpired = () => {
    setExpired(true);
    clear();
  };

  return (
    <div className="rc-stack">
      {active && ready && <CertifiedSuggestions key={`${active.owner}/${active.id}`}
        workspaceId={active.id} queries={queries} compact={compact} online={online} />}
      {active && ready ? (
        <SavedMatching key={`${active.owner}/${active.id}/${active.revision}`}
          active={active} synced={active.contentKey === accountKey(draft)}
          compact={compact} online={online} onExpired={onExpired} fixture={state?.fixture === true} />
      ) : (
        // With no card yet there is nothing to save: the list below asks for the card first.
        ready && (!!draft.confirmed || (expired && !owner)) && (
          <div className="rc-stack">
            {expired && !owner ? (
              <p className="rc-notice" data-tone="warning" role="alert">Your session ended. Sign in again to continue matching.</p>
            ) : (
              <p>Link a Certified project to get partner suggestions for your private needs and offers.</p>
            )}
            {!compact && <div className="rc-action-bar"><SaveAction variant="secondary">Save your initiative</SaveAction></div>}
          </div>
        )
      )}
      {compact && active && (
        <div className="rc-action-bar"><ButtonLink href={pathTo("partners")} variant="secondary">See all partners</ButtonLink></div>
      )}
    </div>
  );
}

export function SavedMatching({ active, synced, compact, online, onExpired, fixture, readOnly = false, team = false }: {
  active: ActiveInitiative;
  synced: boolean;
  compact: boolean;
  online: boolean;
  onExpired(): void;
  fixture: boolean;
  readOnly?: boolean;
  team?: boolean;
}) {
  const heading = useId();
  const network = useNetworkMatching(active, onExpired);
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    notice.current?.focus();
  }, [network.notice]);
  const [selected, setSelected] = useState<string[]>([]);
  const [withdrawal, setWithdrawal] = useState<string | null>(null);
  const Title = compact ? "h3" : "h2";
  const state = network.state;
  const stale = state !== null && state.initiativeRevision !== active.revision;
  const blocked = network.loading || network.busy || !!network.pending || !online;
  const entries = stale ? [] : (state?.entries ?? []).flatMap((entry) => {
    const item = active.document[entry.kind === "need" ? "needs" : "offers"].find(({ id }) => id === entry.entryId);
    return typeof item?.value.title === "string" ? [{ ...entry, title: item.value.title, classified: Array.isArray(item.value.capitalForms) && item.value.capitalForms.length > 0 }] : [];
  });
  const eligible = entries.filter((entry) =>
    !readOnly && entry.classified && entry.status === "open" && ["private", "needs_review", "withdrawn"].includes(entry.sharing));
  const selection = eligible.filter((entry) => selected.includes(selectionKey(entry)));
  const reviewing = synced && !stale && network.preview && (
    !network.pending || network.pending.action === network.preview.action
  ) ? network.preview : null;

  function toggle(entry: MatchingEntry, checked: boolean) {
    const key = selectionKey(entry);
    setSelected((current) => checked ? [...current, key] : current.filter((value) => value !== key));
  }

  return (
    <section className="rc-stack" aria-labelledby={heading}>
      <Title id={heading} className="rc-heading" data-size="section">{team ? "Shared matching" : String(active.document.initiative.name)}</Title>
      {import.meta.env.DEV && fixture && (
        <p className="rc-notice" data-tone="info">Local matching fixture. Changes last until the development server restarts.</p>
      )}
      <p>You choose which needs and offers people signed in can see.</p>
      {!synced && !team && (
        <p className="rc-notice" data-tone="info">Changed on this device since you saved. Save again before you change what you share.</p>
      )}
      {stale && (
        <p className="rc-notice" data-tone="warning" role="alert">{team ? "This workspace changed. Reload to see the latest entries. Copy any unsaved changes first."
          : "This initiative changed in your account. Load the latest saved version to continue. Loading keeps a backup on this device."}</p>
      )}
      <div className="rc-action-bar">
        {!compact && !team && <SaveAction variant="secondary">Save or switch cards</SaveAction>}
        <button className="rc-button" data-variant="quiet" type="button" disabled={blocked} onClick={network.refresh}>Check again</button>
      </div>
      {(network.loading || network.busy) && <p role="status">{network.loading ? "Checking partners" : "Updating"}</p>}
      {network.error && !reviewing && <p className="rc-notice" data-tone="warning" role="alert">{network.error}</p>}
      {network.notice && <p className="rc-meta" role="status" tabIndex={-1} ref={notice}>{network.notice}</p>}
      {network.pending && !reviewing && (
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="secondary" type="button" disabled={network.busy || !online}
            onClick={() => void network.mutate(network.pending!)}>Try again</button>
        </div>
      )}
      {state && !stale && (
        <>
          {entries.length ? (
            <fieldset className="rc-stack">
              <legend>{readOnly ? "Sharing status" : "Choose what to share"}</legend>
              <ul className="rc-ask-summary">
                {entries.map((entry) => {
                  const selectable = eligible.includes(entry);
                  const shared = sharedEntries([entry]).length > 0;
                  const expired = entry.sharing === "expired" || (entry.sharing === "shared" && !shared);
                  const renewable = !readOnly && entry.classified && entry.status === "open" && (shared || expired);
                  const withdrawable = !readOnly && (shared || expired || entry.sharing === "needs_review");
                  return (
                    <li key={entryKey(entry)}>
                      {selectable ? (
                        <label>
                          <input className="rc-check" type="checkbox" checked={selected.includes(selectionKey(entry))} disabled={blocked || !synced}
                            onChange={(event) => toggle(entry, event.target.checked)} />
                          <span> {entry.kind === "need" ? "Need" : "Offer"}, {entry.title}</span>
                        </label>
                      ) : <strong>{entry.kind === "need" ? "Need" : "Offer"}, {entry.title}</strong>}
                      <p className="rc-meta">
                        {entry.status === "open" ? sharingLabels[expired ? "expired" : entry.sharing] : STATUS[entry.status]}
                        {!entry.classified && entry.status === "open" && ". Choose a kind of support before sharing."}
                        {shared && entry.expiresAt && <> until <MatchingDate value={entry.expiresAt} /></>}
                      </p>
                      {(renewable || withdrawable) && (
                        <div className="rc-action-bar">
                          {renewable && (
                            <button className="rc-button" data-variant="secondary" type="button" disabled={blocked || !synced}
                              aria-label={`Renew sharing for ${entry.title}`}
                              onClick={() => void network.review([entryReference(entry)], "renew")}>Renew sharing</button>
                          )}
                          {withdrawable && withdrawal === selectionKey(entry) ? (
                            <>
                              <button className="rc-button" data-variant="danger" type="button" disabled={blocked} autoFocus
                                onClick={() => {
                                  setWithdrawal(null);
                                  void network.mutate({ action: "withdraw", input: { entries: [entryReference(entry)], requestId: crypto.randomUUID() } });
                                }}>Confirm withdrawal</button>
                              <button className="rc-button" data-variant="quiet" type="button" onClick={() => setWithdrawal(null)}>Cancel</button>
                            </>
                          ) : withdrawable && (
                            <button className="rc-button" data-variant="quiet" type="button" disabled={blocked}
                              aria-label={`Withdraw ${entry.title} from matching`}
                              onClick={() => setWithdrawal(selectionKey(entry))}>Withdraw from matching</button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!!eligible.length && (
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="primary" type="button" disabled={blocked || !synced || !selection.length}
                    onClick={() => void network.review(selection.map(entryReference), "share")}>Review what you’ll share</button>
                </div>
              )}
            </fieldset>
          ) : <p>Save an open need or offer to find partners.</p>}
          {!network.loading && !sharedEntries(entries).length && !!entries.length && <p>To search what other teams have shared, share at least one open need or offer.</p>}
        </>
      )}
      {!readOnly && reviewing && (
        <SharingReview review={reviewing.review} action={reviewing.action} busy={network.busy || !online}
          retry={!!network.pending} error={online ? network.error : "You’re offline. Reconnect to confirm sharing."} onClose={network.cancelReview}
          onConfirm={() => {
            void network.mutate(network.pending ?? {
              action: reviewing.action, input: { reviewId: reviewing.review.reviewId, requestId: crypto.randomUUID() },
            });
          }} />
      )}
      <NetworkResults search={online ? network.search : null} leads={online ? network.leads : null} entries={entries}
        compact={compact} blocked={blocked} readOnly={readOnly}
        onChange={(entry, candidateId, disposition) => void network.mutate({
          action: "set_lead", input: { entry: entryReference(entry), candidateId, disposition, requestId: crypto.randomUUID() },
        })}
        onRemove={({ kind, entryId }, candidateId) => void network.mutate({
          action: "set_lead", input: { entry: { kind, entryId }, candidateId, disposition: "removed", requestId: crypto.randomUUID() },
        })} />
    </section>
  );
}
