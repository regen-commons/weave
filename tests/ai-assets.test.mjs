import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { MODEL } from "../dist/semantic-config.mjs";
import { corpusDocuments } from "../dist/matching.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url));
const funds = JSON.parse(read("dist/data/funders.json")).funds;

test("public vector release matches the exact model, corpus, all 699 identities and binary integrity", () => {
  const catalog = JSON.parse(read("dist/data/fund-vectors.json"));
  assert.deepEqual(catalog.model, MODEL);
  assert.deepEqual(
    catalog.ids,
    corpusDocuments(funds).map((d) => d.id),
  );
  assert.equal(new Set(catalog.ids.map((id) => id.split("::")[0])).size, 699);
  assert.equal(
    catalog.corpusHash,
    hash(
      JSON.stringify({
        model: MODEL,
        texts: corpusDocuments(funds),
      }),
    ),
  );
  const bytes = read("dist/data/fund-vectors.f32");
  assert.equal(hash(bytes), catalog.binarySha256);
  assert.equal(bytes.length, catalog.ids.length * 256 * 4);
  const vectors = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.length / 4,
  );
  for (let i = 0; i < catalog.ids.length; i++)
    assert.ok(
      Math.abs(Math.hypot(...vectors.subarray(i * 256, (i + 1) * 256)) - 1) <
        0.00001,
    );
});
test("pinned model inputs and outbound-inference guard remain present", () => {
  const hashes = JSON.parse(read("research/model-assets.json"));
  for (const [name, expected] of Object.entries(hashes)) {
    const path = `dist/models/${MODEL.revision}/${MODEL.id}/${name}`;
    assert.equal(hash(read(path)), expected);
  }
  assert.equal(hashes["onnx/model_quantized.onnx"], MODEL.weightsSha256);
  assert.match(read("dist/index.html").toString(), /connect-src 'self'/);
});
