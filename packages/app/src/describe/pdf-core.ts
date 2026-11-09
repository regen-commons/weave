import { MAX_FILE_BYTES } from "./contracts.ts";
export interface DocumentText {
  text: string;
  pages: number;
  unreadPages: number;
}
interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: unknown; hasEOL?: boolean } | object> }>;
  cleanup(): void;
}
interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
}
export interface PdfLibrary {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}
/** PDF bytes and text stay local. PDF.js does the parsing in its same-origin Worker. */
export async function readPdfText(file: Blob, signal: AbortSignal, api: PdfLibrary): Promise<DocumentText> {
  signal.throwIfAborted();
  if (file.size > MAX_FILE_BYTES) throw new Error("PDF exceeds the 25 MB file limit");
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const loading = api.getDocument({
    data,
    verbosity: 0,
    isEvalSupported: false,
    useWasm: false,
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  });
  let cancel: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = reject;
  });
  const abort = () => {
    void loading.destroy().catch(() => {});
    cancel(new DOMException("Cancelled", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await Promise.race([loading.promise, cancelled]);
    signal.throwIfAborted();
    const text: string[] = [];
    let unreadPages = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      let page: PdfPage | undefined;
      try {
        page = await Promise.race([pdf.getPage(number), cancelled]);
        const content = await Promise.race([page.getTextContent(), cancelled]);
        signal.throwIfAborted();
        const words = content.items
          .flatMap((item) =>
            "str" in item && typeof item.str === "string"
              ? [item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")]
              : [],
          )
          .join("")
          .trim();
        if (!words) unreadPages++;
        else text.push(words);
      } catch {
        signal.throwIfAborted();
        unreadPages++;
      } finally {
        page?.cleanup();
      }
    }
    return { text: text.join("\n\n"), pages: pdf.numPages, unreadPages };
  } finally {
    signal.removeEventListener("abort", abort);
    if (signal.aborted) void loading.destroy().catch(() => {});
    else await loading.destroy().catch(() => {});
  }
}
