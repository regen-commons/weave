import { useEffect, useState } from "react";
import { useAccount } from "./context.tsx";
import { signInReturnFailed, signInReturnMessage } from "./sign-in.ts";

/**
 * Says why a sign-in did not finish, on a page that offers sign-in in place and so opens no dialog
 * on the way back from Certified. It shows once and reads nothing when the sign-in worked.
 */
export function SignInReturnNotice() {
  const { returnResult, acknowledgeReturn } = useAccount();
  const [message] = useState(() => (signInReturnFailed(returnResult) ? signInReturnMessage(returnResult) : ""));
  useEffect(() => {
    if (message) acknowledgeReturn();
  }, [message, acknowledgeReturn]);
  return message ? (
    <p className="rc-notice" data-tone="warning" role="alert">
      {message}
    </p>
  ) : null;
}
