// Frozen baseline: the released support-kind classifier from 921d236 (develop at the 16 November
// production release ea2b810), packages/app/src/intake/keywords.ts lines 10 to 56, copied verbatim.
// Do not edit. evaluation/support-kinds-baseline-v1.sha256 pins this file.
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
  living: wholeWords(/living|land|water|rainwater|seed\w*|soil|tree\w*|plant\w*|nursery|terra|mudas|sementes|água/),
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
/** Kinds of support the words point at: a keyword suggestion for a person to check, never a classification. */
export function suggestKinds(text: string): (keyof typeof BANKS)[] {
  const assertions = text.split(KIND_CLAUSES).filter((clause) => !DENIED_SUPPORT.test(clause));
  return (Object.keys(BANKS) as (keyof typeof BANKS)[]).filter((key) =>
    assertions.some((clause) => BANKS[key].test(clause)),
  );
}
