import { useState } from "react";
import { AccountFailure, accountMessage, accountRequest } from "./client.ts";
import { useAccount } from "./context.tsx";
/** Clear UI identity only after confirmed sign-out or an already-invalid session. */
export function SignOutAction({
  label = "Sign out",
  onResult,
  disabled = false,
  onBusyChange,
}: {
  label?: string;
  onResult?(message: string, failed: boolean): void;
  disabled?: boolean;
  onBusyChange?(busy: boolean): void;
}) {
  const { state, clear } = useAccount();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  function report(message: string, failed: boolean) {
    setNotice({ message, failed });
    onResult?.(message, failed);
  }
  async function signOut() {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setNotice(null);
    try {
      await accountRequest("", { action: "sign_out" });
      clear();
      report("You are signed out. The device draft and its backups are still here.", false);
    } catch (error) {
      if (error instanceof AccountFailure && error.code === "sign_in_required") clear();
      report(accountMessage(error), true);
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
          disabled={busy || disabled}
          onClick={() => void signOut()}
        >
          {busy ? "Signing out" : label}
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
