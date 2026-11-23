import type { DeviceDraft } from "./contracts.ts";
import { collectSource, fromSource, KeywordResultSchema, type KeywordResult } from "./keywords.ts";
import { reusableWorker, WorkerProblem } from "./reusable-worker.ts";
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
  let reply: { ok?: boolean; result?: unknown };
  try {
    reply = (await reader.run({ draft, source }, signal)) as typeof reply;
  } catch (error) {
    if (error instanceof WorkerProblem)
      throw new Error(
        error.stage === "start"
          ? "The local reader could not start. You can fill the four fields instead."
          : "The local reader could not receive this draft.",
      );
    throw error;
  }
  if (!reply?.ok || !reply.result) throw new Error("The local reader could not finish. Your words are still here.");
  try {
    return KeywordResultSchema.parse(reply.result);
  } catch {
    throw new Error("The local reader returned an invalid card.");
  }
}

/**
 * The keyword worker, kept for the visit to the describe step so every fill after the first skips
 * starting it. The page warms it when the person starts to talk or type and closes it on leaving.
 */
const reader = reusableWorker(() => new Worker(new URL("./keyword-worker.ts", import.meta.url), { type: "module" }));
export const warmKeywordReader = (): void => {
  if (typeof Worker !== "undefined") reader.warm();
};
export const closeKeywordReader = (): void => reader.close();
