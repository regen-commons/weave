import { useState } from "react";
import { accountRequest } from "./client.ts";
import { useAccount } from "./context.tsx";
import { signOut as endSession } from "./sign-out.ts";
/** Sign out as a button with its own notice. The rule for when identity leaves the screen is in sign-out.ts. */
export function SignOutAction({
  label = "Sign Out",
  onResult,
  disabled = false,
  onBusyChange,
}: {
  label?: string;
  onResult?(message: string, failed: boolean): void;
  disabled?: boolean;
  onBusyChange?(busy: boolean): void;
}) {
  const { state, signedOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  function report(message: string, failed: boolean) {
    setNotice({ message, failed });
    onResult?.(message, failed);
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setNotice(null);
    try {
      const result = await endSession(() => accountRequest("", { action: "sign_out" }), signedOut);
      report(result.message, result.failed);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="rc-stack">
      {!state ? (
        <p>Checking this session.</p>
      ) : !state.available ? (
        <p>Account status is unavailable. We cannot confirm whether this session has ended.</p>
      ) : state.user ? (
        <button
          className="rc-button"
          data-variant="secondary"
          type="button"
          // Its own press keeps the focus (`busy.ts`). The page that hosts it may report the same work
          // back as `disabled`, which must not grey out the button being pressed.
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
          disabled={disabled && !busy}
          onClick={() => void signOut()}
        >
          {busy ? "Signing Out" : label}
        </button>
      ) : (
        <p>You are signed out.</p>
      )}
      {notice && !onResult && (
        <p
          className="rc-notice"
          data-tone={notice.failed ? "warning" : "info"}
          role={notice.failed ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
