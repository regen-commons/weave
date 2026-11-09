export const PROJECT_VECTOR_DIMENSIONS = 256;
export const PROJECT_MODEL_VERSION = "mxbai-xsmall:b0561d9a97e6b298da39f0ef3e7d3cf153b1b29a:q8:mean:unit:passage-v1";

export type ProjectEmbedding = { modelVersion: typeof PROJECT_MODEL_VERSION; vectors: number[][] };
export type ProjectEmbedder = {
  modelVersion: string;
  embed(text: string): Promise<Iterable<number>>;
};

export function validatedProjectVector(input: Iterable<number>): number[] {
  const vector: number[] = [];
  for (const n of input) {
    if (!Number.isFinite(n) || vector.length >= PROJECT_VECTOR_DIMENSIONS) throw Error("invalid_project_vector");
    vector.push(n);
  }
  if (vector.length !== PROJECT_VECTOR_DIMENSIONS || Math.abs(Math.hypot(...vector) - 1) > 0.001)
    throw Error("invalid_project_vector");
  return vector;
}
