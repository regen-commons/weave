// The server sends the app for any address, so an address with no page answers 200 with Home's file,
// whose head names Home as the canonical page and carries its JSON-LD. Left so, a search engine would
// file the missing page as a copy of Home. While the not-found page shows, the page asks not to be
// indexed, and Home's landing head is taken out as it is after any move (landing-head.ts).
import { LANDING_HEAD } from "./landing-head.ts";

/** The part of the document's head this reads and changes. */
export interface Head {
  querySelectorAll(selector: string): Iterable<{ remove(): void }>;
  append(node: unknown): void;
}

export function keepOutOfSearch(head: Head, createRobots: () => { remove(): void }): () => void {
  for (const element of head.querySelectorAll(LANDING_HEAD)) element.remove();
  const robots = createRobots();
  head.append(robots);
  return () => robots.remove();
}

/** The tag the page asks not to be indexed with. */
export function robotsNoindex(document: Document): HTMLMetaElement {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex";
  return meta;
}
