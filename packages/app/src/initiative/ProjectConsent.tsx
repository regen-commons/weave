import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { startProjectConsent, type ProjectConsentAction } from "./projects-client.ts";

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
    disabled={busy} onClick={() => void allow()}>Allow Certified project access</button>{error && <p role="alert">{error}</p>}</div>;
}
