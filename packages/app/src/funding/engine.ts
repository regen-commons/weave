import { fundingTopics } from "@weave/api/topics";
import { z } from "../validation.ts";
import { createLexicalIndex, rankFunds } from "../../../../dist/matching.mjs";
import { EvaluationSchema, type Bundle, type Evaluation } from "./contracts.ts";
import type { projectFrom } from "./profile.ts";
export type Project = NonNullable<ReturnType<typeof projectFrom>>;
/**
 * The card as the rubric reads it. The rubric reads words as written and the catalog is in
 * English, so its themes gain the catalog topics the card's Portuguese or Spanish words name, and
 * those its kept needs and offers name in any of the three (DL-142). The reading happens here,
 * where ranking runs off the page, so the word lists never load with a page.
 */
export function rubricProject({ asks, ...project }: Project) {
  return { ...project, tags: fundingTopics(project.description, project.tags, asks) };
}
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
    rubricProject(project),
    createLexicalIndex(bundle.catalog.funds),
    bundle.rules,
    null,
    now,
    bundle.conditions,
  );
  return z.array(EvaluationSchema).parse(results);
}
