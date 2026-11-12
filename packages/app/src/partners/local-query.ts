import { PUBLIC_PARTNER_EVIDENCE } from "./catalog.ts";
import { rankLocalPartners, type LocalPartnerQuery, type PartnerMatch } from "./match.ts";

/** The worker and its public starter catalog are app assets. The query stays on this device. */
export async function queryLocalPartners(query: LocalPartnerQuery, signal: AbortSignal): Promise<PartnerMatch[]> {
  signal.throwIfAborted();
  try {
    if (typeof Worker !== "undefined") {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./local-query-worker.ts", import.meta.url), { type: "module" });
        const cleanup = () => {
          worker.terminate();
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
        };
        const abort = () => {
          cleanup();
          reject(signal.reason);
        };
        const fail = () => {
          cleanup();
          reject(new Error("Local matching worker unavailable"));
        };
        const timeout = setTimeout(fail, 1500);
        signal.addEventListener("abort", abort, { once: true });
        worker.onmessage = (event: MessageEvent<PartnerMatch[]>) => {
          cleanup();
          resolve(event.data);
        };
        worker.onerror = fail;
        worker.onmessageerror = fail;
        try {
          worker.postMessage(query);
        } catch {
          fail();
        }
      });
    }
  } catch {
    signal.throwIfAborted();
  }
  return rankLocalPartners(query, PUBLIC_PARTNER_EVIDENCE);
}
