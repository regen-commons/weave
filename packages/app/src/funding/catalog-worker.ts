import { answerCatalog, CatalogRequestSchema, readCatalog, type CatalogSources } from "./catalog-requests.ts";
import type { Bundle } from "./contracts.ts";

/** The catalog, read and checked once for every page that asks. A failed read is not kept. */
let loaded: Promise<Bundle> | undefined;
function read(sources: CatalogSources): Promise<Bundle> {
  const reading = readCatalog(sources);
  loaded = reading;
  reading.catch(() => {
    if (loaded === reading) loaded = undefined;
  });
  return reading;
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  const parsed = CatalogRequestSchema.safeParse(event.data);
  const id = (event.data as { id?: unknown } | null)?.id;
  if (!parsed.success) {
    if (typeof id === "number") self.postMessage({ id, ok: false });
    return;
  }
  const request = parsed.data;
  const reading = !request.retry && loaded ? loaded : read(request.sources);
  try {
    self.postMessage({ id: request.id, ok: true, value: answerCatalog(await reading, request) });
  } catch {
    self.postMessage({ id: request.id, ok: false });
  }
};
