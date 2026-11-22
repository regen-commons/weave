// Certified project addresses. Free of Node APIs so the app can validate them too.
export const PROJECT_COLLECTION = "org.hypercerts.collection";
export const PROJECT_DID = /^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9][A-Za-z0-9._:%-]{0,252})$/u;
const recordKey = /^[A-Za-z0-9._:~-]{1,128}$/u;

export function parseProjectUri(value: unknown): { uri: string; did: string } {
  const parsed = recordUri(value, PROJECT_COLLECTION);
  if (!parsed) throw Error("invalid_project_uri");
  return parsed;
}

/** A record's DID-based address in one collection, such as an activity or a work scope tag, or null. */
export function recordUri(value: unknown, collection: string): { uri: string; did: string } | null {
  if (typeof value !== "string" || !value.startsWith("at://")) return null;
  const [actor, nsid, key, ...rest] = value.slice(5).split("/");
  if (!actor || !PROJECT_DID.test(actor) || nsid !== collection || !key || !recordKey.test(key)
    || key === "." || key === ".." || rest.length) return null;
  return { uri: value, did: actor };
}
