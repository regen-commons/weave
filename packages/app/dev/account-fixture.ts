/** Explicit dev-server fixture. Never imported by API entries or production bundles. */
import { createSignInHandlers } from "@weave/api/sign-in";
import type { SignInAttempt } from "../../api/src/sign-in-store.ts";
import { createAccountHandlers } from "@weave/api/account";
import { AccountError, type AccountProvider } from "../../api/src/account-provider.ts";
import { certifiedEmailHints } from "../../api/src/certified/email-hint.ts";
import type { SavedInitiative } from "@weave/api/account-contract";
const sessions = new Map<string, string>();
const records = new Map<string, { owner: string; saved: SavedInitiative }>();
const requests = new Map<string, { input: string; saved: SavedInitiative }>();
const owner = (token: string) => {
  const id = sessions.get(token);
  if (!id) throw new AccountError(401, "sign_in_required");
  return id;
};
export const FIXTURE_ACCOUNT_ID = "b1000000-0000-4000-8000-000000000001";
export function fixtureSession(id = FIXTURE_ACCOUNT_ID) {
  const token = `fixture.${id}.${crypto.randomUUID()}`;
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
    return { token: fixtureSession(process.env.WEAVE_ACCOUNT_FIXTURE_USER_ID ?? FIXTURE_ACCOUNT_ID), expiresIn: 3600 };
  },
  async authorize(token) {
    const id = owner(token);
    return { id, email: null };
  },
  async signOut(token) {
    sessions.delete(token);
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
