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
};

const digest = text => createHash("sha256").update(text).digest("hex").slice(0, 24);
const encode = vector => Buffer.from(Float32Array.from(vector).buffer).toString("base64");
const decode = text => { const bytes = Buffer.from(text, "base64"); return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4); };

/** Vectors are cached on disk by model contract and text, so a rerun scores without loading a model. */
export async function createEmbedder(key, { offline = false } = {}) {
  const spec = MODELS[key];
  if (!spec) throw Error(`unknown_model:${key}`);
  await mkdir(cacheRoot, { recursive: true });
  const file = new URL(`vectors-${key}.json`, cacheRoot);
  let store = { contract: `${spec.id}@${spec.revision}:${spec.dtype}:mean:unit:${spec.dimensions}`, timing: null, vectors: {} };
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
        : new URL(`models/${spec.id}/${spec.revision}/`, cacheRoot);
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
