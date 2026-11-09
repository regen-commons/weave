import {
  ASK_LIMIT,
  EMPTY_ASK,
  type AskChunk,
  type AskExtraction,
  type AskKind,
  type AskStep,
} from "./contracts.ts";
import { fingerprint } from "./state.ts";
const BANKS = {
  living: /\b(living|land|water|seed\w*|soil|tree\w*|plant\w*|nursery|terra|mudas|sementes|água)\b/iu,
  material: /\b(tool\w*|equipment|fenc\w*|truck|building|venue|materials?|ferramentas|cerca\w*)\b/iu,
  intellectual:
    /\b(intellectual|map\w*|data|research|method\w*|template|review\w*|knowledge|pesquisa|dados)\b/iu,
  experiential:
    /\b(experiential|teach\w*|train\w*|workshop\w*|skills?|know-how|experience|learn\w*|oficina\w*)\b/iu,
  social:
    /\b(social|introduction\w*|connect\w*|partner\w*|co-applicant|volunteer\w*|fiscal host|network\w*|parceir\w*|voluntári\w*)\b/iu,
  financial:
    /\b(financial|money|funding|grant\w*|cash|budget|donat\w*|usd|eur|brl|dinheiro|reais)\b|R\$|[$€£]/iu,
  cultural: /\b(cultural|story|stories|art|artists?|culture|music|language|histórias|cultura)\b/iu,
  spiritual: /\b(ceremony|ritual|care|spirit\w*|listening|cerimônia|cuidado)\b/iu,
} as const;
export function chunksFrom(text: string, sourceId: string): AskChunk[] {
  return text
    .split(
      /(?:\r?\n)+|;\s*|(?<=[.!?])\s+(?=[A-ZÀ-Þ])|,\s+(?=(?:and\s+)?(?:someone|somebody|an?\b|help\b|land\b|tools?\b|funding\b|money\b|equipment\b|fencing\b|volunteers?\b|uma?\b|alguém\b))/iu,
    )
    .map((text) =>
      text
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/u, "")
        .replace(/^(?:and|also)\s+/iu, "")
        .trim(),
    )
    .filter(Boolean)
    .map((text, index) => ({ key: `${sourceId}:${index}`, text }));
}
export function candidateChunks(chunks: AskChunk[], step: AskStep): AskChunk[] {
  const fixed = step.items.filter((item) => item.decision !== "pencil");
  const keys = new Set(fixed.map((item) => item.sourceKey));
  const prints = new Set(fixed.map((item) => item.fingerprint));
  return chunks.filter((chunk) => {
    const print = fingerprint(chunk.text.slice(0, 600));
    if (keys.has(chunk.key) || prints.has(print)) return false;
    prints.add(print);
    return true;
  });
}
/** Transparent keyword proposals, never a verified classification or a guessed currency. */
export function keywordExtraction(chunks: AskChunk[], kind: AskKind): AskExtraction {
  const matching = chunks.filter((chunk) =>
    kind === "needs"
      ? !/^(?:(?:we|i)\s+(?:can\s+)?)?(?:offer|offers|share|oferecemos)\b/iu.test(chunk.text)
      : !/^(?:(?:we|i)\s+)?(?:need|needs|precisamos)\b/iu.test(chunk.text),
  );
  const items = matching.slice(0, ASK_LIMIT).map((chunk) => {
    const text = chunk.text;
    const capitalForms = (Object.keys(BANKS) as (keyof typeof BANKS)[]).filter((key) =>
      BANKS[key].test(text),
    );
    return {
      sourceKey: chunk.key,
      value: {
        ...EMPTY_ASK,
        title: text.slice(0, 140),
        description: text.slice(0, 600),
        capitalForms,
        placeScope: /\b(anywhere|online|remote|em qualquer lugar)\b/iu.test(text)
          ? ("anywhere" as const)
          : /\b(our region|regional|our valley|nossa região)\b/iu.test(text)
            ? ("region" as const)
            : /\b(here|on site|aqui)\b/iu.test(text)
              ? ("here" as const)
              : ("anywhere" as const),
        urgency: kind === "needs" && /\b(now|agora)\b/iu.test(text) ? ("now" as const) : null,
      },
    };
  });
  return { items, heard: matching.length };
}
