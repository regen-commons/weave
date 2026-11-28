import { busyProps } from "./busy.ts";
import { expectProjectAccess } from "../initiative/consent-chain.ts";
import { SignOutAction } from "./SignOutAction.tsx";
import { useEffect, useId, useState } from "react";
import { useSetAside } from "./set-aside.ts";
import { useDraft } from "../describe/use-draft.ts";
import { Link, navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { accountRequest } from "./client.ts";
import { settleActionFailure } from "./action-failure.ts";
import { useAccount } from "./context.tsx";
import { continueToCertified, signInReturnFailed, signInReturnMessage } from "./sign-in.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";
import { DeviceBackups } from "../data/DeviceBackups.tsx";
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
  const { state, refresh, clear, returnResult, acknowledgeReturn } = useAccount();
  const { controller, ready } = useDraft();
  const setAside = useSetAside();
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState(() => notice || signInReturnMessage(returnResult));
  const [failed, setFailed] = useState(() => !!notice || signInReturnFailed(returnResult));
  useEffect(() => { if (returnResult) acknowledgeReturn(); }, [returnResult, acknowledgeReturn]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
    } catch (error) {
      const settled = await settleActionFailure(error, { refresh, clear });
      setMessage(settled.message);
      setFailed(!!settled.message);
    } finally {
      setBusy(false);
      setActing(null);
    }
  }
  /** Starts work from the button named `name`, which keeps the focus while it runs (`busy.ts`). */
  function start(name: string, action: () => Promise<void>) {
    if (busy) return;
    setActing(name);
    void run(action);
  }
  /** The attributes of the button named `name`; `blocked` is any other reason it cannot be used. */
  const pressed = (name: string, blocked = false) => busyProps(busy && acting === name, busy || blocked);
  const spinner = (name: string) => busy && acting === name && <span className="rc-spinner" aria-hidden="true" />;
  /** A new initiative is a draft of its own, so nothing is asked and nothing is backed up (DL-112). */
  async function beginCard() {
    await controller.startNew();
    onBeginCard?.();
    navigate(pathTo("initiative"));
  }
  return (
    <section className="rc-stack" aria-labelledby={heading ? `${id}-title` : undefined} aria-busy={busy}>
      {heading && (
        <Title className="rc-heading" data-size="section" id={`${id}-title`}>
          {compact ? "Sign In" : "Your Account"}
        </Title>
      )}
      {!state ? (
        <>
          <p>Account access could not be checked yet.</p>
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            {...pressed("check")}
            onClick={() =>
              start("check", async () => {
                await refresh();
              })
            }
          >
            <span>Check Account Access</span>
            {spinner("check")}
          </button>
        </>
      ) : !state.available ? (
        <p>Signing in is not available yet. Your draft stays on this device.</p>
      ) : !state.user ? (
        <>
          <p>
            {SIGN_IN.offer}
          </p>
          <form className="rc-stack" method="post" onSubmit={(event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get("email")?.toString().trim();
            onSignInStart?.();
            // Every sign-in goes on to project access (DL-137); none begins at Save any more (DL-155).
            expectProjectAccess(() => window.sessionStorage, window.location.pathname);
            start("sign-in", () => continueToCertified(controller, window.location.pathname,
              (returnTo) => accountRequest("", { returnTo, ...(email ? { email, emailRedirectConsent: true } : {}) }, "/api/sign-in"),
              (target) => window.location.assign(target)));
          }}>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="submit" {...pressed("sign-in", !ready)}
                data-task-focus={autoFocus || undefined}>
                <span>Sign In With Certified</span>
                {spinner("sign-in")}
              </button>
              {onNotNow && (
                <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={onNotNow}>
                  Not Now
                </button>
              )}
            </div>
            <p className="rc-meta">
              {SIGN_IN.withProjects}
            </p>
            <div className="rc-action-bar">
              <AboutCertified />
            </div>
            <details>
              <summary className="rc-footer-link">What leaves this device</summary>
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
                    aria-describedby={`${id}-email-help`} readOnly={busy} disabled={!ready} />
                </div>
              </details>
            )}
          </form>
        </>
      ) : (
        <>
          <p>Signed in with Certified.</p>
          <details>
            <summary className="rc-footer-link">About this session</summary>
            <p>
              {SIGN_IN.saved}
            </p>
            <p>
              {SIGN_IN.session} Signing out leaves the device
              draft and its backups in this browser; clear this site’s browser storage when leaving a shared
              device.
            </p>
          </details>
          {setAside && <p>A card from another account is on this device. It opens again when that account signs in.</p>}
          <div className="rc-action-bar">
            {showLeave && (
              <SignOutAction
                disabled={busy}
                onBusyChange={setBusy}
                onResult={(text, failed) => {
                  setMessage(text);
                  setFailed(failed);
                }}
              />
            )}
          </div>
          <h3 className="rc-heading" data-size="section">
            In Weave
          </h3>
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="quiet" type="button" {...pressed("begin", !ready)}
              onClick={() => start("begin", beginCard)}>
              <span>Start A New Initiative</span>
              {spinner("begin")}
            </button>
          </div>
        </>
      )}
      {!compact && showBackups && <DeviceBackups disabled={busy} />}
      {compact && (
        <p>
          <Link href={pathTo("settings")}>Device backups</Link>
        </p>
      )}
      {/* Said, not drawn: the pressed button shows it is busy, and a new line would push the page down. */}
      {busy && <p className="rc-visually-hidden" role="status">Connecting to your account</p>}
      {message && (message !== signInReturnMessage("signed-in") || state?.user) && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
