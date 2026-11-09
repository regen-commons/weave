import { z } from "../validation.ts";
import { AskChunkSchema, AskExtractionSchema } from "./contracts.ts";
import { keywordExtraction } from "./keywords.ts";
const RequestSchema = z.strictObject({ kind: z.enum(["needs", "offers"]), chunks: z.array(AskChunkSchema) });
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = RequestSchema.parse(event.data);
    self.postMessage({
      ok: true,
      result: AskExtractionSchema.parse(keywordExtraction(request.chunks, request.kind)),
    });
  } catch {
    self.postMessage({ ok: false });
  }
};
