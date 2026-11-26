/** Explicit dev-server fixture. Never imported by API entries or production bundles. */
import { createSignInHandlers } from "@weave/api/sign-in";
import type { SignInAttempt } from "../../api/src/sign-in-store.ts";
import { createAccountHandlers } from "@weave/api/account";
import { AccountError, type AccountProvider } from "../../api/src/account-provider.ts";
import { certifiedEmailHints } from "../../api/src/certified/email-hint.ts";
import type { DeletedInitiative, SavedInitiative } from "@weave/api/account-contract";
const sessions = new Map<string, string>();
/** Refresh tokens rotate on use, as Supabase's do; a used or revoked one is refused. */
const renewals = new Map<string, { id: string; token: string; signedInAt: number }>();
/** Renewals keep the original sign-in time in `amr`, as Supabase does, so the 30-day cap applies locally too. */
const issue = (id: string, signedInAt = Math.floor(Date.now() / 1000)) => {
  const token = fixtureSession(id, signedInAt), refreshToken = `fixture-refresh-${crypto.randomUUID()}`;
  renewals.set(refreshToken, { id, token, signedInAt });
  return { token, expiresIn: 3600, refreshToken };
};
const records = new Map<string, { owner: string; saved: SavedInitiative }>();
const requests = new Map<string, { input: string; saved: SavedInitiative }>();
/** Removed IDs stay reserved, as in the database candidate, so a stale first save cannot bring a card back. */
const removed = new Map<string, { owner: string; requestId: string; deleted: DeletedInitiative }>();
/**
 * Whether anything else still refers to a card, such as a project link or a support listing. The project
 * and matching fixtures register it, so deletion refuses as the database does
 * (weave-initiative-deletion-stale-references.sql), with one generic code whatever the reference is.
 */
let referenced: (id: string) => boolean = () => false;
export function fixtureReferences(check: (id: string) => boolean) { referenced = check; }
const owner = (token: string) => {
  const id = sessions.get(token);
  if (!id) throw new AccountError(401, "sign_in_required");
  return id;
};
export const FIXTURE_ACCOUNT_ID = "b1000000-0000-4000-8000-000000000001";
export function fixtureSession(id = FIXTURE_ACCOUNT_ID, signedInAt = Math.floor(Date.now() / 1000)) {
  // Shaped like Supabase's token, with a one-hour `exp` and the sign-in time in `amr`, so /api/account renews it
  // on the real schedule and stops at the real cap.
  const claims = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600,
    amr: [{ method: "oauth", timestamp: signedInAt }] })).toString("base64url");
  const token = `fixture.${claims}.${crypto.randomUUID()}`;
  sessions.set(token, id);
  return token;
}
export function fixtureActor(token: string) {
  return { userId: owner(token), sessionId: "synthetic", did: "did:plc:synthetic" };
}
export function fixtureInitiative(token: string, id: string) {
  const account = owner(token);
  const row = records.get(id);
  if (!row || row.owner !== account) throw new AccountError(404, "not_found");
  return { account, saved: row.saved };
}
const provider: AccountProvider = {
  signInUrl(_challenge, callback) {
    const url = new URL(callback); url.searchParams.set("code", "synthetic-certified"); return url.href;
  },
  async exchangeCode(code) {
    if (code !== "synthetic-certified") throw new AccountError(401, "sign_in_failed");
    return issue(process.env.WEAVE_ACCOUNT_FIXTURE_USER_ID ?? FIXTURE_ACCOUNT_ID);
  },
  async renew(refreshToken) {
    const renewal = renewals.get(refreshToken);
    if (!renewal) throw new AccountError(401, "sign_in_required");
    renewals.delete(refreshToken);
    return issue(renewal.id, renewal.signedInAt);
  },
  async authorize(token) {
    const id = owner(token);
    return { id, email: null };
  },
  async signOut(token) {
    sessions.delete(token);
    for (const [refreshToken, renewal] of renewals) if (renewal.token === token) renewals.delete(refreshToken);
  },
  async list(token, offset) {
    const id = owner(token);
    return [...records.values()]
      .filter((row) => row.owner === id)
      .map(({ saved }) => ({
        id: saved.id,
        revision: saved.revision,
        name: String(saved.document.initiative.name),
        updatedAt: saved.updatedAt,
      }))
      .slice(offset, offset + 20);
  },
  async load(token, id) {
    return fixtureInitiative(token, id).saved;
  },
  async save(token, command) {
    const id = owner(token),
      key = `${id}:${command.requestId}`,
      input = JSON.stringify(command),
      previous = requests.get(key);
    if (previous) {
      if (previous.input !== input) throw new AccountError(409, "save_conflict");
      return previous.saved;
    }
    const row = records.get(command.id);
    if (row && row.owner !== id) throw new AccountError(404, "not_found");
    if (!row && removed.has(command.id))
      throw new AccountError(command.expectedRevision === 0 ? 409 : 404, command.expectedRevision === 0 ? "initiative_deleted" : "not_found");
    if ((row?.saved.revision ?? 0) !== command.expectedRevision) throw new AccountError(409, "save_conflict");
    const saved = {
      id: command.id,
      revision: command.expectedRevision + 1,
      document: command.document,
      updatedAt: new Date().toISOString(),
    };
    records.set(saved.id, { owner: id, saved });
    requests.set(key, { input, saved });
    return saved;
  },
  async deleteInitiative(token, command) {
    const id = owner(token), row = records.get(command.id);
    if (!row || row.owner !== id) {
      const previous = removed.get(command.id);
      if (previous?.owner === id && previous.requestId === command.requestId && previous.deleted.revision === command.expectedRevision)
        return previous.deleted;
      throw new AccountError(404, "not_found");
    }
    if (row.saved.revision !== command.expectedRevision) throw new AccountError(409, "save_conflict");
    if (referenced(command.id)) throw new AccountError(409, "initiative_referenced");
    records.delete(command.id);
    for (const [key, request] of requests) if (key.startsWith(`${id}:`) && request.saved.id === command.id) requests.delete(key);
    const deleted: DeletedInitiative = { id: command.id, deleted: true, revision: command.expectedRevision, removed: [command.id],
      kept: [...records.values()].filter((item) => item.owner === id).length };
    removed.set(command.id, { owner: id, requestId: command.requestId, deleted });
    return deleted;
  },
};
export const accountFixture = createAccountHandlers({
  provider,
  secureCookies: false,
  fixture: true,
  emailHintAvailable: true,
});

const attempts = new Map<string, SignInAttempt>();
const emailHints = certifiedEmailHints(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"));
export const signInFixture = (origin: string) => createSignInHandlers({
  origin, secureCookies: false, provider, emailHints,
  store: {
    async put(id, attempt) { attempts.set(id, attempt); },
    async take(id) { const attempt = attempts.get(id); attempts.delete(id); return attempt; },
  },
});
