export const CERTIFIED_ISSUER = "https://certified.one";
export function identitySubject(issuer: string, did: string, session: unknown): string {
  if (issuer !== CERTIFIED_ISSUER || !/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(did) || did.length > 2048 ||
      !session || typeof session !== "object" || !("did" in session) || session.did !== did)
    throw new Error("invalid_certified_identity");
  return `${issuer}|${did}`;
}
export function identityClaims(subject: string): { sub: string } {
  const prefix = `${CERTIFIED_ISSUER}|`;
  if (!subject.startsWith(prefix)) throw new Error("invalid_certified_subject");
  const did = subject.slice(prefix.length);
  identitySubject(CERTIFIED_ISSUER, did, { did });
  return { sub: subject };
}
