import {
  parseSaved,
  parseSummaries,
  parseUser,
  record,
  type AccountUser,
  type InitiativeSummary,
} from "@weave/api/account-contract";
export class AccountFailure extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export async function accountRequest(
  path = "",
  body?: unknown,
  endpoint = "/api/account",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(15000);
  let response: Response;
  try {
    response = await fetch(`${endpoint}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new AccountFailure("connection_failed");
  }
  let data: Record<string, unknown>;
  try {
    data = record(await response.json());
  } catch {
    if (timeout.aborted) throw new AccountFailure("connection_failed");
    throw new AccountFailure("account_unavailable");
  }
  if (!response.ok)
    throw new AccountFailure(typeof data.error === "string" ? data.error : "account_unavailable");
  return data;
}
export interface AccountState {
  available: boolean;
  fixture: boolean;
  emailHintAvailable?: boolean;
  user: AccountUser | null;
  items: InitiativeSummary[];
}
export function accountState(data: Record<string, unknown>): AccountState {
  if (data.available === false)
    return { available: false, fixture: false, user: null, items: [] };
  if (data.available !== true || data.signIn !== "certified") throw new AccountFailure("account_unavailable");
  return {
    available: true,
    fixture: data.fixture === true,
    ...(data.emailHintAvailable === true ? { emailHintAvailable: true } : {}),
    user: data.user === null ? null : parseUser(data.user),
    items: parseSummaries(data.items),
  };
}
export { parseSaved, parseUser };
export function assertAccount(data: Record<string, unknown>, expectedId: string): void {
  if (parseUser(data.user).id !== expectedId) throw new AccountFailure("account_changed");
}
export function accountMessage(error: unknown): string {
  const code = error instanceof AccountFailure ? error.code : "";
  return (
    (
      {
        sign_in_failed: "Certified sign-in could not finish. Your device draft is still here. Try again.",
        sign_in_unavailable: "Certified sign-in is unavailable. Your device draft is still here. Try again later.",
        invalid_sign_in_email: "Enter a valid email address for Certified.",
        rate_limited: "Please wait before trying this account action again.",
        sign_in_required: "Your session ended. Sign in again. Your device draft is still here.",
        account_changed:
          "The signed-in account changed in another tab. Check the account shown here before saving again.",
        save_conflict:
          "This saved card changed elsewhere. Load its latest copy before saving again. Your device draft is still here.",
        sign_out_unconfirmed: "Sign-out could not be confirmed. Keep this device with you and try again.",
        connection_failed:
          "The connection failed. Your device draft is still here. Try again when you are online.",
        document_too_large: "This card is too large to save. Your device draft is still here.",
      } as Record<string, string>
    )[code] ??
    (error instanceof AccountFailure
      ? "Your account could not be reached. Your device draft is still here. Try again."
      : error instanceof Error
        ? error.message
        : "This change could not be completed. Your device draft is still here.")
  );
}
