import { readPdfText as read, type PdfLibrary } from "./pdf-core.ts";
let library: Promise<{ api: typeof import("pdfjs-dist"); workerUrl: string }> | undefined;
async function pdfLibrary() {
  if (!library)
    library = (async () => {
      const [api, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      return { api, workerUrl: worker.default };
    })().catch((error) => {
      library = undefined;
      throw error;
    });
  return library;
}
/** Own the Worker explicitly: a CSP or capability failure never silently parses on the UI thread. */
export async function readPdfText(file: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const { api, workerUrl } = await pdfLibrary();
  signal.throwIfAborted();
  const port = new Worker(workerUrl, { type: "module" });
  let worker: import("pdfjs-dist").PDFWorker | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      worker?.destroy();
    } finally {
      port.terminate();
    }
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    worker = api.PDFWorker.create({ port, verbosity: 0 });
    const wrapped: PdfLibrary = {
      getDocument(options) {
        return api.getDocument({ ...options, worker });
      },
    };
    return await read(file, signal, wrapped);
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}
