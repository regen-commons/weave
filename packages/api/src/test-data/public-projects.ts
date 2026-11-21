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
  /** The publisher organization's `longDescription`, as the record holds it. */
  organizationDescription?: unknown;
  /** Activity addresses the collection lists as items, in order. */
  activities?: string[];
};
export const placeUri = (n: number) => `at://${projectDid(n)}/app.certified.location/place${n}`;
export const placeCid = (n: number) => `bafyrei${"p".repeat(36)}${letters(n)}aaaa`;
export function projectView(n: number, options: ViewOptions = {}) {
  const did = projectDid(n);
  const listed = options.unlisted === "organization" ? { visibility: "unlisted" }
    : options.unlisted === "legacy" ? { unlisted: true } : {};
  const organization = options.unlisted === "organization" || options.unlisted === "legacy" || options.organizationTypes !== undefined
    || options.organizationDescription !== undefined ? {
      did, uri: `at://${did}/app.certified.actor.organization/self`,
      record: { $type: "app.certified.actor.organization", ...listed,
        ...(options.organizationTypes === undefined ? {} : { organizationType: options.organizationTypes }),
        ...(options.organizationDescription === undefined ? {} : { longDescription: options.organizationDescription }) },
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
      ...(options.activities === undefined ? {}
        : { items: options.activities.map((uri) => ({ itemIdentifier: { uri, cid: `bafyrei${"a".repeat(52)}` } })) }),
    },
  };
}

/** An activity in project `n`'s own repository, or in another account's where `did` names one. */
export const activityUri = (n: number, did = projectDid(n)) => `at://${did}/org.hypercerts.claim.activity/activity${n}`;
/** A tag in a shared vocabulary repository, as most listed projects used on 21 November 2026. */
export const tagUri = (key: string, did = "did:plc:fixturevocabularyaaaaaaa") =>
  `at://${did}/org.hypercerts.workscope.tag/${key.replace(/[^A-Za-z0-9]/gu, "")}`;
/** An activity whose structured work scope uses these tags. */
export const activityRecord = (tags: readonly string[]) => ({
  $type: "org.hypercerts.claim.activity", title: "Wetland work", shortDescription: "We restore wetlands.",
  createdAt: "2026-10-01T12:00:00Z",
  workScope: {
    $type: "org.hypercerts.workscope.cel", version: "v1", createdAt: "2026-10-01T12:00:00Z",
    expression: `scope.hasAll([${tags.map((uri) => `'${uri.split("/").pop()}'`).join(", ")}])`,
    usedTags: tags.map((uri) => ({ uri, cid: `bafyrei${"t".repeat(52)}` })),
  },
});
export const tagRecord = (key: string, name = key) =>
  ({ $type: "org.hypercerts.workscope.tag", key, name, category: "topic", createdAt: "2026-10-01T12:00:00Z" });
/** How the index answered a record it had not indexed on 21 November 2026: a 500 that names RecordNotFound. */
/** The index's answer for an activity or tag it has not indexed, as it was on 21 November 2026. */
export const notIndexed = (lookup: "activity" | "workscopeTag") => Response.json({
  error: "script_error", errorType: "runtime", line: null,
  message: `runtime error: RecordNotFound: ${lookup === "activity" ? "activity record" : "work-scope tag"} is not indexed`
    + "\nstack traceback:\n\t[C]: in function 'error'",
  method: lookup === "activity" ? "org.hypercerts.claim.getActivity" : "org.hypercerts.workscope.getWorkscopeTag",
}, { status: 500 });

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
  /**
   * The activities and tags the index holds, by address. A record answers as the index's view of it, and a
   * function answers in its place, such as with an outage. An address it does not hold is not indexed.
   */
  activities?: Map<string, unknown>;
  tags?: Map<string, unknown>;
  /** Every activity and tag address looked up, in order. */
  lookups?: string[];
}) {
  let page = 0;
  return async (url: string | URL | Request): Promise<Response> => {
    const target = new URL(String(url));
    const lookup = target.pathname.endsWith("/org.hypercerts.claim.getActivity") ? "activity"
      : target.pathname.endsWith("/org.hypercerts.workscope.getWorkscopeTag") ? "workscopeTag" : null;
    if (lookup) {
      const uri = target.searchParams.get("uri") ?? "";
      state.lookups?.push(uri);
      const held = (lookup === "activity" ? state.activities : state.tags)?.get(uri);
      if (typeof held === "function") return held() as Response;
      if (held === undefined) return notIndexed(lookup);
      const did = uri.split("/")[2];
      return Response.json({ [lookup]: {
        uri, cid: `bafyrei${"v".repeat(52)}`, did, indexedAt: "2026-11-20T00:00:00Z", author: { did }, record: held,
      } });
    }
    const params = target.searchParams;
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
