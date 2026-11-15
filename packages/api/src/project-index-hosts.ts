import { record } from "./account-contract.ts";
import { readBounded } from "./project-index-source.ts";

/**
 * Certified's development and test servers hold test accounts, which Weave does not show (decision,
 * 15 November 2026). On that day 62 listed accounts lived on dev.certified.app and 48 on
 * pds1.test.certified.app.
 */
export function isCertifiedTestHost(host: string): boolean {
  // A fully qualified name may end with a dot and still name the same server.
  const name = host.toLowerCase().replace(/\.+$/u, "");
  return name === "dev.certified.app" || name === "test.certified.app" || name.endsWith(".test.certified.app");
}

/**
 * Where an account's records live. `unavailable` is a definite answer: the account is gone, or its DID
 * document names no usable personal data server. `failed` means the directory could not answer now.
 */
export type AccountHost = { status: "found"; host: string } | { status: "unavailable" } | { status: "failed" };
export type AccountHostResolver = { resolve(did: string): Promise<AccountHost> };

const maxDocumentBytes = 64 * 1024;

/** Reads this DID's own document. Anything else, such as an error body served with 200, is no answer. */
function documentHost(value: unknown, did: string): AccountHost {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>).id !== did)
    return { status: "failed" };
  const document = record(value);
  if (!Array.isArray(document.service)) return { status: "unavailable" };
  for (const entry of document.service) {
    const service = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    if ((service.id !== "#atproto_pds" && service.id !== `${did}#atproto_pds`)
      || service.type !== "AtprotoPersonalDataServer" || typeof service.serviceEndpoint !== "string") continue;
    let endpoint: URL;
    try { endpoint = new URL(service.serviceEndpoint); } catch { return { status: "unavailable" }; }
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password
      ? { status: "found", host: endpoint.hostname.toLowerCase() } : { status: "unavailable" };
  }
  return { status: "unavailable" };
}

/**
 * Resolves did:plc accounts through plc.directory, with one retry. A did:web account is judged by its
 * own domain and is never fetched: Certified's servers create did:plc accounts, and fetching a domain an
 * author chose is a needless outbound call. None of the listed accounts used did:web on 15 November.
 */
export function createAccountHostResolver(options: {
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
} = {}): AccountHostResolver {
  const request = options.fetch ?? fetch;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  async function plc(did: string): Promise<AccountHost> {
    for (const delay of [0, 1000]) {
      if (delay) await wait(delay);
      try {
        const response = await request(`https://plc.directory/${did}`, {
          headers: { accept: "application/did+ld+json, application/json" },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        if (response.status === 404 || response.status === 410) {
          await response.body?.cancel();
          return { status: "unavailable" };
        }
        if (!response.ok) {
          await response.body?.cancel();
          continue;
        }
        const answer = documentHost(await readBounded(response, maxDocumentBytes), did);
        if (answer.status !== "failed") return answer;
      } catch { /* A timeout, a network failure or a body that is not JSON is retried once. */ }
    }
    return { status: "failed" };
  }
  return {
    async resolve(did) {
      if (did.startsWith("did:plc:")) return plc(did);
      if (did.startsWith("did:web:")) {
        let host = "";
        try { host = decodeURIComponent(did.slice("did:web:".length).split(":")[0] ?? "").split(":")[0]!.toLowerCase(); }
        catch { /* A malformed escape names no domain. */ }
        return host ? { status: "found", host } : { status: "unavailable" };
      }
      return { status: "unavailable" };
    },
  };
}
