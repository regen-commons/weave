import { PUBLIC_PARTNER_EVIDENCE } from "./catalog.ts";
import { rankLocalPartners, type LocalPartnerQuery } from "./match.ts";

self.onmessage = (event: MessageEvent<LocalPartnerQuery>) => {
  self.postMessage(rankLocalPartners(event.data, PUBLIC_PARTNER_EVIDENCE));
};
