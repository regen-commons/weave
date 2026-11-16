import { SignOutAction } from "./SignOutAction.tsx";
import { useEffect, useId, useState } from "react";
import { parseSummaries, type InitiativeSummary } from "@weave/api/account-contract";
import { useDraft } from "../describe/use-draft.ts";
import { newDraft } from "../describe/contracts.ts";
import { navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import type { DraftBackup } from "../describe/repository.ts";
import { accountKey, saveBlocker } from "./document.ts";
import { accountMessage, accountRequest, assertAccount, AccountFailure } from "./client.ts";
import { loadAccountCard, saveAccountCard } from "./actions.ts";
import { useAccount } from "./context.tsx";
import { continueToCertified, signInReturnMessage } from "./sign-in.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";
export function AccountSection({
  compact = false,
  autoFocus = false,
  heading = true,
  showLeave = true,
  onBeginCard,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  /** Off where a dialog's title already names the section, such as the account door. */
  heading?: boolean;
  showLeave?: boolean;
  onBeginCard?: () => void;
}) {
  const id = useId();
  const Title = compact ? "h3" : "h2";
  const { state, refresh, clear, returnResult, acknowledgeReturn, missingRecord, savedCheck } = useAccount();
  const { controller, draft, ready, storage } = useDraft();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => signInReturnMessage(returnResult));
  const [failed, setFailed] = useState(() => ["failed", "cancelled"].includes(returnResult ?? ""));
  useEffect(() => { if (returnResult) acknowledgeReturn(); }, [returnResult, acknowledgeReturn]);
  const [startingCard, setStartingCard] = useState(false);
  const owner = state?.user?.id;
  const [selection, setSelection] = useState<{ owner: string; item: InitiativeSummary } | null>(null);
  const selected = selection && selection.owner === owner ? selection.item : null;
  const [backups, setBackups] = useState<DraftBackup[]>([]);
  const [backup, setBackup] = useState<DraftBackup | null>(null);
  const [page, setPage] = useState<{ owner: string; items: InitiativeSummary[] } | null>(null);
  const extra = page && page.owner === owner ? page.items : [];
  const [more, setMore] = useState(true);
  useEffect(() => {
    setSelection(null);
    setPage(null);
    setMore(true);
    setStartingCard(false);
  }, [owner]);
  const key = accountKey(draft),
    saved = draft.account.saved;
  const currentSaved = !!state?.user && saved?.owner === state.user.id && saved.contentKey === key && savedCheck === "present";
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
    } catch (error) {
      if (error instanceof AccountFailure && error.code === "sign_in_required") clear();
      if (error instanceof AccountFailure && error.code === "account_changed") {
        try {
          await refresh();
        } catch {
          clear();
        }
        setSelection(null);
        setStartingCard(false);
        setPage(null);
      }
      setMessage(accountMessage(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void controller
      .backups()
      .then(setBackups)
      .catch(() => {});
  }, [controller]);
  async function save() {
    const user = state?.user;
    if (!user) throw new Error("Sign in before saving.");
    const contentKey = await saveAccountCard(controller, user.id, refresh);
    setPage(null);
    setMore(true);
    setMessage(
      accountKey(controller.getSnapshot().draft) === contentKey
        ? "Saved privately in Weave. Review any entries you want to share in Partners."
        : "The earlier checked card was saved. Your latest changes are still on this device; save again when ready.",
    );
  }
  async function beginCard() {
    await controller.replace(newDraft());
    setStartingCard(false);
    onBeginCard?.();
    navigate(pathTo("initiative"));
  }
  async function load() {
    if (!selected || !state?.user) return;
    setBackups(await loadAccountCard(controller, state.user.id, selected.id));
    setSelection(null);
    setMessage("Your saved card is loaded. The previous device draft is kept in Device backups in Settings.");
  }
  return (
    <section className="rc-stack" aria-labelledby={heading ? `${id}-title` : undefined} aria-busy={busy}>
      {heading && (
        <Title className="rc-heading" data-size="section" id={`${id}-title`}>
          {compact ? "Save your initiative" : "Your account"}
        </Title>
      )}
      {missingRecord && <p role="status">This card is no longer saved in your account. Your device copy is still here. You can save it again.</p>}
      {!state ? (
        <>
          <p>Account access could not be checked yet.</p>
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
              })
            }
          >
            Check account access
          </button>
        </>
      ) : !state.available ? (
        <p>Account saving is not available yet. Your draft stays on this device.</p>
      ) : !state.user ? (
        <>
          <p>
            Sign in with Certified to save your work and open it on another device. Your saved work stays
            private in Weave.
          </p>
          <details>
            <summary className="rc-footer-link">What is saved</summary>
            <p>
              Saving keeps your checked card, needs, offers and kept funding details. Conversations, files,
              unfinished edits and assistant records stay on this device.
            </p>
            <p>
              Signing in does not save, load or share anything. New to Certified? You can join there and come
              straight back.
            </p>
          </details>
          <AboutCertified />
          <form className="rc-stack" method="post" onSubmit={(event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get("email")?.toString().trim();
            void run(() => continueToCertified(controller, window.location.pathname,
              (returnTo) => accountRequest("", { returnTo, ...(email ? { email, emailRedirectConsent: true } : {}) }, "/api/sign-in"),
              (target) => window.location.assign(target)));
          }}>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="submit" disabled={busy || !ready}
                data-task-focus={autoFocus || undefined}>
                Sign in with Certified
              </button>
            </div>
            {state.emailHintAvailable && (
              <details>
                <summary className="rc-footer-link">Add your email (optional)</summary>
                <div className="rc-field">
                  <label htmlFor={`${id}-email`}>Email for Certified</label>
                  <p id={`${id}-email-help`} className="rc-hint">
                    Your email appears in the link to Certified and may be saved in browser history or request logs.
                  </p>
                  <input className="rc-input" id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254}
                    aria-describedby={`${id}-email-help`} disabled={busy || !ready} />
                </div>
              </details>
            )}
          </form>
        </>
      ) : (
        <>
          <p>Signed in with Certified.</p>
          <details>
            <summary className="rc-footer-link">About saving and this session</summary>
            <p>
              Save keeps a private copy of your checked card, needs, offers and kept funding details. Files and
              conversations stay on this device.
            </p>
            <p>
              This session lasts up to one hour. Sign in again when it ends. Signing out leaves the device
              draft and its backups in this browser; clear this site’s browser storage when leaving a shared
              device.
            </p>
            <p>Sharing is separate. Choose what to share from your initiative's page.</p>
          </details>
          {!key && (
            <p>
              {saveBlocker(draft) ??
                "Check your initiative, needs and offers, and keep or cancel open funding changes before saving."}
            </p>
          )}
          <div className="rc-action-bar">
            {/* Once the card is saved there is nothing to press: the header and the list say so. */}
            {!currentSaved && (
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                disabled={busy || !ready || !key || storage !== "saved"}
                onClick={() => void run(save)}
              >
                Save privately
              </button>
            )}
            {showLeave && (
              <SignOutAction
                disabled={busy}
                onBusyChange={setBusy}
                onResult={(text, failed) => {
                  setMessage(text);
                  setFailed(failed);
                  if (!failed) {
                    setSelection(null);
                    setStartingCard(false);
                    setPage(null);
                  }
                }}
              />
            )}
          </div>
          <h3 className="rc-heading" data-size="section">
            In Weave
          </h3>
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="quiet" type="button" disabled={busy || !ready}
              onClick={() => {
                setSelection(null);
                setBackup(null);
                setStartingCard(true);
              }}>
              Start a new initiative
            </button>
          </div>
          {startingCard && (
            <section className="rc-notice" data-tone="info" aria-label="Confirm starting a new card">
              <div className="rc-notice-body">
                <p>Weave will keep a device backup of this draft, including its conversations and files, before opening a new card.</p>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="primary" type="button" disabled={busy}
                    onClick={() => void run(beginCard)}>Back up and start new</button>
                  <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
                    onClick={() => setStartingCard(false)}>Cancel</button>
                </div>
              </div>
            </section>
          )}
          {!state.items.length && !extra.length ? (
            <p>No cards saved in this account yet.</p>
          ) : (
            <ul className="rc-stack">
              {[...state.items, ...extra].map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{item.name}</strong>
                    <br />
                    <span className="rc-meta">Saved {new Date(item.updatedAt).toLocaleString()}</span>
                  </p>
                  <button
                    className="rc-button"
                    data-variant="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelection({ owner: state.user!.id, item });
                      setBackup(null);
                      setStartingCard(false);
                    }}
                  >
                    Load {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {more && (extra.length ? extra.length % 20 === 0 : state.items.length === 20) && (
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await accountRequest(`?offset=${state.items.length + extra.length}`);
                  assertAccount(result, state.user!.id);
                  const items = parseSummaries(result.items), owner = state.user!.id;
                  setPage((current) => {
                    const previous = current?.owner === owner ? current.items : [];
                    return { owner, items: [...previous,
                      ...items.filter((item) => ![...state.items, ...previous].some((old) => old.id === item.id))] };
                  });
                  setMore(items.length === 20);
                })
              }
            >
              More saved cards
            </button>
          )}
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await refresh();
                setPage(null);
                setMore(true);
                setMessage("Saved cards refreshed.");
              })
            }
          >
            Refresh saved cards
          </button>
        </>
      )}
      {selected && (
        <section className="rc-notice" data-tone="warning" aria-label="Confirm loading">
          <div className="rc-notice-body">
            <p>
              Load {selected.name}? The current device draft, including its conversations and files, will be
              backed up in this browser first. Loading stops if that backup cannot be stored.
            </p>
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                disabled={busy}
                onClick={() => void run(load)}
              >
                Back up this draft and load
              </button>
              <button
                className="rc-button"
                data-variant="quiet"
                type="button"
                disabled={busy}
                onClick={() => setSelection(null)}
              >
                Cancel loading
              </button>
            </div>
          </div>
        </section>
      )}
      {!compact && backups.length > 0 && (
        <section className="rc-stack" aria-labelledby={`${id}-backups`}>
          <h3 className="rc-heading" data-size="section" id={`${id}-backups`}>
            Device backups
          </h3>
          <p>
            These drafts and their files are kept only in this browser. Restoring one backs up the current
            draft first.
          </p>
          <ul className="rc-stack">
            {backups.map((item) => (
              <li key={item.key}>
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBackup(item);
                    setSelection(null);
                    setStartingCard(false);
                  }}
                >
                  Restore {item.draft.confirmed?.name || item.draft.proposal?.name || "untitled draft"},{" "}
                  {new Date(item.draft.updatedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
          {backup && (
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await controller.replace(backup.draft);
                    setBackups(await controller.backups());
                    setBackup(null);
                    setMessage("Device backup restored. The previous draft was backed up first.");
                  })
                }
              >
                Back up this draft and restore
              </button>
              <button
                className="rc-button"
                data-variant="quiet"
                type="button"
                disabled={busy}
                onClick={() => setBackup(null)}
              >
                Cancel restoring
              </button>
            </div>
          )}
        </section>
      )}
      {compact && (
        <p>
          <a href="/settings">Saved cards and device backups</a>
        </p>
      )}
      {busy && <p role="status">Connecting to your account</p>}
      {message && (message !== signInReturnMessage("signed-in") || state?.user) && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
