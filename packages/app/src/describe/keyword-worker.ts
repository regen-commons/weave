import { DeviceDraftSchema } from "./contracts.ts";
import { collectSource, fromSource, SourceSchema } from "./keywords.ts";
// Each reply names the message it answers, so the page can keep this worker for its next reading.
self.onmessage = async (event: MessageEvent<unknown>) => {
  const message = event.data as { draft?: unknown; source?: unknown; id?: unknown } | null;
  const id = message?.id;
  try {
    const draft = DeviceDraftSchema.parse(message?.draft);
    const source = message?.source ? SourceSchema.parse(message.source) : await collectSource(draft);
    self.postMessage({ ok: true, id, result: fromSource(draft, source) });
  } catch {
    self.postMessage({ ok: false, id });
  }
};
