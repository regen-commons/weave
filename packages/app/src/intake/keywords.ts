import {
  ASK_LIMIT,
  EMPTY_ASK,
  type AskChunk,
  type AskExtraction,
  type AskKind,
  type AskStep,
} from "./contracts.ts";
import { fingerprint, keptOnRebuild } from "./state.ts";
/** `\w` in any script: a letter, mark, digit or underscore. JavaScript's `\w` and `\b` know only ASCII ones. */
const WORD = String.raw`[\p{L}\p{M}\p{Nd}_]`;
/**
 * Keywords as whole words in any script, ignoring case, so "água" counts and "careço" is not "care".
 * A stem's `\w*` runs to the end of its word, accents included; symbols such as R$ count anywhere.
 */
export function wholeWords(keywords: RegExp, symbols?: RegExp): RegExp {
  const words = `(?<!${WORD})(?:${keywords.source.replaceAll(String.raw`\w`, WORD)})(?!${WORD})`;
  return new RegExp(symbols ? `${words}|${symbols.source}` : words, "iu");
}
const BANKS = {
  living: wholeWords(/living|land|water|seed\w*|soil|tree\w*|plant\w*|nursery|terra|mudas|sementes|água/),
  material: wholeWords(
    /tool\w*|equipment\w*|equipamento\w*|machine\w*|máquina\w*|tractor\w*|trator\w*|pumps?|shovel\w*|spade\w*|wheelbarrow\w*|greenhouse\w*|estufa\w*|irrigation|vehicle\w*|fenc\w*|trucks?|building|venue|materials?|ferramenta\w*|cerca\w*/,
  ),
  intellectual: wholeWords(/intellectual|map\w*|data|research|method\w*|template|review\w*|knowledge|pesquisa|dados/),
  experiential: wholeWords(
    /experiential|teach\w*|train\w*|workshop\w*|skills?|know-how|experience|learn\w*|oficina\w*/,
  ),
  social: wholeWords(
    /social|introduction\w*|connect\w*|partner\w*|co-applicant|volunteer\w*|fiscal host|network\w*|parceir\w*|voluntári\w*/,
  ),
  financial: wholeWords(
    /financial|money|funding|grant\w*|cash|budget|donat\w*|usd|eur|brl|dinheiro|reais/,
    /R\$|[$€£]/,
  ),
  cultural: wholeWords(/cultural|story|stories|art|artists?|culture|music|language|histórias|cultura|artístic\w*/),
  spiritual: wholeWords(/ceremony|ritual|care|spirit\w*|listening|cerimônia|cuidado/),
} as const;
/** Kinds of support the words point at: a keyword suggestion for a person to check, never a classification. */
export function suggestKinds(text: string): (keyof typeof BANKS)[] {
  return (Object.keys(BANKS) as (keyof typeof BANKS)[]).filter((key) => BANKS[key].test(text));
}
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
  const fixed = step.items.filter(keptOnRebuild);
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
    const capitalForms = suggestKinds(text);
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
