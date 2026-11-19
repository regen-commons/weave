import {
  ASK_DESCRIPTION_LIMIT,
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
  living: wholeWords(/living|land|water|rainwater|seed\w*|soil|topsoil|tree\w*|plant\w*|nursery|terra|mudas|sementes|água/),
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
// Bounded English negation: additive "not only" / "can't just", "no-till", zero-price
// and time or amount qualifiers remain positive. This is a keyword proposal, not a language parser.
const DENIED_SUPPORT = wholeWords(/(?:no(?!-till\b|(?:-|\s+)(?:cost|charge|fees?)\b|\s+(?:later|more than|less than)\b)|not|never|neither|cannot|can['’]t|(?:don|doesn|didn|isn|aren|wasn|weren|won|wouldn|couldn|shouldn)['’]t)(?!\s+(?:only|just)\b)/);
// A new assertion may restate its subject or explicitly deny the next support.
// A bare verb starts a new assertion after contrast, but a list or dependent
// exception ("no money, tools or seeds", "anything but money") stays together.
const KIND_CLAUSES = new RegExp([
  String.raw`\.(?!\d)|[!?;\r\n]+`,
  String.raw`(?:,\s*|\b(?:and|or)\s+)(?=(?:we|i|you|they|it)\b|${DENIED_SUPPORT.source})`,
  String.raw`\b(?:but|however|yet)\s+(?=(?:we|i|you|they|it|need|offer|provide|share|want|seek|lend|have)\b|${DENIED_SUPPORT.source})`,
].join("|"), "iu");
// A living word that only says what information is about ("soil test data", "data on
// water quality", "dados sobre a água") names knowledge, not a living resource. Living is
// set aside only in a clause the Intellectual bank also matches, so no statement loses
// every kind: "pesquisas sobre a água" keeps Living because "pesquisas" is not in the bank.
// Only the word directly qualified is covered: in "topsoil and soil test data" the
// topsoil may be a resource, so an ambiguous list keeps Living for the person to check.
const LIVING_TOPIC = String.raw`(?:soil|topsoil|water|rainwater|land|seed\w*|tree\w*|plant\w*|terra|água|solo)`;
const TOPIC_DETAIL = String.raw`(?:health|quality|moisture|carbon|fertility|nutrient\w*|chemistry|samples?|sampling|tests?|testing|use|cover|tenure|saving|conditions?)`;
const INFORMATION = String.raw`(?:data|research|map\w*|knowledge|method\w*|review\w*|dados|pesquisa)`;
const TOPICS = String.raw`${LIVING_TOPIC}(?:\s+${TOPIC_DETAIL}){0,3}`;
const INFORMATION_ABOUT_LIVING = new RegExp(
  wholeWords(
    new RegExp(
      `${TOPICS}\\s+${INFORMATION}|${INFORMATION}\\s+(?:on|about|of|into|de|da|do|das|dos|sobre)\\s+(?:(?:the|our|their|a|o|as|os)\\s+)?${TOPICS}`,
    ),
  ).source,
  "giu",
);
/** Kinds of support the words point at: a keyword suggestion for a person to check, never a classification. */
export function suggestKinds(text: string): (keyof typeof BANKS)[] {
  const assertions = text.split(KIND_CLAUSES).filter((clause) => !DENIED_SUPPORT.test(clause));
  return (Object.keys(BANKS) as (keyof typeof BANKS)[]).filter((key) =>
    assertions.some((clause) =>
      BANKS[key].test(key === "living" && BANKS.intellectual.test(clause) ? clause.replace(INFORMATION_ABOUT_LIVING, " ") : clause),
    ),
  );
}
/** A need or offer's title and description are separate statements: no phrase or denial runs across them. */
export function suggestEntryKinds(title: string, description: string | null): (keyof typeof BANKS)[] {
  return suggestKinds(`${title}\n${description ?? ""}`);
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
        // A card's title starts with a capital, as a label does. The rest is the person's words.
        title: text.slice(0, 140).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase()),
        description: text.slice(0, ASK_DESCRIPTION_LIMIT),
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
