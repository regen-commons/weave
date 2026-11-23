import { z } from "../validation.ts";
import { AskChunkSchema, AskExtractionSchema } from "./contracts.ts";
import { keywordExtraction } from "./keywords.ts";
const RequestSchema = z.strictObject({
  kind: z.enum(["needs", "offers"]),
  chunks: z.array(AskChunkSchema),
  // Which message this is, so the reply can name it and the page can keep this worker.
  id: z.number().int(),
});
self.onmessage = (event: MessageEvent<unknown>) => {
  const id = (event.data as { id?: unknown } | null)?.id;
  try {
    const request = RequestSchema.parse(event.data);
    self.postMessage({
      ok: true,
      id,
      result: AskExtractionSchema.parse(keywordExtraction(request.chunks, request.kind)),
    });
  } catch {
    self.postMessage({ ok: false, id });
  }
};
