// The server sends the app for any address, so an address with no page answers 200 with Home's file,
// which names Home as its canonical address. Left so, a search engine would file the missing page
// as a copy of Home. While the not-found page shows, the page asks not to be indexed and names no
// canonical address; leaving it puts both back.

/** The part of the document's head this reads and changes. */
export interface Head {
  querySelector(selector: string): { remove(): void } | null;
  append(node: unknown): void;
}

export function keepOutOfSearch(head: Head, createRobots: () => { remove(): void }): () => void {
  const canonical = head.querySelector('link[rel="canonical"]');
  canonical?.remove();
  const robots = createRobots();
  head.append(robots);
  return () => {
    robots.remove();
    if (canonical) head.append(canonical);
  };
}

/** The tag the page asks not to be indexed with. */
export function robotsNoindex(document: Document): HTMLMetaElement {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex";
  return meta;
}
