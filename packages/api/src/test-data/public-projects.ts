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
  /** The display name on the publisher's profile; any value, to test what is refused. */
  publisher?: unknown;
  /** The place's name, pinned by the record and hydrated beside it. */
  place?: unknown;
  /** The publisher organization's `organizationType`. */
  organizationTypes?: unknown;
};
export const placeUri = (n: number) => `at://${projectDid(n)}/app.certified.location/place${n}`;
export const placeCid = (n: number) => `bafyrei${"p".repeat(36)}${letters(n)}aaaa`;
export function projectView(n: number, options: ViewOptions = {}) {
  const did = projectDid(n);
  const listed = options.unlisted === "organization" ? { visibility: "unlisted" }
    : options.unlisted === "legacy" ? { unlisted: true } : {};
  const organization = options.unlisted === "organization" || options.unlisted === "legacy" || options.organizationTypes !== undefined ? {
    did, uri: `at://${did}/app.certified.actor.organization/self`,
    record: { $type: "app.certified.actor.organization", ...listed,
      ...(options.organizationTypes === undefined ? {} : { organizationType: options.organizationTypes }) },
  } : null;
  const profile = options.publisher === undefined ? null : {
    did, uri: `at://${did}/app.certified.actor.profile/self`,
    record: { $type: "app.certified.actor.profile", displayName: options.publisher },
  };
  const short = options.short === undefined
    ? `We restore wetlands along river ${letters(n)}. Volunteers monitor water quality each season.`
    : options.short;
  const pinned = { uri: placeUri(n), cid: placeCid(n) };
  return {
    uri: projectUri(n), cid: projectCid(n, options.version), did,
    indexedAt: options.indexedAt === undefined ? "2026-11-14T00:00:00Z" : options.indexedAt,
    author: { did, profile, organization },
    // The listing hydrates the pinned place as its own view, one level down.
    ...(options.place === undefined ? {} : {
      location: { ...pinned, record: { ...pinned, did, indexedAt: "2026-11-14T00:00:00Z",
        record: { $type: "app.certified.location", name: options.place } } },
    }),
    record: {
      $type: "org.hypercerts.collection", type: "project", title: options.title ?? projectName(n),
      createdAt: options.createdAt ?? `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T12:00:00Z`,
      ...(options.unlisted === "collection" ? { visibility: "unlisted" } : {}),
      ...(short === null ? {} : { shortDescription: short }),
      ...(options.place === undefined ? {} : { location: pinned }),
    },
  };
}

/**
 * One listing item with everything a card reads, in the shape listCollections returned for the 100 newest
 * listed projects on 19 November 2026: the publisher's profile and organization under `author`, each a
 * view with its own address and `record`, and the place the record pins hydrated at the item's top level
 * as a view of its own, one level down. The content is invented. It also carries fields Weave must not
 * show: a banner, an avatar, the organization's links and its own location, and the place's coordinates.
 */
export function realisticProjectView() {
  const did = "did:plc:fixturelagoaseedlibraryq";
  const place = { uri: `at://${did}/app.certified.location/3m6bq4lagoa2c`, cid: `bafyrei${"l".repeat(52)}` };
  const blob = (letter: string, mimeType: string, size: number) =>
    ({ $type: "blob", ref: { $link: `bafkrei${letter.repeat(52)}` }, mimeType, size });
  return {
    uri: `at://${did}/org.hypercerts.collection/3m6bq4seedlib`,
    cid: `bafyrei${"s".repeat(52)}`,
    did,
    indexedAt: "2026-11-18T09:41:27.512Z",
    author: {
      did,
      profile: {
        uri: `at://${did}/app.certified.actor.profile/self`, cid: `bafyrei${"r".repeat(52)}`, did,
        indexedAt: "2026-09-02T10:00:01.000Z",
        record: {
          $type: "app.certified.actor.profile", displayName: "Lagoa Seed Library", langs: ["pt"],
          avatar: { $type: "org.hypercerts.defs#smallImage", image: blob("a", "image/png", 20511) },
          createdAt: "2026-09-02T10:00:00.000Z",
        },
      },
      organization: {
        uri: `at://${did}/app.certified.actor.organization/self`, cid: `bafyrei${"o".repeat(52)}`, did,
        indexedAt: "2026-09-02T10:00:01.000Z",
        record: {
          $type: "app.certified.actor.organization", organizationType: ["nonprofit"], langs: ["pt"],
          longDescription: { $type: "org.hypercerts.defs#descriptionString", value: "Neighbours who keep and share seed." },
          location: { uri: `at://${did}/app.certified.location/3m6bq4office`, cid: `bafyrei${"h".repeat(52)}` },
          urls: [{ url: "https://seeds.example.org", label: "Website" }], createdAt: "2026-09-02T10:00:00.000Z",
        },
      },
    },
    location: {
      ...place,
      record: {
        ...place, did, indexedAt: "2026-09-02T10:05:01.000Z",
        record: {
          $type: "app.certified.location", lpVersion: "1.0.0", srs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
          locationType: "coordinate-decimal", location: { string: "-46.63, -23.55" }, name: "São Paulo, Brazil",
          createdAt: "2026-09-02T10:05:00.000Z",
        },
      },
    },
    record: {
      $type: "org.hypercerts.collection", type: "project", title: "Community seed library",
      shortDescription: "We keep heirloom seed in a shared library. Neighbours borrow seed in spring and return seed after harvest.",
      description: { $type: "org.hypercerts.defs#descriptionString", value: "We keep heirloom seed in a shared library." },
      banner: { $type: "org.hypercerts.defs#largeImage", image: blob("b", "image/jpeg", 182044) },
      items: [],
      location: place,
      langs: ["pt", "en"],
      createdAt: "2026-09-03T14:20:00.000Z",
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
