import { z } from "../validation.ts";
import { createLexicalIndex, rankFunds } from "../../../../dist/matching.mjs";
import { EvaluationSchema, type Bundle, type Evaluation } from "./contracts.ts";
import type { projectFrom } from "./profile.ts";
export type Project = NonNullable<ReturnType<typeof projectFrom>>;
/** Reuse the authoritative rubric, with the full corpus IDF and one result per program. */
export function evaluateCatalog(bundle: Bundle, project: Project, now = new Date()): Evaluation[] {
  const funds = bundle.catalog.funds.flatMap((fund) =>
    fund.enrichment.programs.length
      ? fund.enrichment.programs.map((program) => ({
          ...fund,
          enrichment: { ...fund.enrichment, programs: [program] },
        }))
      : [fund],
  );
  const results = rankFunds(
    funds,
    project,
    createLexicalIndex(bundle.catalog.funds),
    bundle.rules,
    null,
    now,
    bundle.conditions,
  );
  return z.array(EvaluationSchema).parse(results);
}
