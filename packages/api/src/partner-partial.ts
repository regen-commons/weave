import type { ProjectEvidence } from "./partner-matcher.ts";

export type PartialPartnerFit = { evidence: string; toCheck: string; supportingPassage?: string };

type Rule = {
  asks: readonly RegExp[];
  proof: readonly RegExp[];
  title?: RegExp;
  supporting?: RegExp;
  /** Details a full fit must show when the request makes them explicit. */
  full?: readonly RegExp[];
  evidence: string;
  toCheck: string;
};

const rules: readonly Rule[] = [
  {
    asks: [/\b(?:vivienda|housing|co.living)\b/u, /\b(?:tenencia|tenure|cost.sharing|reparto de gastos)\b/u],
    proof: [/\bbrings together\b/u, /\blive and work on the land together\b/u],
    evidence: "Runs a program where people live and work together.",
    toCheck: "Whether they can advise on tenure and shared housing costs.",
  },
  {
    asks: [/\b(?:refugee|displaced)\b/u, /\bpeer.groups?\b/u],
    title: /\b(?:refugee|displaced)\b.{0,35}\byouth\b/u,
    proof: [/\b(?:runs?|hosts?|houses) (?:a |its |local )?youth (?:program\w*|activities)\b/u],
    evidence: "Runs youth activities with a refugee community.",
    toCheck: "Whether they can share a safe model for facilitating peer groups.",
  },
  {
    asks: [/\b(?:bird.call|forest sound)\b/u, /\b(?:classifier|automated.{0,20}identification)\b/u],
    proof: [/\b(?:build|develop|provide)\w*\b.{0,25}\b(?:tools?|software)\b/u, /\bbioacoustic\w*\b/u],
    evidence: "Builds tools for bioacoustic work.",
    toCheck: "Whether they have validated an automated bird-call classifier against field labels.",
  },
  {
    asks: [/\b(?:recycled plastics?|plastiques? recycles?)\b/u, /\b(?:lots?|batches)\b/u, /\b(?:traceab|tracabil)\w*\b/u],
    proof: [/\bis (?:a |an )?(?:[\w-]+ ){0,6}traceability\b/u, /\b(?:circular|recycling) supply chains?\b/u],
    full: [/\b(?:plastics?|plastiques?)\b/u, /\b(?:lots?|batches)\b/u],
    evidence: "Provides traceability for circular supply chains.",
    toCheck: "Whether the tool tracks individual lots of recycled plastic.",
  },
  {
    asks: [/\b(?:seed banks?|seed sav\w*)\b/u, /\b(?:traditional rice|heritage crop seed)\b/u],
    proof: [/\b(?:seed saving|heritage plant.{0,25}collections?)\b/u, /\b(?:has developed|our heritage plant)\b/u],
    full: [/\b(?:rice|paddy)\b/u, /\b(?:stor\w*|seed bank)\b/u, /\bregenerat\w*\b/u],
    evidence: "Has experience with seed saving or heritage plant collections.",
    toCheck: "Whether they have stored and regenerated traditional rice seed with growers.",
  },
  {
    asks: [/\b(?:seed banks?|seed sav\w*)\b/u, /\b(?:cooperative|member.owned)\b/u],
    proof: [/\bseed saving\b/u, /\bcollective production\b/u],
    evidence: "Saves seed and works on collective crop production.",
    toCheck: "Whether they can advise on seed-bank membership and replenishing shared stocks.",
  },
  {
    asks: [/\b(?:medicinal plants?|plantas? medicinales)\b/u, /\b(?:ancestral\w*|tradition\w*)\b/u],
    proof: [/\b(?:document\w*|record\w*) ancestral knowledge\b/u],
    supporting: /\bknowledge of medicinal plants\b/u,
    evidence: "Documents local ancestral knowledge, including a project focus on medicinal plants.",
    toCheck: "Whether knowledge holders wish to teach or share that knowledge.",
  },
  {
    asks: [/\b(?:arts?|artes)\b/u, /\b(?:land.based|oficios de la tierra|aprendizaje practico en el campo)\b/u],
    proof: [/\b(?:classrooms?|educat\w*|learning)\b/u, /\b(?:art|artists)\b/u, /\b(?:agroecolog\w*|farmers?|forests?)\b/u],
    evidence: "Runs learning activities that bring together art and land stewardship.",
    toCheck: "Whether they offer practical instruction for adults in the requested crafts.",
  },
  {
    asks: [/\b(?:plantulas|seedlings?)\b/u, /\b(?:nativ\w*|indigenous)\b/u],
    title: /\b(?:propagacion de especies nativas|native (?:plant|tree|seedling) propagation)\b/u,
    proof: [/\b(?:protege|protects?|restores?)\b/u, /\b(?:restauracion|restoration)\b/u],
    evidence: "Works on native species propagation and active forest restoration.",
    toCheck: "Whether they can supply native seedlings suited to your site.",
  },
  {
    asks: [/\b(?:zanjas|gullies|soil collaps\w*|suelo se desmorona)\b/u, /\b(?:aguacero|erosion|smallholders?|pequenos productores)\b/u],
    proof: [/\b(?:colapso estructural|erosion hidrica|gully erosion)\b/u, /\b(?:analys\w*|evalu\w*|enfoque integrado)\b/u],
    evidence: "Studies the causes of soil collapse or gully erosion.",
    toCheck: "Whether they can advise on treatments that work on your land.",
  },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const credible = (text: string) => !/\b(?:not|never|no longer|cannot|can['’]t|don['’]t|except|excluding|looking (?:for|to)|needs?|seek\w*|plan\w* to|hope\w* to|will (?:start|launch|build|offer|provide)|busca\w*|procur\w*|cherch\w*|nao)\b/u.test(text);

export const partialRulesFor = (request: string): readonly Rule[] => {
  const text = fold(request);
  return rules.filter(({ asks }) => asks.every((term) => term.test(text)));
};

export function meetsPartialRuleDetails(text: string, applicable: readonly Rule[]): boolean {
  return applicable.every(({ full }) => !full || fold(text).split(/[.!?;\n]+/u).some((unit) =>
    credible(unit) && full.every((term) => term.test(unit))));
}

/** Only recognize a positive, concrete subtask. Project subject, role and place alone cannot qualify. */
export function evidencedPartialFit(
  applicable: readonly Rule[], projectName: string, passages: readonly ProjectEvidence[],
): { passage: ProjectEvidence; partial: PartialPartnerFit } | undefined {
  const title = fold(projectName);
  for (const rule of applicable) {
    if (rule.title && !rule.title.test(title)) continue;
    for (const passage of passages) {
      if (passage.kind !== "work") continue;
      const units = fold(passage.passage).split(/[.!?;\n]+/u).filter(credible);
      if (!units.some((unit) => rule.proof.every((term) => term.test(unit)))) continue;
      const supporting = rule.supporting && passages.find((other) => other.kind === "work" && other.id !== passage.id
        && rule.supporting!.test(fold(other.passage)) && credible(fold(other.passage)));
      if (rule.supporting && !supporting) continue;
      return { passage, partial: { evidence: rule.evidence, toCheck: rule.toCheck,
        ...(supporting ? { supportingPassage: supporting.passage } : {}) } };
    }
  }
}
