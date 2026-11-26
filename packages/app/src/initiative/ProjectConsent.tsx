import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { startProjectConsent, type ProjectConsentAction } from "./projects-client.ts";
import { ProjectAccessTrip, projectAccessAddress, takeProjectAccess } from "./consent-chain.ts";

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

/** The page this load arrived on. A sign-in comes back to the page it left from, as a fresh load. */
const arrivedOn = typeof window !== "undefined" ? window.location.pathname : "";

/**
 * Whether this page load is the return from a sign-in that goes on to project access. Read once, as
 * the app's code loads: a sign-in always arrives as a fresh load, the callback's result is still in the
 * address then, and reading removes the note. Later the address is cleaned and the account's own record
 * of the result may already be acknowledged elsewhere.
 */
const trip = new ProjectAccessTrip(
  typeof window !== "undefined" &&
    takeProjectAccess(() => window.sessionStorage, new URLSearchParams(window.location.search).get("account"), arrivedOn),
  (address) => window.location.assign(address),
  undefined,
  // A person who has gone to another page meanwhile is not taken to Certified.
  () => window.location.pathname === arrivedOn,
);

/**
 * After a sign-in, goes on to Certified's permission to read the person's projects without another
 * press (DL-137), from the page the sign-in came back to. Mounted once for the app. Certified still
 * decides, and its answer comes back through the same receipt as a pressed Allow, to that same page.
 * The trip happens at most once for a page load; if it cannot start, nothing else changes, and Your
 * Initiatives shows the Allow button as it always did.
 */
export function ProjectAccessAfterSignIn(): null {
  const { state } = useAccount();
  // Nothing leaves the tab before the device's drafts are read and stored, as with a pressed Allow.
  const { controller, ready } = useDraft();
  const signedIn = !!state?.user, answered = state !== null;
  useEffect(() => trip.attend(), []);
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => { if (event.persisted) trip.returned(); };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, []);
  useEffect(() => {
    trip.update({ answered, signedIn, ready }, () => projectAccessAddress({
      settled: () => controller.settled(),
      storage: () => controller.getSnapshot().storage,
      start: () => startProjectConsent("membership", window.sessionStorage, undefined, arrivedOn),
    }));
  }, [answered, signedIn, ready, controller]);
  return null;
}

/**
 * True while that trip is under way, so Your Initiatives holds its loading shape and does not show the
 * Allow button for the moment before the browser leaves for Certified.
 */
export function useProjectAccessPending(): boolean {
  return useSyncExternalStore(trip.subscribe, trip.pending, () => false);
}
