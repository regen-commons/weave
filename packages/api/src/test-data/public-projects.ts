// Synthetic Certified collection views and a listing that serves them page by page. No real records.
const letters = (n: number, width = 4) => {
  let text = "";
  for (let value = n; text.length < width; value = Math.floor(value / 26)) text = String.fromCharCode(97 + (value % 26)) + text;
  return text;
};
export const projectDid = (n: number) => `did:plc:fixture${"a".repeat(13)}${letters(n)}`;
export const projectUri = (n: number) => `at://${projectDid(n)}/org.hypercerts.collection/project${n}`;
export const projectCid = (n: number, version = 0) => `bafyrei${"q".repeat(36)}${letters(n)}${letters(version)}`;
export const projectName = (n: number) => `Watershed circle ${letters(n)}`;

export type ViewOptions = {
  version?: number;
  short?: string | null;
  createdAt?: string;
  indexedAt?: string | null;
  unlisted?: "organization" | "legacy" | "collection";
  title?: string;
};
export function projectView(n: number, options: ViewOptions = {}) {
  const did = projectDid(n);
  const organization = options.unlisted === "organization" || options.unlisted === "legacy" ? {
    did, uri: `at://${did}/app.certified.actor.organization/self`,
    record: { $type: "app.certified.actor.organization",
      ...(options.unlisted === "organization" ? { visibility: "unlisted" } : { unlisted: true }) },
  } : null;
  const short = options.short === undefined
    ? `We restore wetlands along river ${letters(n)}. Volunteers monitor water quality each season.`
    : options.short;
  return {
    uri: projectUri(n), cid: projectCid(n, options.version), did,
    indexedAt: options.indexedAt === undefined ? "2026-11-14T00:00:00Z" : options.indexedAt,
    author: { did, organization },
    record: {
      $type: "org.hypercerts.collection", type: "project", title: options.title ?? projectName(n),
      createdAt: options.createdAt ?? `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T12:00:00Z`,
      ...(options.unlisted === "collection" ? { visibility: "unlisted" } : {}),
      ...(short === null ? {} : { shortDescription: short }),
    },
  };
}

/**
 * A listing that pages `views` with opaque cursors, the way listCollections does. `fail` can answer a
 * request in place of the listing, such as an outage on a later page.
 */
export function projectListing(state: {
  views: unknown[];
  fail?: (request: { page: number; limit: number; cursor: string | null }) => Response | null;
  requests?: { limit: number; cursor: string | null }[];
}) {
  let page = 0;
  return async (url: string | URL | Request): Promise<Response> => {
    const params = new URL(String(url)).searchParams;
    const limit = Number(params.get("limit"));
    const cursor = params.get("cursor");
    state.requests?.push({ limit, cursor });
    const request = { page: page++, limit, cursor };
    const failure = state.fail?.(request);
    if (failure) return failure;
    const start = cursor ? Number(cursor.slice(1)) : 0;
    const next = start + limit < state.views.length ? `c${start + limit}` : undefined;
    return Response.json({ collections: state.views.slice(start, start + limit), ...(next ? { cursor: next } : {}) });
  };
}
