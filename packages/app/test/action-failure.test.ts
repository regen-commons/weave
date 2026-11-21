import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountFailure, accountRequest, type AccountState } from "../src/account/client.ts";
import { settleActionFailure } from "../src/account/action-failure.ts";
import { AccountSession } from "../src/account/session.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const response = (id: string | null) => ({ available: true, signIn: "certified", user: id ? { id, email: null } : null, items: [] });
const failure = (code: string) => new AccountFailure(code);

test("a save that finds the session ended clears the screen and leaves the saying to the page's notice", async () => {
  const session = new AccountSession(async () => response(owner));
  await session.refresh();
  const settled = await settleActionFailure(failure("sign_in_required"), { refresh: session.refresh, clear: session.clear });
  assert.deepEqual(settled, { message: "", reset: false }, "one message, the page's, never a second one here");
  assert.equal(session.getSnapshot()?.user, null);
  assert.equal(session.getEnding(), "ended");
});

test("a check after account_changed that fails for a network reason keeps the person signed in, with no notice", async () => {
  let online = true;
  const request: typeof accountRequest = async () => { if (!online) throw failure("connection_failed"); return response(owner); };
  const session = new AccountSession(request);
  await session.refresh();
  online = false;
  let cleared = 0;
  const settled = await settleActionFailure(failure("account_changed"), {
    refresh: session.refresh, clear: () => { cleared++; session.clear(); } });
  assert.equal(cleared, 0);
  assert.equal(session.getSnapshot()?.user?.id, owner);
  assert.equal(session.getEnding(), null);
  assert.equal(settled.reset, true);
  assert.match(settled.message, /^The connection failed\./u, "says what went wrong, not that they were signed out");
});

test("a check after account_changed that finds the session ended shows only the page's notice", async () => {
  let ended = false;
  const session = new AccountSession(async () => { if (ended) throw failure("sign_in_required"); return response(owner); });
  await session.refresh();
  ended = true;
  const settled = await settleActionFailure(failure("account_changed"), { refresh: session.refresh, clear: session.clear });
  assert.deepEqual(settled, { message: "", reset: true });
  assert.equal(session.getEnding(), "ended", "the check itself cleared the screen and noted why");
});

test("a check after account_changed that succeeds says the account changed; other failures say their own reason", async () => {
  const fine = async (): Promise<AccountState> => ({ available: true, fixture: false, user: { id: owner, email: null }, items: [] });
  let cleared = 0;
  const changed = await settleActionFailure(failure("account_changed"), { refresh: fine, clear: () => { cleared++; } });
  assert.equal(changed.reset, true);
  assert.match(changed.message, /account changed in another tab/u);
  const conflict = await settleActionFailure(failure("save_conflict"), { refresh: fine, clear: () => { cleared++; } });
  assert.deepEqual([conflict.reset, cleared], [false, 0]);
  assert.match(conflict.message, /changed elsewhere/u);
});
