// Certified project addresses. Free of Node APIs so the app can validate them too.
export const PROJECT_COLLECTION = "org.hypercerts.collection";
export const PROJECT_DID = /^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9][A-Za-z0-9._:%-]{0,252})$/u;
const recordKey = /^[A-Za-z0-9._:~-]{1,128}$/u;

export function parseProjectUri(value: unknown): { uri: string; did: string } {
  if (typeof value !== "string" || !value.startsWith("at://")) throw Error("invalid_project_uri");
  const [actor, nsid, key, ...rest] = value.slice(5).split("/");
  if (!actor || !PROJECT_DID.test(actor) || nsid !== PROJECT_COLLECTION || !key || !recordKey.test(key)
    || key === "." || key === ".." || rest.length) throw Error("invalid_project_uri");
  return { uri: value, did: actor };
}
