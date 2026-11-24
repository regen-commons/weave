// The JSON Schema a browser model's answer must follow, built from a contract. Building it needs Zod's
// JSON Schema code, which only an on-device model request uses, so this module loads when one is made
// (engines.ts), and start-up does not carry it.
import { z } from "../validation.ts";
import { SuggestionSchema } from "./contracts.ts";

/** The contract as JSON Schema, without length limits, which a model's constrained decoding cannot keep. */
export function modelConstraint(contract: z.ZodMiniType = SuggestionSchema): Record<string, unknown> {
  const schema: Record<string, unknown> = z.toJSONSchema(contract);
  const removeLengths = (value: unknown): void => {
    if (value && typeof value === "object") {
      delete (value as Record<string, unknown>).maxLength;
      for (const child of Object.values(value)) removeLengths(child);
    }
  };
  removeLengths(schema);
  return schema;
}
