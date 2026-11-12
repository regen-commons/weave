import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MODEL, unitVector } from "../../../dist/semantic-config.mjs";
import { PROJECT_MODEL_VERSION, PROJECT_VECTOR_DIMENSIONS } from "../src/project-index-vector.ts";

export async function createPinnedProjectEmbedder() {
  const version = `mxbai-xsmall:${MODEL.revision}:${MODEL.dtype}:mean:unit:passage-v1`;
  if (version !== PROJECT_MODEL_VERSION || MODEL.dimensions !== PROJECT_VECTOR_DIMENSIONS)
    throw Error("incompatible_project_model");
  const root = new URL("../../../", import.meta.url);
  const modelRoot = new URL(`dist/models/${MODEL.revision}/`, root);
  const hashes = JSON.parse(await readFile(new URL("research/model-assets.json", root), "utf8"));
  if (hashes["onnx/model_quantized.onnx"] !== MODEL.weightsSha256) throw Error("model_asset_integrity");
  for (const [path, expected] of Object.entries(hashes)) {
    const asset = await readFile(new URL(`${MODEL.id}/${path}`, modelRoot));
    if (createHash("sha256").update(asset).digest("hex") !== expected) throw Error("model_asset_integrity");
  }
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = fileURLToPath(modelRoot);
  env.useFSCache = false;
  const model = await pipeline("feature-extraction", MODEL.id, { dtype: MODEL.dtype, device: "cpu", local_files_only: true });
  return {
    modelVersion: version,
    async embed(text) {
      const tensor = await model(text, { pooling: "mean", normalize: true });
      try { return unitVector(tensor.data); } finally { tensor.dispose(); }
    },
    close: () => model.dispose(),
  };
}
