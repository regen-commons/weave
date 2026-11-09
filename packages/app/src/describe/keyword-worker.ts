import { DeviceDraftSchema } from "./contracts.ts";
import { collectSource, fromSource, SourceSchema } from "./keywords.ts";
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const message = event.data as { draft?: unknown; source?: unknown };
    const draft = DeviceDraftSchema.parse(message.draft);
    const source = message.source ? SourceSchema.parse(message.source) : await collectSource(draft);
    self.postMessage({ ok: true, result: fromSource(draft, source) });
  } catch {
    self.postMessage({ ok: false });
  }
};
