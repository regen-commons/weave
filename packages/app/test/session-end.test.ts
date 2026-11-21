import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountFailure, accountRequest, type AccountState } from "../src/account/client.ts";
import { AccountSession, type ConnectSession, type SessionChange } from "../src/account/session.ts";
import { confirmRefusal, RefusalRetries, SESSION_ENDED_NOTICE, sessionEndedNotice, withConfirmedSession } from "../src/account/session-end.ts";
import { signOut } from "../src/account/sign-out.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const other = "b1000000-0000-4000-8000-000000000002";
const response = (id: string | null) => ({ available: true, signIn: "certified", user: id ? { id, email: null } : null, items: [] });
const signedIn = (id: string | null): AccountState => ({ available: true, fixture: false, user: id ? { id, email: null } : null, items: [] });
const refused = () => new AccountFailure("sign_in_required");
function tabs() {
  const receivers = new Set<(change: SessionChange) => void>();
  const connect: ConnectSession = (receive) => {
    receivers.add(receive);
    return { publish(change) { for (const next of receivers) if (next !== receive) next(change); }, close() { receivers.delete(receive); } };
  };
  return connect;
}

test("the notice says the person was signed out and that their card stays", () => {
  assert.equal(SESSION_ENDED_NOTICE, "You were signed out. Your card is still here.");
  assert.doesNotMatch(SESSION_ENDED_NOTICE, /—|->|→/u);
});

test("a refusal from another endpoint is retried once when /api/account still has the session", async () => {
  assert.deepEqual(await confirmRefusal(async () => signedIn(owner), owner, false), { outcome: "retry" });
  const again = await confirmRefusal(async () => signedIn(owner), owner, true);
  assert.equal(again.outcome, "unconfirmed", "a second refusal after a renewal is shown, never looped or read as an ending");
  assert.equal(again.outcome === "unconfirmed" && again.error instanceof AccountFailure && again.error.code, "account_unavailable");
});

test("a refusal is an ended session only when /api/account says so", async () => {
  assert.deepEqual(await confirmRefusal(async () => { throw refused(); }, owner, false), { outcome: "ended" });
  assert.deepEqual(await confirmRefusal(async () => signedIn(null), owner, false), { outcome: "ended" });
  assert.deepEqual(await confirmRefusal(async () => signedIn(other), owner, false), { outcome: "ended" },
    "another account in its place means this owner's session is over here");
});

test("a refusal that cannot be checked keeps the person signed in and says why", async () => {
  const offline = new AccountFailure("connection_failed");
  assert.deepEqual(await confirmRefusal(async () => { throw offline; }, owner, false), { outcome: "unconfirmed", error: offline });
  const down = await confirmRefusal(async () => ({ available: false, fixture: false, user: null, items: [] }), owner, false);
  assert.equal(down.outcome, "unconfirmed");
});

test("a session that ends without Sign Out is noted as ended, and Sign Out as signed out", async () => {
  let answer: () => Record<string, unknown> = () => response(owner);
  const session = new AccountSession(async () => answer());
  await session.refresh();
  assert.equal(session.getEnding(), null);
  answer = () => { throw refused(); };
  await assert.rejects(session.refresh());
  assert.equal(session.getSnapshot()?.user, null);
  assert.equal(session.getEnding(), "ended");

  answer = () => response(owner);
  await session.refresh();
  assert.equal(session.getEnding(), null, "signing in again puts the note away");
  const result = await signOut(async () => {}, session.signedOut);
  assert.equal(result.cleared, true);
  assert.equal(session.getEnding(), "signed_out");
  session.acknowledgeEnding();
  assert.equal(session.getEnding(), null);
});

test("a server answer without the account, and another tab's sign-out, are endings too", async () => {
  let id: string | null = owner;
  const connect = tabs();
  const first = new AccountSession(async () => response(id)), second = new AccountSession(async () => response(id));
  const closeFirst = first.connect(connect), closeSecond = second.connect(connect);
  await Promise.all([first.refresh(), second.refresh()]);
  id = null;
  await first.refresh();
  assert.equal(first.getEnding(), "ended", "renewal refused with a plain signed-out answer");
  id = owner;
  await Promise.all([first.refresh(), second.refresh()]);
  await signOut(async () => {}, first.signedOut);
  assert.equal(first.getEnding(), "signed_out");
  assert.equal(second.getEnding(), "ended", "the other tab did not press Sign Out, so it says what happened");
  closeFirst(); closeSecond();
});

test("a first check that finds nobody signed in, or an unavailable account service, notes no ending", async () => {
  const nobody = new AccountSession(async () => response(null));
  await nobody.refresh();
  assert.equal(nobody.getEnding(), null);
  let available = true;
  const session = new AccountSession(async () => available ? response(owner) : { available: false });
  await session.refresh();
  available = false;
  await session.refresh();
  assert.equal(session.getSnapshot()?.user, null);
  assert.equal(session.getEnding(), null);
});

test("refusals that arrive together share one /api/account check and keep a renewed session", async () => {
  let calls = 0;
  const request: typeof accountRequest = async () => { calls++; return response(owner); };
  const session = new AccountSession(request);
  await session.refresh();
  calls = 0;
  const outcomes = await Promise.all([1, 2, 3].map(() => confirmRefusal(session.confirm, owner, false)));
  assert.deepEqual(outcomes.map(({ outcome }) => outcome), ["retry", "retry", "retry"]);
  assert.equal(calls, 1);
  assert.equal(session.getSnapshot()?.user?.id, owner);
  assert.equal(session.getEnding(), null);
});

test("a check started meanwhile does not turn a confirmation into a failure", async () => {
  let calls = 0;
  const gates: (() => void)[] = [];
  const request: typeof accountRequest = async () => {
    calls++;
    if (calls > 1) await new Promise<void>(resolve => gates.push(resolve));
    return response(owner);
  };
  const session = new AccountSession(request);
  await session.refresh();
  const confirming = confirmRefusal(session.confirm, owner, false);
  const scheduled = session.refresh();
  for (let round = 0; round < 3; round++) {
    await new Promise<void>(resolve => setImmediate(resolve));
    for (const open of gates.splice(0)) open();
  }
  await scheduled;
  assert.deepEqual(await confirming, { outcome: "retry" });
});

test("a refusal confirmed as ended clears the screen once, with the ended note", async () => {
  let ended = false;
  const session = new AccountSession(async () => { if (ended) throw refused(); return response(owner); });
  await session.refresh();
  ended = true;
  assert.deepEqual(await confirmRefusal(session.confirm, owner, false), { outcome: "ended" });
  assert.equal(session.getSnapshot()?.user, null);
  assert.equal(session.getEnding(), "ended");
});

test("a request refused for a lapsed token runs once more after /api/account renews it", async () => {
  let runs = 0, checks = 0;
  const result = await withConfirmedSession(async () => {
    if (++runs === 1) throw refused();
    return "matched";
  }, async () => { checks++; return signedIn(owner); }, owner);
  assert.equal(result, "matched");
  assert.deepEqual([runs, checks], [2, 1]);
});

test("a request refused again after a renewal is not looped and does not end the session", async () => {
  let runs = 0;
  await assert.rejects(withConfirmedSession(async () => { runs++; throw refused(); }, async () => signedIn(owner), owner),
    (error: unknown) => error instanceof AccountFailure && error.code === "account_unavailable");
  assert.equal(runs, 2);
});

test("a confirmed ending is passed on as sign_in_required; other failures pass through unchecked", async () => {
  await assert.rejects(withConfirmedSession(async () => { throw refused(); }, async () => { throw refused(); }, owner),
    (error: unknown) => error instanceof AccountFailure && error.code === "sign_in_required");
  let checks = 0;
  await assert.rejects(withConfirmedSession(async () => { throw new AccountFailure("not_found"); },
    async () => { checks++; return signedIn(owner); }, owner),
  (error: unknown) => error instanceof AccountFailure && error.code === "not_found");
  assert.equal(checks, 0);
});

test("a page retries a refusal heard after the fact once a minute at most", () => {
  let now = 0;
  const retries = new RefusalRetries(() => now);
  assert.equal(retries.recent(), false);
  retries.retrying();
  now = 59_000;
  assert.equal(retries.recent(), true);
  now = 61_000;
  assert.equal(retries.recent(), false);
});

test("the ended notice shows on the page where the session ended, until the person moves on or signs in", () => {
  const first = sessionEndedNotice("ended", null, "/your-initiative");
  assert.deepEqual(first, { text: SESSION_ENDED_NOTICE, endedOn: "/your-initiative", acknowledge: false });
  assert.equal(sessionEndedNotice("ended", "/your-initiative", "/your-initiative").text, SESSION_ENDED_NOTICE);
  const moved = sessionEndedNotice("ended", "/your-initiative", "/funding");
  assert.deepEqual([moved.text, moved.acknowledge], ["", true]);
  assert.deepEqual(sessionEndedNotice(null, "/your-initiative", "/your-initiative"), { text: "", endedOn: null, acknowledge: false });
});

test("Sign Out keeps its own message: a signed-out ending shows no notice here", () => {
  assert.equal(sessionEndedNotice("signed_out", null, "/settings").text, "");
  assert.equal(sessionEndedNotice("signed_out", "/settings", "/funding").acknowledge, true);
});

test("a refusal during a scheduled renewal joins it, so the renewal is neither aborted nor the session cleared", async () => {
  const signals: AbortSignal[] = [];
  let release: (() => void) | undefined;
  const request: typeof accountRequest = async (_path, _body, _endpoint, signal) => {
    signals.push(signal!);
    if (signals.length > 1) await new Promise<void>(resolve => { release = resolve; });
    return { ...response(owner), renewIn: 300 };
  };
  let scheduled: (() => void) | undefined;
  const session = new AccountSession(request, { set: run => { scheduled = run; return 1; }, clear() {} }, () => 0);
  const close = session.connect(tabs());
  await session.refresh();
  // The schedule fires: a renewal is under way, and Supabase may already have rotated the refresh token.
  scheduled!();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(signals.length, 2);
  const outcome = confirmRefusal(session.confirm, owner, false);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(signals.length, 2, "the refusal asks no second question");
  assert.equal(signals[1]!.aborted, false, "the renewal in flight is never aborted");
  release!();
  assert.deepEqual(await outcome, { outcome: "retry" });
  assert.equal(session.getSnapshot()?.user?.id, owner);
  assert.equal(session.getEnding(), null);
  close();
});
