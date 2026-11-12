import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountFailure } from "../src/account/client.ts";
import { signOut } from "../src/account/sign-out.ts";

/** Runs a sign-out whose request ends as given, and says how often the screen was cleared. */
async function attempt(end: () => Promise<unknown>) {
  let cleared = 0;
  const result = await signOut(end, () => {
    cleared++;
  });
  return { result, cleared };
}

test("a confirmed sign-out clears the person from the screen, after the server has answered", async () => {
  const order: string[] = [];
  const result = await signOut(
    async () => {
      order.push("asked");
    },
    () => {
      order.push("cleared");
    },
  );
  assert.deepEqual(order, ["asked", "cleared"], "the screen never says signed out before the server does");
  assert.deepEqual([result.failed, result.cleared], [false, true]);
  assert.match(result.message, /^You are signed out\./);
});

test("a session that had already ended clears the screen too, and says what happened", async () => {
  const { result, cleared } = await attempt(async () => {
    throw new AccountFailure("sign_in_required");
  });
  assert.equal(cleared, 1, "nobody is signed in, so the screen must not say so");
  assert.deepEqual([result.failed, result.cleared], [true, true]);
  assert.match(result.message, /session ended/);
});

test("any other failure leaves the person shown as signed in, with a reason they can act on", async () => {
  const failures: unknown[] = [
    new AccountFailure("connection_failed"),
    new AccountFailure("sign_out_unconfirmed"),
    new AccountFailure("rate_limited"),
    new AccountFailure("account_unavailable"),
    new Error("The request did not finish."),
    "not an error at all",
  ];
  for (const failure of failures) {
    const { result, cleared } = await attempt(async () => {
      throw failure;
    });
    assert.equal(cleared, 0, `they may still be signed in after ${String(failure)}`);
    assert.deepEqual([result.failed, result.cleared], [true, false]);
    assert.ok(result.message.length > 20, "it says what happened in a sentence");
    assert.doesNotMatch(result.message, /_/, "never a bare error code");
  }
});
