import { useEffect, useRef, useState } from "react";
import type { SavedInitiative } from "@weave/api/account-contract";
import { useAccount } from "../account/context.tsx";
import { Facts } from "../ui/Facts.tsx";
import { publicListingPage, publicListingReview, publicPublicationFeedback, publicReviewFacts, publicSupportStatuses as statuses,
  type PublicListing, type PublicReview } from "./public-support-state.ts";
import { AccountFailure } from "../account/client.ts";
import { ConsentButton } from "../initiative/ProjectConsent.tsx";
import { projectRequest } from "../initiative/projects-client.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { matchingRequest } from "./matching-client.ts";

/** Public publication is independent of the Weave share. Only reviewed fields reach AT Protocol. */
export function PublicSupport({ workspaceId, saved, readOnly, expanded = false, visible = true }: {
  workspaceId: string; saved: SavedInitiative; readOnly: boolean; expanded?: boolean; visible?: boolean;
}) {
  const { state } = useAccount();
  return state?.user ? <AccountPublicSupport key={`${state.user.id}/${workspaceId}`} workspaceId={workspaceId} saved={saved} readOnly={readOnly} expanded={expanded} visible={visible} /> : null;
}
function AccountPublicSupport({ workspaceId, saved, readOnly, expanded, visible }: { workspaceId: string; saved: SavedInitiative; readOnly: boolean; expanded: boolean; visible: boolean }) {
  const [listings, setListings] = useState<PublicListing[]>([]), [review, setReview] = useState<PublicReview | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [consent, setConsent] = useState<"publish-support" | "withdraw-support" | null>(null);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const task = useRef<AbortController | null>(null);
  const initialLoad = useRef<AbortController | null>(null);
  useEffect(() => {
    task.current?.abort(); task.current = null;
    setBusy(true); setReview(null); setPending(null); setConsent(null); setListings([]); setCursor(null); setNotice("");
    const controller = new AbortController(); initialLoad.current = controller;
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted) setNotice("Public listing status could not be checked.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); task.current?.abort(); };
  }, [workspaceId, saved.revision, readOnly]);
  async function load(signal: AbortSignal, after?: string) {
    const result = await projectRequest({ action: "support_state", workspaceId, ...(after ? { cursor: after } : {}) }, signal);
    signal.throwIfAborted();
    const page = publicListingPage(result, workspaceId);
    setListings(previous => after ? [...new Map([...previous, ...page.listings].map(row => [`${row.kind}/${row.entryId}`, row])).values()] : page.listings);
    setCursor(page.nextCursor);
  }
  async function run(command: Record<string, unknown>, write = false) {
    if (busy || readOnly || (task.current && !task.current.signal.aborted)) return;
    initialLoad.current?.abort();
    const controller = new AbortController(); task.current = controller;
    setBusy(true); setNotice(""); setConsent(null);
    if (write) setPending(command);
    try {
      const result = await projectRequest(command, controller.signal);
      controller.signal.throwIfAborted();
      setPending(null); setReview(null);
      await load(controller.signal);
      controller.signal.throwIfAborted();
      const feedback = publicPublicationFeedback(result.status, result.problem);
      setConsent(feedback.consent); setNotice(feedback.notice);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AccountFailure && ["support_conflict", "invalid_support_command"].includes(cause.code)) {
        setPending(null); setReview(null);
        await load(controller.signal).catch(() => undefined);
        if (!controller.signal.aborted) setNotice("The entry changed. Review the current fields before publishing.");
        return;
      }
      if (cause instanceof AccountFailure && cause.code === "project_consent_required")
        setConsent(command.action === "support_withdraw" || (command.action === "support_reconcile" &&
          listings.some(listing => listing.kind === command.kind && listing.entryId === command.entryId && listing.status === "withdrawal_pending"))
          ? "withdraw-support" : "publish-support");
      setNotice(cause instanceof AccountFailure && cause.code === "support_group_lifecycle_unverified"
        ? "Public publishing for groups is paused until safe withdrawal is verified. Your Weave entries are unchanged."
        : "The public request could not be confirmed. Your private entries are still saved.");
    } finally {
      if (task.current === controller) { task.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  async function prepare(kind: "need" | "offer", entryId: string) {
    if (busy || readOnly || (task.current && !task.current.signal.aborted)) return;
    initialLoad.current?.abort();
    const controller = new AbortController(); task.current = controller;
    setBusy(true); setNotice("");
    try {
      const matching = await matchingRequest(workspaceId, "state", {}, controller.signal);
      controller.signal.throwIfAborted();
      const entry = matching.entries.find((e) => e.kind === kind && e.entryId === entryId);
      if (!entry || matching.initiativeRevision !== saved.revision) throw Error();
      const result = await projectRequest({ action: "support_review", workspaceId, kind, entryId,
        expectedRevision: saved.revision, expectedEntryRevision: entry.revision, expiresAt: null }, controller.signal);
      controller.signal.throwIfAborted();
      const checked = publicListingReview(result, saved.revision, entry.revision);
      if (checked.record.kind !== kind) throw Error();
      setReview(checked);
    } catch { if (!controller.signal.aborted) setNotice("The entry changed or could not be reviewed. Reload before publishing."); }
    finally {
      if (task.current === controller) { task.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  const entries = (["need", "offer"] as const).flatMap((kind) => saved.document[kind === "need" ? "needs" : "offers"]
    .filter((entry) => entry.value.status === "open" && Array.isArray(entry.value.capitalForms) && entry.value.capitalForms.length > 0)
    .map((entry) => ({ kind, entryId: entry.id, title: String(entry.value.title) })));
  const Container = expanded ? "div" : "details";
  return <Container className="rc-stack" aria-busy={busy}>{!expanded && <summary>Public support listings</summary>}
    <p>Public listings can be read outside Weave. Publishing is separate from sharing for matching.</p>
    <ul className="rc-ask-summary">{entries.map((e) => <li key={`${e.kind}/${e.entryId}`}><strong>{e.title}</strong>
      {!readOnly && <button className="rc-button" data-variant="quiet" type="button" disabled={busy || pending !== null}
        onClick={() => void prepare(e.kind, e.entryId)}>Review public listing</button>}</li>)}</ul>
    {listings.length > 0 && <ul className="rc-ask-summary">{listings.map((l) => <li key={`${l.kind}/${l.entryId}`}><strong>{l.title}</strong>
      <p>{statuses[l.status]}</p>{!readOnly && <div className="rc-action-bar">
        <button className="rc-button" data-variant="quiet" type="button" disabled={busy || pending !== null}
          onClick={() => void run({ action: "support_reconcile", workspaceId, kind: l.kind, entryId: l.entryId })}>Check public status</button>
        {l.status !== "withdrawn" && <button className="rc-button" data-variant="secondary" type="button" disabled={busy || pending !== null}
          onClick={() => void run({ action: "support_withdraw", workspaceId, kind: l.kind, entryId: l.entryId, requestId: crypto.randomUUID() }, true)}>Withdraw public listing</button>}
      </div>}</li>)}</ul>}
    {cursor && <button className="rc-button" data-variant="quiet" disabled={busy}
      onClick={() => {
        if (task.current || !cursor) return;
        initialLoad.current?.abort();
        const controller = new AbortController(); task.current = controller; setBusy(true);
        void load(controller.signal, cursor).catch(() => {
          if (!controller.signal.aborted) setNotice("More public listing history could not be checked.");
        }).finally(() => {
          if (task.current === controller) { task.current = null; if (!controller.signal.aborted) setBusy(false); }
        });
      }}>More public listings</button>}
    {pending && !readOnly && <button className="rc-button" data-variant="secondary" disabled={busy}
      onClick={() => void run(pending, true)}>Retry the same public request</button>}
    {consent && !readOnly && <ConsentButton action={consent} />}{notice && <p role="status">{notice}</p>}
    <TaskDialog title="Review public listing" open={visible && review !== null && !readOnly}
      onClose={() => { if (visible) setReview(null); }}>
      {review && <div className="rc-stack"><p>Anyone can read these fields. Removing the listing cannot erase copies other apps have already made.</p>
        <Facts items={publicReviewFacts(review)} />
        <p className="rc-meta">Repository: {review.destination}</p>
        <button className="rc-button" data-variant="primary" disabled={busy || readOnly} type="button"
          onClick={() => void run(pending ?? { action: "support_publish", workspaceId, reviewId: review.reviewId,
            requestId: crypto.randomUUID(), audience: "public-atproto", confirmPublic: true }, true)}>Publish these fields publicly</button>
      </div>}
    </TaskDialog>
  </Container>;
}
