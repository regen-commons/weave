import { fundingTopics } from "@weave/api/topics";
import { withFundFit, type RubricResult } from "@weave/api/fund-fit";
import { z } from "../validation.ts";
import { createLexicalIndex, rankFunds } from "../../../../dist/matching.mjs";
import { EvaluationSchema, type Bundle, type Evaluation } from "./contracts.ts";
import type { projectFrom } from "./profile.ts";
export type Project = NonNullable<ReturnType<typeof projectFrom>>;
/**
 * The card as the rubric reads it. The rubric reads words as written and the catalog is in
 * English, so its themes gain the catalog topics the card's Portuguese or Spanish words name, and
 * those its kept needs and offers, or an older card's own themes, name in any of the three
 * (DL-142), as the MCP tool reads them. The reading happens here, where ranking runs off the
 * page, so the word lists never load with a page.
 */
export function rubricProject({ asks, places: _places, ...project }: Project) {
  return { ...project, tags: fundingTopics(project.description, project.tags, [...project.tags, ...asks]) };
}
/**
 * Reuse the authoritative rubric, with the full corpus IDF and one result per program, for readiness and
 * research priority; Funding's fit is read from the card's themes and places over its results (DL-143).
 */
export function evaluateCatalog(bundle: Bundle, project: Project, now = new Date()): Evaluation[] {
  const funds = bundle.catalog.funds.flatMap((fund) =>
    fund.enrichment.programs.length
      ? fund.enrichment.programs.map((program) => ({
          ...fund,
          enrichment: { ...fund.enrichment, programs: [program] },
        }))
      : [fund],
  );
  const rubric = rubricProject(project);
  const results = rankFunds(
    funds,
    rubric,
    createLexicalIndex(bundle.catalog.funds),
    bundle.rules,
    null,
    now,
    bundle.conditions,
  );
  // Fit reads what the card is about and where it works, not how many words it shares (DL-143).
  return z.array(EvaluationSchema).parse(withFundFit({ ...rubric, asks: project.asks, places: project.places }, results as RubricResult[]));
}
