import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { startProjectConsent, type ProjectConsentAction } from "./projects-client.ts";
import { ProjectAccessTrip, projectAccessAddress, takeProjectAccess } from "./consent-chain.ts";
import { pathTo } from "../routes.ts";

export function ConsentButton({ action }: { action: ProjectConsentAction }) {
  const { state } = useAccount();
  return state?.user ? <AccountConsentButton key={`${state.user.id}/${action}`} action={action} /> : null;
}
function AccountConsentButton({ action }: { action: ProjectConsentAction }) {
  const { controller } = useDraft();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = new AbortController(); lifetime.current = current;
    return () => current.abort();
  }, []);
  async function allow() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busy) return;
    setBusy(true); setError("");
    try {
      await controller.settled();
      signal.throwIfAborted();
      if (!["saved", "none"].includes(controller.getSnapshot().storage)) throw Error();
      const url = await startProjectConsent(action, window.sessionStorage, signal);
      signal.throwIfAborted();
      window.location.assign(url);
    } catch { if (!signal.aborted) { setError("Permission could not start. Keep this page open and try again."); setBusy(false); } }
  }
  return <div className="rc-stack"><button className="rc-button" data-variant="secondary" type="button"
    disabled={busy} onClick={() => void allow()}>Allow Certified Project Access</button>{error && <p role="alert">{error}</p>}</div>;
}

/**
 * Whether this page load is the return from a sign-in on Your Initiatives that said project access
 * comes next. Read once, as the page's code loads: a sign-in always arrives as a fresh load, the
 * callback's result is still in the address then, and reading removes the note. Later the address
 * is cleaned and the account's own record of the result may already be acknowledged elsewhere.
 */
const trip = new ProjectAccessTrip(
  typeof window !== "undefined" &&
    takeProjectAccess(() => window.sessionStorage, new URLSearchParams(window.location.search).get("account"),
      window.location.pathname === pathTo("your-initiatives")),
  (address) => window.location.assign(address),
);

/**
 * After a sign-in that said project access comes next, goes on to Certified's permission for it
 * without another press (DL-137). True while that is under way, so the page holds its loading shape
 * and does not show the Allow button for the moment before it leaves. Certified still asks, and its
 * answer comes back through the same receipt as a pressed Allow. The trip happens at most once for a
 * page load; if it cannot start, the page shows what it always did, with the button.
 */
export function useProjectAccessAfterSignIn(): boolean {
  const { state } = useAccount();
  // Nothing leaves the tab before the device's drafts are read and stored, as with a pressed Allow.
  const { controller, ready } = useDraft();
  const pending = useSyncExternalStore(trip.subscribe, trip.pending);
  const signedIn = !!state?.user, answered = state !== null;
  useEffect(() => trip.attend(), []);
  useEffect(() => {
    trip.update({ answered, signedIn, ready }, () => projectAccessAddress({
      settled: () => controller.settled(),
      storage: () => controller.getSnapshot().storage,
      start: () => startProjectConsent("membership", window.sessionStorage),
    }));
  }, [answered, signedIn, ready, controller]);
  return pending;
}
