import {loadScreening,validateScreening} from './screening-validation.mjs';
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { MODEL, unitVector } from "../dist/semantic-config.mjs";
import { corpusDocuments } from "../dist/matching.mjs";
const root = new URL("../", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const file = (path) => new URL(path, root);
const json = async (path) => JSON.parse(await readFile(file(path), "utf8"));
const modelBase = `dist/models/${MODEL.revision}/${MODEL.id}/`;
const assetHashes = await json("research/model-assets.json");
const modelFiles = [
  "config.json",
  "config_sentence_transformers.json",
  "modules.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.txt",
  "1_Pooling/config.json",
  "onnx/model_quantized.onnx",
];
await mkdir(file("dist/assets/ort/"), { recursive: true });
for (const name of modelFiles) {
  const path = modelBase + name;
  let exists = false;
  try {
    exists = (await stat(file(path))).size > 0;
  } catch {}
  if (exists) exists = hash(await readFile(file(path))) === assetHashes[name];
  if (!exists) {
    console.log(`Fetching pinned public model asset: ${name}`);
    const response = await fetch(
      `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/${name}`,
      { signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok)
      throw new Error(`Model download failed: ${name}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== assetHashes[name])
      throw new Error(`Model asset failed integrity verification: ${name}`);
    await mkdir(new URL(".", file(path)), { recursive: true });
    await writeFile(file(path), bytes);
  }
}
// External WASM is always same-origin. One thread works without COOP/COEP.
await build({
  entryPoints: [file("src/embedding-runtime.js").pathname],
  outfile: file("dist/assets/embedding-runtime.js").pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  conditions: ["onnxruntime-web-use-extern-wasm"],
  legalComments: "linked",
});
for (const name of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  await copyFile(
    file(`node_modules/onnxruntime-web/dist/${name}`),
    file(`dist/assets/ort/${name}`),
  );
}
await copyFile(
  file("node_modules/@huggingface/transformers/LICENSE"),
  file("dist/assets/TRANSFORMERS-LICENSE"),
);
await copyFile(
  file("node_modules/onnxruntime-web/README.md"),
  file("dist/assets/ONNX-README.md"),
);
await copyFile(file("research/ONNX-LICENSE"), file("dist/assets/ONNX-LICENSE"));
await copyFile(
  file("research/MODEL-README.md"),
  file("dist/assets/MODEL-README.md"),
);
await writeFile(
  file("dist/data/model-assets.json"),
  JSON.stringify(assetHashes),
);
const {rules,conditions} = await loadScreening(root);
const data = await json('dist/data/funders.json');
validateScreening(data,rules,conditions);
await writeFile(file('dist/data/program-conditions.json'), JSON.stringify(conditions,null,2)+'\n');
await writeFile(file('dist/data/eligibility-rules.json'), JSON.stringify(rules,null,2)+'\n');
const texts = corpusDocuments(data.funds);
const corpusHash = hash(JSON.stringify({ model: MODEL, texts }));
let old;
try {
  old = await json("dist/data/fund-vectors.json");
} catch {}
if (
  old?.corpusHash !== corpusHash ||
  old?.binarySha256 !==
    hash(
      await readFile(file("dist/data/fund-vectors.f32")).catch(() =>
        Buffer.alloc(0),
      ),
    )
) {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = file(`dist/models/${MODEL.revision}/`).pathname;
  env.useFSCache = false;
  const embed = await pipeline("feature-extraction", MODEL.id, {
    dtype: MODEL.dtype,
    device: "cpu",
    local_files_only: true,
  });
  const vectors = new Float32Array(texts.length * MODEL.dimensions);
  for (let i = 0; i < texts.length; i++) {
    const tensor = await embed(texts[i].text, {
      pooling: "mean",
      normalize: true,
    });
    vectors.set(unitVector(tensor.data), i * MODEL.dimensions);
    tensor.dispose();
    if ((i + 1) % 100 === 0)
      console.log(`Embedded ${i + 1}/${texts.length} public program documents`);
  }
  await embed.dispose();
  const binary = Buffer.from(vectors.buffer);
  await writeFile(file("dist/data/fund-vectors.f32"), binary);
  await writeFile(
    file("dist/data/fund-vectors.json"),
    JSON.stringify(
      {
        model: MODEL,
        corpusHash,
        ids: texts.map((t) => t.id),
        textHashes: texts.map((t) => hash(t.text)),
        binarySha256: hash(binary),
        createdOn: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}
const assets = [
  ...modelFiles.map((f) => modelBase + f),
  "dist/assets/embedding-runtime.js",
  "dist/assets/ort/ort-wasm-simd-threaded.mjs",
  "dist/assets/ort/ort-wasm-simd-threaded.wasm",
  "dist/data/fund-vectors.f32",
];
let total = 0;
for (const path of assets) {
  const { size } = await stat(file(path));
  if (size > 25 * 1024 * 1024)
    throw new Error(`Asset exceeds hosting limit: ${path}`);
  total += size;
}
console.log(
  `AI assets ready: ${texts.length} program/overview documents across all ${data.funds.length} funds, ${(total / 1e6).toFixed(1)} MB cold download; pinned weights verified.`,
);
