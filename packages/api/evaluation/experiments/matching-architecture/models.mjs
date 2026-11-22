// Embedding candidates for the offline experiment. Nothing here is imported by the app, the API
// or the live site. Only the first model is pinned by the repository (dist/semantic-config.mjs);
// the others are downloaded on demand into .cache/ (ignored by git) and are a decision for the
// owner (D32), not an installed dependency. The runtime is the root's pinned
// @huggingface/transformers; no package or lockfile changes.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { MODEL, unitVector } from "../../../../../dist/semantic-config.mjs";

const here = new URL("./", import.meta.url);
const cacheRoot = new URL(".cache/", here);

export const MODELS = {
  "mxbai-xsmall-en": {
    label: "mxbai-embed-xsmall-v1 (pinned, English)", id: MODEL.id, revision: MODEL.revision, dtype: MODEL.dtype,
    dimensions: MODEL.dimensions, pinned: true, queryPrefix: "", passagePrefix: "", languages: "English",
    licence: "Apache-2.0", onnxBytes: 24_448_010,
  },
  "me5-small": {
    label: "multilingual-e5-small", id: "Xenova/multilingual-e5-small", revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
    dtype: "q8", dimensions: 384, queryPrefix: "query: ", passagePrefix: "passage: ", languages: "about 100",
    licence: "MIT (upstream intfloat/multilingual-e5-small)", onnxBytes: 118_308_185,
  },
  "mminilm-l12": {
    label: "paraphrase-multilingual-MiniLM-L12-v2", id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    revision: "2c4055b12046f11709e9df2c122e59ffbdc2f900", dtype: "q8", dimensions: 384, queryPrefix: "", passagePrefix: "",
    languages: "about 50", licence: "Apache-2.0 (upstream sentence-transformers)", onnxBytes: 118_308_126,
  },
  // The D32 engines load upstream's own 8-bit files instead of the conversions above (licence check,
  // 21 November 2026, in README.md). Every file is pinned by revision and SHA-256; the small files' git
  // blob hashes were checked against the revision's tree.
  "me5-small-upstream": {
    label: "multilingual-e5-small (upstream 8-bit)", id: "intfloat/multilingual-e5-small", revision: "614241f622f53c4eeff9890bdc4f31cfecc418b3",
    modelFileName: "model_qint8_avx512_vnni", dimensions: 384, queryPrefix: "query: ", passagePrefix: "passage: ", languages: "about 100",
    licence: "MIT", onnxBytes: 118_346_824,
    files: {
      "config.json": "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
      "special_tokens_map.json": "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7",
      "tokenizer.json": "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
      "tokenizer_config.json": "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
      "onnx/model_qint8_avx512_vnni.onnx": "dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88",
    },
  },
  "mminilm-l12-upstream": {
    label: "paraphrase-multilingual-MiniLM-L12-v2 (upstream 8-bit)", id: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    revision: "e8f8c211226b894fcb81acc59f3b34ba3efd5f42", modelFileName: "model_qint8_avx512", dimensions: 384, queryPrefix: "",
    passagePrefix: "", languages: "about 50", licence: "Apache-2.0", onnxBytes: 118_412_398,
    files: {
      "config.json": "6300193cb75e01cf80c96decef7187dfb33094d97cc1490b7ead6ff134476e4e",
      "special_tokens_map.json": "378eb3bf733eb16e65792d7e3fda5b8a4631387ca04d2015199c4d4f22ae554d",
      "tokenizer.json": "2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8",
      "tokenizer_config.json": "5036ea374ffedd706e3bef33e2e0d6953cb868ef8a490e76e32ba0faa37a6b9b",
      "onnx/model_qint8_avx512.onnx": "783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672",
    },
  },
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const upstreamRoot = spec => new URL(`upstream/${spec.revision}/`, cacheRoot);

/**
 * Puts an upstream model's pinned files in .cache/upstream/, as the build does for the live model: a file
 * already on disk is kept only if its SHA-256 matches, and a download that does not match is refused.
 */
export async function fetchUpstream(key, { offline = false } = {}) {
  const spec = MODELS[key];
  if (!spec?.files) throw Error(`not_an_upstream_model:${key}`);
  for (const [name, expected] of Object.entries(spec.files)) {
    const file = new URL(`${spec.id}/${name}`, upstreamRoot(spec));
    const onDisk = await readFile(file).catch(() => null);
    if (onDisk && sha256(onDisk) === expected) continue;
    if (offline) throw Error(`model_file_missing:${key}:${name}`);
    console.log(`Fetching pinned upstream model file: ${spec.id}/${name}`);
    const response = await fetch(`https://huggingface.co/${spec.id}/resolve/${spec.revision}/${name}`, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok) throw Error(`model_download_failed:${key}:${name}:${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expected) throw Error(`model_file_failed_verification:${key}:${name}`);
    await mkdir(new URL(".", file), { recursive: true });
    await writeFile(file, bytes);
  }
  return fileURLToPath(upstreamRoot(spec));
}

const digest = text => createHash("sha256").update(text).digest("hex").slice(0, 24);
const encode = vector => Buffer.from(Float32Array.from(vector).buffer).toString("base64");
const decode = text => { const bytes = Buffer.from(text, "base64"); return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4); };

/** Vectors are cached on disk by model contract and text, so a rerun scores without loading a model. */
export async function createEmbedder(key, { offline = false } = {}) {
  const spec = MODELS[key];
  if (!spec) throw Error(`unknown_model:${key}`);
  await mkdir(cacheRoot, { recursive: true });
  const file = new URL(`vectors-${key}.json`, cacheRoot);
  let store = { contract: `${spec.id}@${spec.revision}:${spec.modelFileName ?? spec.dtype}:mean:unit:${spec.dimensions}`, timing: null, vectors: {} };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved.contract === store.contract) store = saved;
  } catch {}
  let model = null, loadMs = null, embedMs = 0, embedded = 0;
  async function load() {
    if (model) return model;
    if (offline) throw Error(`vector_cache_miss:${key}`);
    const { env, pipeline } = await import("@huggingface/transformers");
    const started = performance.now();
    if (spec.pinned) {
      // The pinned model comes from the build's verified local files, exactly as production embeds.
      env.allowRemoteModels = false;
      env.localModelPath = fileURLToPath(new URL(`../../../../../dist/models/${spec.revision}/`, here));
      env.useFSCache = false;
      model = await pipeline("feature-extraction", spec.id, { dtype: spec.dtype, device: "cpu", local_files_only: true });
    } else if (spec.files) {
      // Upstream's verified files only. dtype "fp32" adds no suffix to modelFileName, so the runtime opens
      // upstream's 8-bit file by its own name; the weights stay 8-bit.
      env.allowRemoteModels = false;
      env.localModelPath = await fetchUpstream(key);
      env.useFSCache = false;
      model = await pipeline("feature-extraction", spec.id, { dtype: "fp32", model_file_name: spec.modelFileName, device: "cpu", local_files_only: true });
    } else {
      env.allowRemoteModels = true;
      env.useFSCache = true;
      env.cacheDir = fileURLToPath(new URL("models/", cacheRoot));
      model = await pipeline("feature-extraction", spec.id, { dtype: spec.dtype, device: "cpu", revision: spec.revision });
    }
    loadMs = performance.now() - started;
    return model;
  }
  async function embed(text, role) {
    const input = (role === "query" ? spec.queryPrefix : spec.passagePrefix) + text;
    const id = digest(input);
    if (!store.vectors[id]) {
      const pipe = await load();
      const started = performance.now();
      const tensor = await pipe(input, { pooling: "mean", normalize: true });
      try { store.vectors[id] = encode(spec.pinned ? unitVector(tensor.data) : tensor.data); } finally { tensor.dispose(); }
      embedMs += performance.now() - started;
      embedded++;
    }
    return decode(store.vectors[id]);
  }
  async function close() {
    if (embedded) {
      // Everything a browser would have to download for this model: weights, tokenizer and configuration.
      const folder = spec.pinned ? new URL(`../../../../../dist/models/${spec.revision}/${spec.id}/`, here)
        : spec.files ? new URL(`${spec.id}/`, upstreamRoot(spec)) : new URL(`models/${spec.id}/${spec.revision}/`, cacheRoot);
      const names = await readdir(folder, { recursive: true }).catch(() => []);
      let bytes = 0;
      for (const name of names) { const info = await stat(new URL(name, folder)); if (info.isFile()) bytes += info.size; }
      // Node on this machine, one short text at a time, quantized weights on CPU. Not a browser or phone
      // measurement. loadMs includes the download when the model files were not on disk yet.
      store.timing = { loadMs: Math.round(loadMs), texts: embedded, meanEmbedMs: Number((embedMs / embedded).toFixed(1)),
        downloadBytes: bytes || null, node: process.version, measuredOn: new Date().toISOString().slice(0, 10) };
    }
    await writeFile(file, JSON.stringify(store));
    await model?.dispose();
    model = null;
  }
  return { key, spec, embed, close, timing: () => store.timing };
}

export const cosine = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i] * b[i]; return sum; };
