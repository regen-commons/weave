import { SignOutAction } from "./SignOutAction.tsx";
import { useEffect, useId, useState } from "react";
import { parseSummaries, type InitiativeSummary } from "@weave/api/account-contract";
import { useSetAside } from "./set-aside.ts";
import { useDraft } from "../describe/use-draft.ts";
import { Link, navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { accountKey, saveBlocker } from "./document.ts";
import { accountMessage, accountRequest, assertAccount, AccountFailure } from "./client.ts";
import { loadAccountCard, saveAccountCard } from "./actions.ts";
import { useAccount } from "./context.tsx";
import { continueToCertified, signInReturnFailed, signInReturnMessage } from "./sign-in.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";
import { DeviceBackups } from "../data/DeviceBackups.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { SIGN_IN } from "../data/privacy.ts";
export function AccountSection({
  compact = false,
  autoFocus = false,
  heading = true,
  showLeave = true,
  showBackups = true,
  notice = "",
  onBeginCard,
  onNotNow,
  onSignInStart,
}: {
  compact?: boolean;
  autoFocus?: boolean;
  /** Off where a dialog's title already names the section, such as the account door. */
  heading?: boolean;
  showLeave?: boolean;
  /** Off where the page shows this device's backups in their own place, as Settings does. */
  showBackups?: boolean;
  /** A sign-in failure from the button that led here, shown as this section's first message. */
  notice?: string;
  onBeginCard?: () => void;
  /** The way out of the sign-in offer, where it is asked in a dialog. */
  onNotNow?: () => void;
  /** Told as the person leaves for Certified from here, so the place they left can be reopened. */
  onSignInStart?: () => void;
}) {
  const id = useId();
  const Title = compact ? "h3" : "h2";
  const { state, refresh, clear, returnResult, acknowledgeReturn, missingRecord, savedCheck } = useAccount();
  const { controller, draft, ready, storage } = useDraft();
  const setAside = useSetAside();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => notice || signInReturnMessage(returnResult));
  const [failed, setFailed] = useState(() => !!notice || signInReturnFailed(returnResult));
  useEffect(() => { if (returnResult) acknowledgeReturn(); }, [returnResult, acknowledgeReturn]);
  const owner = state?.user?.id;
  const [selection, setSelection] = useState<{ owner: string; item: InitiativeSummary } | null>(null);
  const selected = selection && selection.owner === owner ? selection.item : null;
  const [page, setPage] = useState<{ owner: string; items: InitiativeSummary[] } | null>(null);
  const extra = page && page.owner === owner ? page.items : [];
  const [more, setMore] = useState(true);
  useEffect(() => {
    setSelection(null);
    setPage(null);
    setMore(true);
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
        setPage(null);
      }
      setMessage(accountMessage(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
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
  /** A new initiative is a draft of its own, so nothing is asked and nothing is backed up (DL-112). */
  async function beginCard() {
    await controller.startNew();
    onBeginCard?.();
    navigate(pathTo("initiative"));
  }
  async function load() {
    if (!selected || !state?.user) return;
    await loadAccountCard(controller, state.user.id, selected.id);
    setSelection(null);
    setMessage("Your saved card is loaded. Your other drafts on this device are as you left them.");
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
            {SIGN_IN.offer}
          </p>
          <form className="rc-stack" method="post" onSubmit={(event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get("email")?.toString().trim();
            onSignInStart?.();
            void run(() => continueToCertified(controller, window.location.pathname,
              (returnTo) => accountRequest("", { returnTo, ...(email ? { email, emailRedirectConsent: true } : {}) }, "/api/sign-in"),
              (target) => window.location.assign(target)));
          }}>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="submit" disabled={busy || !ready}
                data-task-focus={autoFocus || undefined}>
                Sign in with Certified
              </button>
              {onNotNow && (
                <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={onNotNow}>
                  Not now
                </button>
              )}
            </div>
            <p className="rc-meta">
              {SIGN_IN.effect}
            </p>
            <div className="rc-action-bar">
              <AboutCertified />
            </div>
            <details>
              <summary className="rc-footer-link">What is saved</summary>
              <p>
                {SIGN_IN.saved}
              </p>
            </details>
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
              {SIGN_IN.saved}
            </p>
            <p>
              {SIGN_IN.session} Signing out leaves the device
              draft and its backups in this browser; clear this site’s browser storage when leaving a shared
              device.
            </p>
            <p>Sharing is separate. Choose what to share from your initiative's page.</p>
          </details>
          {setAside && <p>A card from another account is on this device. It opens again when that account signs in.</p>}
          {!key && !setAside && (
            <p>
              {saveBlocker(draft) ??
                "Check your initiative, needs and offers, and keep or cancel open funding changes before saving."}
            </p>
          )}
          <div className="rc-action-bar">
            {/* Once the card is saved there is nothing to press: the header and the list say so. */}
            {/* Another account's card is set aside here as on its own pages: this account cannot save it (DL-055). */}
            {!currentSaved && !setAside && (
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
                void run(beginCard);
              }}>
              Start A New Initiative
            </button>
          </div>
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
      {/* Asked in a dialog, so the list it was asked from stays where it is. */}
      <TaskDialog title="Load This Saved Card?" open={!!selected} onClose={() => setSelection(null)} blockClose={busy}>
        <div className="rc-stack">
          <p>
            {selected
              ? `${selected.name} opens on this device. A copy of this card already on this device is backed up first, and your other drafts are not changed.`
              : ""}
          </p>
          {failed && message && <p className="rc-notice" data-tone="warning" role="alert">{message}</p>}
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="button" disabled={busy} data-task-focus
              onClick={() => void run(load)}>
              Load Saved Card
            </button>
            <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
              onClick={() => setSelection(null)}>
              Cancel
            </button>
          </div>
        </div>
      </TaskDialog>
      {!compact && showBackups && <DeviceBackups disabled={busy} />}
      {compact && (
        <p>
          <Link href={pathTo("settings")}>Saved cards and device backups</Link>
        </p>
      )}
      {/* Said, not drawn: the pressed button shows it is busy, and a new line would push the page down. */}
      {busy && <p className="rc-visually-hidden" role="status">Connecting to your account</p>}
      {message && !selected && (message !== signInReturnMessage("signed-in") || state?.user) && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
