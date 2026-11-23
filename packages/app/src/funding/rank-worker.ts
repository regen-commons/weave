import { parseBundle } from "./catalog.ts";
import { evaluateCatalog } from "./engine.ts";
import { z } from "../validation.ts";
import { ProjectSchema } from "./catalog-requests.ts";
self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = z
      .object({ catalog: z.unknown(), rules: z.unknown(), conditions: z.unknown(), project: ProjectSchema })
      .parse(event.data);
    const bundle = parseBundle(request.catalog, request.rules, request.conditions);
    self.postMessage({ ok: true, results: evaluateCatalog(bundle, request.project) });
  } catch {
    self.postMessage({ ok: false });
  }
};
