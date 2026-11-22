import { record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
export async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    throw new AccountError(413, "request_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError(400, "invalid_data");
  const chunks: Uint8Array[] = [];
  let bytes = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 10000);
  try {
    while (true) {
      const result = await reader.read();
      if (timedOut) throw new AccountError(408, "request_timeout");
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 65536) {
        void reader.cancel();
        throw new AccountError(413, "request_too_large");
      }
      chunks.push(result.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)));
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(400, "invalid_data");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/**
 * How long a signed-in browser may stay idle before its renewal cookie lapses. Each renewal restarts it.
 * Supabase still decides whether the session itself is alive.
 */
export const RENEWAL_SECONDS = 14 * 24 * 60 * 60;
export function sessionCookies(secure = true) {
  const name = secure ? "__Host-weave_account" : "weave_local_account";
  const pendingName = secure ? "__Host-weave_sign_in" : "weave_local_sign_in";
  // Host-only, HttpOnly and SameSite=Strict like the access token, so no sibling host can plant one.
  const renewalName = secure ? "__Host-weave_account_renewal" : "weave_local_account_renewal";
  const write = (key: string, value: string, seconds: number, sameSite: "Strict" | "Lax") =>
    `${key}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
  const read = (request: Request, key: string) => {
    const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${key}=`));
    return values.length === 1 ? values[0]!.slice(key.length + 1) : null;
  };
  return {
    session: (token = "", seconds = 0) => write(name, token, seconds, "Strict"),
    pending: (id = "", seconds = 0) => write(pendingName, id, seconds, "Lax"),
    /** Supabase's refresh token, base64url-encoded so any token it issues is a valid cookie value. */
    renewal: (refreshToken = "", seconds = 0) =>
      write(renewalName, refreshToken && Buffer.from(refreshToken).toString("base64url"), seconds, "Strict"),
    /** Every cookie that carries the session, cleared. Sign-out and an ended session send all of them. */
    ended: () => [write(name, "", 0, "Strict"), write(renewalName, "", 0, "Strict")],
    renewalToken(request: Request) {
      const raw = read(request, renewalName);
      if (!raw || raw.length > 1400 || !/^[A-Za-z0-9_-]+$/u.test(raw)) return null;
      const value = Buffer.from(raw, "base64url").toString("latin1");
      return /^[\x21-\x7e]{8,1024}$/u.test(value) ? value : null;
    },
    token(request: Request) {
      const token = read(request, name);
      return token && token.length <= 3800 && /^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/u.test(token) ? token : null;
    },
    binding(request: Request) {
      const id = read(request, pendingName);
      return id && /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
    },
  };
}
