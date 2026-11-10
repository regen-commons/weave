import { record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import type { CertifiedProjectProvider, CertifiedProjectResult } from "./certified-project-provider.ts";
import { SUPPORT_COLLECTION, parseSupportListing, type SupportPublicationAdapter, type SupportTarget } from "./support-publication.ts";

const groupCreate = "app.certified.group.repo.createRecord";
const groupDelete = "app.certified.group.repo.deleteRecord";
const personalCreate = "com.atproto.repo.createRecord";
const personalDelete = "com.atproto.repo.deleteRecord";
export interface SupportPublicationProviderOptions {
  projectProvider: Pick<CertifiedProjectProvider, "readRepoRecord">;
  groupServiceOrigin: string;
  assertGrant(actorDid: string, methods: readonly string[]): Promise<void>;
  serviceAuth(actorDid: string, method: string, signal: AbortSignal): Promise<string | null>;
  personalWrite(actorDid: string, operation: "create" | "delete",
    input: { rkey: string; record?: unknown; expectedCid?: string }, signal: AbortSignal): Promise<Response | null>;
  /** Enable only after the target CGS proves it forwards swapRecord to its backing PDS. */
  groupConditionalDeleteVerified?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
type Result = CertifiedProjectResult<unknown>;
async function json(response: Response) {
  if (!response.body) throw Error("invalid_support_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) throw Error("invalid_support_response");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return record(JSON.parse(text + decoder.decode()));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export function createSupportPublicationAdapter(options: SupportPublicationProviderOptions): SupportPublicationAdapter {
  const cgs = new URL(options.groupServiceOrigin);
  if (cgs.protocol !== "https:" || cgs.origin !== options.groupServiceOrigin || cgs.username || cgs.password || cgs.port)
    throw Error("invalid_support_group_service");
  const request = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30000) throw Error("invalid_support_timeout");
  async function write(actorDid: string, target: SupportTarget, operation: "create" | "delete", input: {
    rkey: string; record?: unknown; expectedCid?: string;
  }): Promise<Result> {
    if (!/^[2-7a-j][2-7a-z]{12}$/u.test(input.rkey) ||
        (operation === "delete" && !/^b[a-z2-7]{40,100}$/u.test(input.expectedCid ?? "")))
      return { ok: false, code: "invalid_input" };
    if (operation === "create") {
      try {
        const listing = parseSupportListing(input.record);
        if (listing.projectUri !== target.projectUri) throw Error();
      } catch { return { ok: false, code: "invalid_input" }; }
    }
    if (target.groupDid && !options.groupConditionalDeleteVerified)
      return { ok: false, code: "unsupported" };
    if ((!target.groupDid && target.repositoryDid !== actorDid) ||
        (target.groupDid && target.groupDid !== target.repositoryDid)) return { ok: false, code: "forbidden" };
    const signal = AbortSignal.timeout(timeout);
    let expired!: () => void;
    const deadline = new Promise<never>((_, reject) => {
      expired = () => reject(Error("support_write_timeout"));
      signal.addEventListener("abort", expired, { once: true });
    });
    try {
      return await Promise.race([deadline, (async (): Promise<Result> => {
        let response: Response | null;
        if (target.groupDid) {
          const method = operation === "create" ? groupCreate : groupDelete;
          const token = await options.serviceAuth(actorDid, method, signal);
          if (!token || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(token))
            return { ok: false, code: "authorization_required" };
          signal.throwIfAborted();
          response = await request(new URL(`/xrpc/${method}`, cgs), {
            method: "POST", signal, cache: "no-store", redirect: "error",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ repo: target.repositoryDid, collection: SUPPORT_COLLECTION, rkey: input.rkey,
              ...(operation === "create" ? { record: input.record } : { swapRecord: input.expectedCid }) }),
          });
        } else response = await options.personalWrite(actorDid, operation, input, signal);
        if (!response) return { ok: false, code: "authorization_required" };
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          return { ok: false, code: response.status === 401 ? "authorization_required" : "forbidden" };
        }
        let value: Record<string, unknown>;
        try { value = await json(response); } catch { return { ok: false, code: "pending" }; }
        if (!response.ok) return { ok: false, code: value.error === "InvalidSwap" || response.status === 409 ? "conflict" : "pending" };
        if (operation === "create" && (value.uri !== `at://${target.repositoryDid}/${SUPPORT_COLLECTION}/${input.rkey}` ||
            typeof value.cid !== "string" || !/^b[a-z2-7]{40,100}$/u.test(value.cid)))
          return { ok: false, code: "pending" };
        return { ok: true, value };
      })()]);
    } catch { return { ok: false, code: "pending" }; }
    finally { signal.removeEventListener("abort", expired); }
  }
  return {
    async authorize(actorDid, target, operation) {
      if (target.groupDid && !options.groupConditionalDeleteVerified)
        throw new AccountError(503, "support_group_lifecycle_unverified");
      await options.assertGrant(actorDid, [target.groupDid
        ? operation === "create" ? groupCreate : groupDelete
        : operation === "create" ? personalCreate : personalDelete]);
    },
    async read(target, rkey) {
      const result = await options.projectProvider.readRepoRecord(target.repositoryDid, SUPPORT_COLLECTION, rkey);
      if (!result.ok) return result.code === "not_found" ? { ok: true, value: null } : result;
      return { ok: true, value: result.value };
    },
    create: (actorDid, target, rkey, value) => write(actorDid, target, "create", { rkey, record: value }),
    delete: (actorDid, target, rkey, expectedCid) => write(actorDid, target, "delete", { rkey, expectedCid }),
  };
}
