import { collectSource, countWords } from "../describe/keywords.ts";
import { browserExtractUsing } from "../describe/engines.ts";
import {
  AskExtractionSchema,
  parseExtraction,
  type AskChunk,
  type AskExtraction,
  type AskKind,
  type AskStep,
} from "./contracts.ts";
import { candidateChunks, chunksFrom, keywordExtraction } from "./keywords.ts";
async function keywordWorker(chunks: AskChunk[], kind: AskKind, signal: AbortSignal): Promise<AskExtraction> {
  signal.throwIfAborted();
  if (typeof Worker === "undefined") return keywordExtraction(chunks, kind);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./extract-worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      cleanup();
      const parsed = AskExtractionSchema.safeParse(event.data?.result);
      if (event.data?.ok && parsed.success) resolve(parsed.data);
      else reject(new Error("The local reader returned invalid cards."));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The local reader could not start. Add cards by hand instead."));
    };
    try {
      worker.postMessage({ chunks, kind });
    } catch {
      cleanup();
      reject(new Error("The local reader could not receive these words."));
    }
  });
}
export async function extractAsks(step: AskStep, kind: AskKind, signal: AbortSignal, useBrowser: boolean) {
  signal.throwIfAborted();
  const hasPdf = step.attachments.some(
    (file) => file.type === "application/pdf" || /\.pdf$/iu.test(file.name),
  );
  const pdfReader = hasPdf ? (await import("../describe/pdf.ts")).readPdfText : undefined;
  const chunks = step.turns.flatMap((turn) => chunksFrom(turn.text, turn.id));
  const files = [];
  let unreadFiles = 0;
  for (const attachment of step.attachments) {
    const source = await collectSource(
      { turns: [], composer: "", attachments: [attachment] },
      pdfReader,
      signal,
    );
    chunks.push(...chunksFrom(source.text, attachment.id));
    files.push(...source.files);
    unreadFiles += source.unreadFiles;
  }
  const candidates = candidateChunks(chunks, step);
  const words = countWords(chunks.map((chunk) => chunk.text).join(" "));
  const started = performance.now();
  let extraction = await keywordWorker(candidates, kind, signal);
  const attempts: Array<{
    engine: "keywords" | "browser";
    status: "complete" | "failed";
    latencyMs: number;
  }> = [{ engine: "keywords", status: "complete", latencyMs: Math.round(performance.now() - started) }];
  let engine: "keywords" | "browser" = "keywords";
  let fallback = false;
  if (useBrowser && candidates.length) {
    const nativeStart = performance.now();
    try {
      const result = await browserExtractUsing(
        JSON.stringify(candidates),
        signal,
        AskExtractionSchema,
        `Extract only the ${kind} stated in these source chunks. Return up to five cards in source order and the total heard. Copy each sourceKey exactly from a chunk key. All eight capitalForms may apply; there is no primary kind. Leave unknown kinds empty. Never guess currency or amounts, timeframe, capacity or beneficiaries. Defaults are anywhere, open terms, open status; all output will be reviewed`,
      );
      signal.throwIfAborted();
      parseExtraction(result, candidates);
      extraction = result;
      engine = "browser";
      attempts.push({
        engine: "browser",
        status: "complete",
        latencyMs: Math.round(performance.now() - nativeStart),
      });
    } catch {
      signal.throwIfAborted();
      fallback = true;
      attempts.push({
        engine: "browser",
        status: "failed",
        latencyMs: Math.round(performance.now() - nativeStart),
      });
    }
  }
  signal.throwIfAborted();
  return { extraction, words, attempts, lastBuild: { engine, fallback, unreadFiles, files } };
}
