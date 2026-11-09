import assert from "node:assert/strict";
import { test } from "node:test";
import { addAnswer, newDraft, revise, type AiRun } from "../src/describe/contracts.ts";
import { assistantExport, deviceExport } from "../src/data/export.ts";
const file = (name: string, bytes: Uint8Array) => {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
  return { id: crypto.randomUUID(), name, type: blob.type, bytes: blob.size, blob };
};
const encode = async (blob: Blob) =>
  `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
test("device export retains unfinished words, original file bytes from every step, and backups", async () => {
  const source = addAnswer(newDraft(), "Unfinished source words stay in the device export.");
  const draft = revise(
    source,
    {
      composer: "Words not submitted yet",
      attachments: [file("initiative.bin", new Uint8Array([0, 255, 77]))],
      needs: { ...source.needs, attachments: [file("need.bin", new Uint8Array([7]))] },
      offers: { ...source.offers, attachments: [file("offer.bin", new Uint8Array([8]))] },
    },
    true,
  );
  const backup = revise(
    newDraft(),
    { composer: "Earlier draft", attachments: [file("unread.bin", new Uint8Array([9]))] },
    true,
  );
  const result = await deviceExport(draft, [{ key: "backup-one", draft: backup }], "dark", encode);
  assert.equal(result.scope, "this-device");
  assert.equal(result.current.composer, "Words not submitted yet");
  assert.equal(result.current.turns[0]!.text, "Unfinished source words stay in the device export.");
  assert.equal(result.current.attachments[0]!.blob.data, "data:application/octet-stream;base64,AP9N");
  assert.equal(result.current.needs.attachments[0]!.blob.data, "data:application/octet-stream;base64,Bw==");
  assert.equal(result.current.offers.attachments[0]!.blob.data, "data:application/octet-stream;base64,CA==");
  assert.equal(
    result.backups[0]!.draft.attachments[0]!.blob.data,
    "data:application/octet-stream;base64,CQ==",
  );
  assert.equal(result.backups[0]!.draft.composer, "Earlier draft");
  assert.equal(result.theme, "dark");
  assert.ok(draft.attachments[0]!.blob instanceof Blob);
});
test("a failed file read rejects the export without discarding its source", async () => {
  const draft = revise(
    newDraft(),
    { composer: "Keep these words", attachments: [file("source.bin", new Uint8Array([1, 2, 3]))] },
    true,
  );
  await assert.rejects(
    deviceExport(draft, [], "system", async () => {
      throw new Error("Read failed");
    }),
    /Read failed/,
  );
  assert.equal(draft.composer, "Keep these words");
  assert.deepEqual(new Uint8Array(await draft.attachments[0]!.blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
});
test("assistant export explicitly selects metadata and cannot copy added source text", () => {
  const run = {
    id: crypto.randomUUID(),
    step: "initiative",
    engine: "keywords",
    model: "Keyword draft",
    at: "2026-11-05T12:00:00.000Z",
    words: 8,
    cloudWords: 0,
    status: "complete",
    latencyMs: 10,
    sourceText: "Do not put this in the ledger",
  } as AiRun & { sourceText: string };
  const result = assistantExport([run]);
  assert.equal(result.cloudWords, 0);
  assert.equal(result.runs[0]!.words, 8);
  assert.ok(!JSON.stringify(result).includes("Do not put this in the ledger"));
  assert.ok(!Object.hasOwn(result.runs[0]!, "sourceText"));
});
