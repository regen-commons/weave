import assert from "node:assert/strict";
import { test } from "node:test";
import { browserPresence, MARK_KEY, PRESENCE_KEY } from "../src/account/presence.ts";

test("the device note holds no identity and survives blocked storage", () => {
  const kept = new Map<string, string>();
  const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); },
    removeItem: (key: string) => { kept.delete(key); } };
  const presence = browserPresence(() => storage);
  assert.equal(presence.read(), false);
  presence.write(true);
  assert.deepEqual([...kept], [[PRESENCE_KEY, "1"]], "only a marker is kept, never an account");
  assert.equal(presence.read(), true);
  presence.write(false);
  assert.equal(kept.size, 0);
  kept.set(PRESENCE_KEY, "yes");
  assert.equal(presence.read(), false, "anything but the marker is no note");

  const blocked = browserPresence(() => { throw new Error("storage is blocked"); });
  assert.equal(blocked.read(), false);
  assert.doesNotThrow(() => blocked.write(true));
  assert.doesNotThrow(() => blocked.write(false));
  assert.equal(blocked.mark(), undefined, "a device that cannot be read says so, and is never taken for unchanged");
  assert.doesNotThrow(() => blocked.move());
});

test("the device mark moves to a value with no meaning, and a device with none reads as unmoved", () => {
  const kept = new Map<string, string>();
  const storage = { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); },
    removeItem: (key: string) => { kept.delete(key); } };
  const first = browserPresence(() => storage), second = browserPresence(() => storage);
  assert.equal(first.mark(), "");
  first.move();
  const moved = first.mark();
  assert.match(moved!, /^[\da-f-]{36}$/u, "only a random value is kept");
  assert.equal(second.mark(), moved, "every tab on the device reads the same mark");
  second.move();
  assert.notEqual(first.mark(), moved);
  assert.deepEqual([...kept.keys()], [MARK_KEY]);
});
