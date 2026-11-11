import { SignOutAction } from "./SignOutAction.tsx";
import { useEffect, useId, useState } from "react";
import { parseSummaries, type InitiativeSummary } from "@weave/api/account-contract";
import { useDraft } from "../describe/use-draft.ts";
import { newDraft, revise } from "../describe/contracts.ts";
import { navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import type { DraftBackup } from "../describe/repository.ts";
import { accountKey, loadedDraft, saveBlocker, saveCommand } from "./document.ts";
import { accountMessage, accountRequest, parseSaved, assertAccount, AccountFailure } from "./client.ts";
import { useAccount } from "./context.tsx";
import { continueToCertified, signInReturnMessage } from "./sign-in.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";
export function AccountSection({
  compact = false,
  autoFocus = false,
  showLeave = true,
  onBeginCard,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  showLeave?: boolean;
  onBeginCard?: () => void;
}) {
  const id = useId();
  const Title = compact ? "h3" : "h2";
  const { state, refresh, clear, returnResult, acknowledgeReturn } = useAccount();
  const { controller, draft, ready, storage } = useDraft();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => signInReturnMessage(returnResult));
  const [failed, setFailed] = useState(() => ["failed", "cancelled"].includes(returnResult ?? ""));
  useEffect(() => { if (returnResult) acknowledgeReturn(); }, [returnResult, acknowledgeReturn]);
  const [startingCard, setStartingCard] = useState(false);
  const [selected, setSelected] = useState<InitiativeSummary | null>(null);
  const [backups, setBackups] = useState<DraftBackup[]>([]);
  const [backup, setBackup] = useState<DraftBackup | null>(null);
  const [extra, setExtra] = useState<InitiativeSummary[]>([]);
  const [more, setMore] = useState(true);
  const key = accountKey(draft),
    saved = draft.account.saved;
  const currentSaved = !!state?.user && saved?.owner === state.user.id && saved.contentKey === key;
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
        setSelected(null);
        setStartingCard(false);
        setExtra([]);
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
    const { binding, command } = saveCommand(controller.getSnapshot().draft, user.id);
    controller.change((current) => revise(current, { account: { ...current.account, pending: binding } }));
    await controller.settled();
    if (controller.getSnapshot().storage !== "saved")
      throw new Error(
        "Your save request could not be kept safely on this device. Copy your words and try device storage again first.",
      );
    const receipt = parseSaved((await accountRequest("", { action: "save", ...command })).saved);
    if (receipt.id !== command.id || JSON.stringify(receipt.document) !== binding.contentKey)
      throw new AccountFailure("account_unavailable");
    controller.change((current) =>
      revise(current, {
        account: {
          saved: {
            id: receipt.id,
            owner: user.id,
            revision: receipt.revision,
            contentKey: binding.contentKey,
          },
          pending: null,
        },
      }),
    );
    await refresh();
    setExtra([]);
    setMore(true);
    setMessage(
      accountKey(controller.getSnapshot().draft) === binding.contentKey
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
    const user = state.user;
    const result = await accountRequest(`?id=${encodeURIComponent(selected.id)}`);
    assertAccount(result, user.id);
    const saved = parseSaved(result.saved);
    await controller.replace(loadedDraft(saved, user.id));
    setBackups(await controller.backups());
    setSelected(null);
    setMessage("Your saved card is loaded. The previous device draft is kept in Device backups in Settings.");
  }
  return (
    <section className="rc-stack" aria-labelledby={`${id}-title`} aria-busy={busy}>
      <Title className="rc-heading" data-size="section" id={`${id}-title`}>
        {compact ? "Save your initiative" : "Your account"}
      </Title>
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
          <p>
            Save keeps a private copy of your checked card, needs, offers and kept funding details. Files and
            conversations stay on this device.
          </p>
          <details>
            <summary className="rc-footer-link">About this session</summary>
            <p>
              This session lasts up to one hour. Sign in again when it ends. Signing out leaves the device
              draft and its backups in this browser; clear this site’s browser storage when leaving a shared
              device.
            </p>
            <p>Sharing is separate. Use Partners to review and share selected needs or offers.</p>
          </details>
          {!key && (
            <p>
              {saveBlocker(draft) ??
                "Check your initiative, needs and offers, and keep or cancel open funding changes before saving."}
            </p>
          )}
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              disabled={busy || !ready || !key || storage !== "saved" || currentSaved}
              onClick={() => void run(save)}
            >
              {currentSaved ? "Saved privately" : "Save privately"}
            </button>
            {showLeave && (
              <SignOutAction
                disabled={busy}
                onBusyChange={setBusy}
                onResult={(text, failed) => {
                  setMessage(text);
                  setFailed(failed);
                  if (!failed) {
                    setSelected(null);
                    setStartingCard(false);
                    setExtra([]);
                  }
                }}
              />
            )}
          </div>
          <h3 className="rc-heading" data-size="section">
            Your saved cards
          </h3>
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="secondary" type="button" disabled={busy || !ready}
              onClick={() => {
                setSelected(null);
                setBackup(null);
                setStartingCard(true);
              }}>
              Start a new card
            </button>
          </div>
          {startingCard && (
            <section className="rc-notice" data-tone="info" aria-label="Confirm starting a new card">
              <div className="rc-notice-body">
                <p>Weave will keep a device backup of this draft, including its conversations and files, before opening a new card.</p>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="primary" type="button" disabled={busy}
                    onClick={() => void run(beginCard)}>Back up and start a card</button>
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
                      setSelected(item);
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
                  const page = parseSummaries(result.items);
                  setExtra((current) => [
                    ...current,
                    ...page.filter((item) => ![...state.items, ...current].some((old) => old.id === item.id)),
                  ]);
                  setMore(page.length === 20);
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
                setExtra([]);
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
                onClick={() => setSelected(null)}
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
                    setSelected(null);
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
