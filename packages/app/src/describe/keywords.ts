import { z } from "../validation.ts";
import { wholeWords } from "../intake/keywords.ts";
import { statedWhere, whereFromAnswer } from "./places.ts";
import {
  FileReadSchema,
  SuggestionSchema,
  EMPTY_INITIATIVE,
  QUESTIONS,
  type DeviceDraft,
  type Initiative,
} from "./contracts.ts";

const LENSES = {
  art_culture: wholeWords(/art|artists|stories|music|culture|cultura|arte|artístic\w*|histórias/),
  research: wholeWords(/research|researchers|mapping|data|pesquisa|ciência/),
  technology: wholeWords(/software|technology|tools|tecnologia|digital/),
  place_based: wholeWords(
    /community|families|garden|land|river|water|comunidade|comunitári\w*|famílias|horta|terra|territóri\w*|agrári\w*|fundiári\w*|rio|água/,
  ),
  learning: wholeWords(
    /learning|education|school|schools|teach|teaching|teachers|training|courses?|workshops?|educação|escolas?|ensino|cursos?|oficinas?|aprendizagem/,
  ),
  funders: wholeWords(/funder|grants|grantmaking|financiador|doações/),
} as const;
const THEMES = [
  "water",
  "soil",
  "food",
  "learning",
  "care",
  "culture",
  "climate",
  "biodiversity",
  "água",
  "solo",
  "educação",
];
export const SourceSchema = z.strictObject({
  text: z.string(),
  unreadFiles: z.number().int().min(0),
  files: z.array(FileReadSchema),
});
export const KeywordResultSchema = SourceSchema.extend({
  suggestion: SuggestionSchema,
  words: z.number().int().min(0),
});
export type KeywordResult = z.infer<typeof KeywordResultSchema>;
export type CollectedSource = z.infer<typeof SourceSchema>;
export type DocumentReader = (
  file: Blob,
  signal: AbortSignal,
) => Promise<{ text: string; pages: number; unreadPages: number }>;
export function countWords(text: string): number {
  let count = 0;
  for (const _ of text.matchAll(/\S+/gu)) count++;
  return count;
}
/** The person's answer to the Where question: an added answer, or the words they are typing for it. */
export function whereAnswer(draft: Pick<DeviceDraft, "turns" | "composer">): string {
  return (
    draft.turns.find((turn) => turn.prompt === QUESTIONS[1])?.text.trim() ??
    (draft.turns.length === 1 ? draft.composer.trim() : "")
  );
}
/**
 * The keyword draft of a card. `settled` is the part of the words that is finished, such as added
 * answers and read files, and only it may propose a place; it is all of `text` when building.
 */
export function keywordSuggestion(draft: DeviceDraft, text: string, settled = text): Initiative {
  const first = draft.turns[0]?.text.trim() || draft.composer.trim() || text.split(/\n/u)[0]?.trim() || "";
  const named = first
    .match(/^(?:we are|we're|our initiative is called|called|somos|nome:)\s+([^,.\n]{1,200})/iu)?.[1]
    ?.trim();
  const directName = first.split(/[,.\n]/u)[0] ?? "";
  const name =
    named ??
    (directName.length <= 60 && !/\b(work|working|help|we|our|trabalh|ajud)/iu.test(directName)
      ? directName
      : "");
  // The person's answer to the Where question wins. Without one, only a place the words state is proposed.
  const answer = whereAnswer(draft);
  const { locations, isGlobal } = answer ? whereFromAnswer(answer) : statedWhere(settled, name);
  const stage = /\b(just starting|starting now|começando agora)\b/iu.test(text)
    ? "seed"
    : /\b(getting going|recently started)\b/iu.test(text)
      ? "sprout"
      : /\b(long established|long-established|established for decades)\b/iu.test(text)
        ? "tree"
        : /\b(up and running|already operating)\b/iu.test(text)
          ? "flowering"
          : null;
  const lenses = (Object.keys(LENSES) as (keyof typeof LENSES)[]).filter((key) => LENSES[key].test(text));
  const lower = text.toLocaleLowerCase();
  const themes = THEMES.filter((word) => new RegExp(`(?:^|\\W)${word}(?:$|\\W)`, "iu").test(lower));
  const beneficiaries = [
    ...new Set(
      [
        ...text.matchAll(
          /\b(families|students|children|farmers|artists|famílias|estudantes|crianças|agricultores)\b/giu,
        ),
      ].map((match) => match[0]),
    ),
  ].slice(0, 6);
  const languages = [
    /[Pp]ortugu[eê]s(?:e)?/u.test(text) ? "pt" : null,
    /\bEnglish\b/iu.test(text) ? "en" : null,
    /\bSpanish|español\b/iu.test(text) ? "es" : null,
  ].filter((value): value is string => !!value);
  return {
    ...EMPTY_INITIATIVE,
    name: name.slice(0, 200),
    locations,
    isGlobal,
    description: text.slice(0, 800),
    links: [...draft.links],
    stage,
    lenses,
    themes: themes.slice(0, 10),
    beneficiaries,
    languages,
    confidence: 0.25,
  };
}
export async function collectSource(
  draft: Pick<DeviceDraft, "turns" | "composer" | "attachments">,
  pdfReader?: DocumentReader,
  signal = new AbortController().signal,
): Promise<CollectedSource> {
  const pieces = draft.turns.map((turn) => turn.text);
  if (draft.composer.trim()) pieces.push(draft.composer.trim());
  let unreadFiles = 0;
  const files: CollectedSource["files"] = [];
  for (const file of draft.attachments) {
    signal.throwIfAborted();
    try {
      if (/^text\//u.test(file.type) || /\.(txt|md|csv)$/iu.test(file.name)) {
        const text = await file.blob.text();
        if (text.trim()) {
          pieces.push(text);
          files.push({ id: file.id, pages: 0, unreadPages: 0, status: "read" });
          continue;
        }
      } else if ((file.type === "application/pdf" || /\.pdf$/iu.test(file.name)) && pdfReader) {
        const result = await pdfReader(file.blob, signal);
        if (result.text.trim()) {
          pieces.push(result.text);
          files.push({
            id: file.id,
            pages: result.pages,
            unreadPages: result.unreadPages,
            status: result.unreadPages ? "partial" : "read",
          });
          continue;
        }
        files.push({ id: file.id, pages: result.pages, unreadPages: result.unreadPages, status: "unread" });
        unreadFiles++;
        continue;
      }
    } catch {
      signal.throwIfAborted();
    }
    unreadFiles++;
    files.push({ id: file.id, pages: 0, unreadPages: 0, status: "unread" });
  }
  signal.throwIfAborted();
  return { text: pieces.join("\n\n"), unreadFiles, files };
}
export function fromSource(draft: DeviceDraft, source: CollectedSource): KeywordResult {
  return { ...source, suggestion: keywordSuggestion(draft, source.text), words: countWords(source.text) };
}
export async function readKeywordSource(draft: DeviceDraft): Promise<KeywordResult> {
  return fromSource(draft, await collectSource(draft));
}
