import assert from "node:assert/strict";
import { test } from "node:test";
import { reusableWorker, WorkerProblem, type WorkerLike } from "../src/describe/reusable-worker.ts";

/** A stand-in worker that answers each message by echoing its id, after a hold the test controls. */
class FakeWorker extends EventTarget implements WorkerLike {
  static made: FakeWorker[] = [];
  terminated = false;
  received: { id: number; text?: string }[] = [];
  hold = false;
  constructor() {
    super();
    FakeWorker.made.push(this);
  }
  postMessage(message: unknown): void {
    const value = message as { id: number; text?: string };
    this.received.push(value);
    if (!this.hold) queueMicrotask(() => this.answer(value.id));
  }
  answer(id: number, extra: Record<string, unknown> = {}): void {
    const event = new Event("message") as Event & { data: unknown };
    event.data = { ok: true, id, ...extra };
    this.dispatchEvent(event);
  }
  fail(): void {
    this.dispatchEvent(new Event("error"));
  }
  terminate(): void {
    this.terminated = true;
  }
}
const fresh = () => {
  FakeWorker.made = [];
  return reusableWorker(() => new FakeWorker());
};
const live = () => new AbortController().signal;

test("one worker answers every reading, so only the first pays for starting it", async () => {
  const reader = fresh();
  for (const text of ["first", "second", "third"]) {
    const reply = (await reader.run({ text }, live())) as { ok: boolean; id: number };
    assert.equal(reply.ok, true);
  }
  assert.equal(FakeWorker.made.length, 1);
  assert.deepEqual(FakeWorker.made[0]!.received.map((message) => message.text), ["first", "second", "third"]);
  // Warming ahead of the first reading starts the same one worker.
  const warmed = fresh();
  warmed.warm();
  warmed.warm();
  await warmed.run({ text: "after warming" }, live());
  assert.equal(FakeWorker.made.length, 1);
});

test("readings go one at a time, and a late reply is never taken for the next reading", async () => {
  const reader = fresh();
  reader.warm();
  const worker = FakeWorker.made[0]!;
  worker.hold = true;
  const first = reader.run({ text: "first" }, live());
  const second = reader.run({ text: "second" }, live());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(worker.received.length, 1, "the second waits for the first");
  // A reply naming no message the page is waiting for changes nothing.
  worker.answer(99, { result: "stale" });
  worker.answer(worker.received[0]!.id, { result: "one" });
  assert.equal(((await first) as { result: string }).result, "one");
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.answer(worker.received[1]!.id, { result: "two" });
  assert.equal(((await second) as { result: string }).result, "two");
});

test("a stopped or failed reading ends its worker, and the next reading starts a new one", async () => {
  const reader = fresh();
  reader.warm();
  const stuck = FakeWorker.made[0]!;
  stuck.hold = true;
  const stop = new AbortController();
  const stopped = reader.run({ text: "long" }, stop.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop.abort();
  await assert.rejects(stopped, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(stuck.terminated, true);
  await reader.run({ text: "again" }, live());
  assert.equal(FakeWorker.made.length, 2);

  const broken = FakeWorker.made[1]!;
  broken.hold = true;
  const failing = reader.run({ text: "breaks" }, live());
  await new Promise((resolve) => setTimeout(resolve, 0));
  broken.fail();
  await assert.rejects(failing, (error: unknown) => error instanceof WorkerProblem && error.stage === "start");
  assert.equal(broken.terminated, true);
  await reader.run({ text: "recovered" }, live());
  assert.equal(FakeWorker.made.length, 3);
  // A reading already stopped never starts a worker.
  const before = FakeWorker.made.length;
  await assert.rejects(reader.run({ text: "late" }, AbortSignal.abort()));
  assert.equal(FakeWorker.made.length, before);
});

test("closing ends the worker and any reading under way, and a worker that cannot start says so", async () => {
  const reader = fresh();
  reader.warm();
  const worker = FakeWorker.made[0]!;
  worker.hold = true;
  const waiting = reader.run({ text: "leaving" }, live());
  await new Promise((resolve) => setTimeout(resolve, 0));
  reader.close();
  await assert.rejects(waiting, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(worker.terminated, true);

  const refused = reusableWorker(() => {
    throw new Error("blocked by the page's policy");
  });
  refused.warm();
  await assert.rejects(refused.run({}, live()), (error: unknown) => error instanceof WorkerProblem && error.stage === "start");
});
