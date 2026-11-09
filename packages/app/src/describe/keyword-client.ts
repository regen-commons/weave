import type { DeviceDraft } from "./contracts.ts";
import { collectSource, fromSource, KeywordResultSchema, type KeywordResult } from "./keywords.ts";
export async function keywordExtract(draft: DeviceDraft, signal: AbortSignal): Promise<KeywordResult> {
  signal.throwIfAborted();
  const pdfReader = draft.attachments.some(
    (file) => file.type === "application/pdf" || /\.pdf$/iu.test(file.name),
  )
    ? (await import("./pdf.ts")).readPdfText
    : undefined;
  const source = pdfReader ? await collectSource(draft, pdfReader, signal) : undefined;
  signal.throwIfAborted();
  if (typeof Worker === "undefined")
    return fromSource(draft, source ?? (await collectSource(draft, undefined, signal)));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./keyword-worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      cleanup();
      const value = event.data as { ok?: boolean; result?: KeywordResult };
      if (!value?.ok || !value.result) {
        reject(new Error("The local reader could not finish. Your words are still here."));
        return;
      }
      try {
        resolve(KeywordResultSchema.parse(value.result));
      } catch {
        reject(new Error("The local reader returned an invalid card."));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The local reader could not start. You can fill the four fields instead."));
    };
    try {
      worker.postMessage({ draft, source });
    } catch {
      cleanup();
      reject(new Error("The local reader could not receive this draft."));
    }
  });
}
