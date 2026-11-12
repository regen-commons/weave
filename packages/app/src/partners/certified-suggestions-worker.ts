import { rankCertifiedSuggestions } from "./certified-suggestions.ts";

self.onmessage = (event: MessageEvent<Parameters<typeof rankCertifiedSuggestions>>) => {
  self.postMessage(rankCertifiedSuggestions(...event.data));
};
