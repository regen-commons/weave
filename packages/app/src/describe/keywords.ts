import { z } from "../validation.ts";
import { wholeWords } from "../intake/keywords.ts";
import { fileName, spokenName, statedName } from "./names.ts";
import { spokenWhere, statedWhere, whereFromAnswer } from "./places.ts";
import { initiativeWords } from "./about.ts";
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
  // The words the person gave first: an answer to the name question, the box, or the first file.
  const first = draft.turns[0]?.text.trim() || draft.composer.trim() || text.trim();
  // What the person said or typed, and what the files added after it (DL-127).
  const said = [...draft.turns.map((turn) => turn.text), draft.composer.trim()].filter(Boolean).join("\n\n");
  const fromFiles = said && text.startsWith(said) ? text.slice(said.length).trim() : said ? "" : text.trim();
  // A name as written, then as speech gives it without capitals, then as a file states it.
  const name = (said ? statedName(first) || spokenName(first) : "") || (fromFiles ? fileName(fromFiles) : "");
  // The person's answer to the Where question wins. Without one, only a place the words state is
  // proposed: as written first, and as speech gives it where the written rules found none.
  const answer = whereAnswer(draft);
  const written = answer ? whereFromAnswer(answer) : statedWhere(settled, name);
  // "We work in" is read as a place only in the person's own finished words, never in a file's.
  const own = said && settled.startsWith(said) ? said : "";
  const { locations, isGlobal } = answer || written.locations.length || written.isGlobal ? written : spokenWhere(settled, name, own);
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
    description: aboutWords(said, fromFiles, text).slice(0, 800),
    links: [...draft.links],
    stage,
    lenses,
    themes: themes.slice(0, 10),
    beneficiaries,
    languages,
    confidence: 0.25,
  };
}
/** As many of the person's own words as make a description without a file's help. */
const ABOUT_OWN_WORDS = 8;
/** A sentence that says what an initiative is or does. */
const ABOUT_CUE = wholeWords(
  /we|our|mission|aims?|purpose|works?|helps?|supports?|provides?|brings?|restores?|teach(?:es)?|grows?|trains?|connects?|builds?|runs?|is an?|are an?|somos|nosso|nossa|trabalha|trabalhamos|apoia|nuestro|nuestra|trabajamos|apoya/,
);
/**
 * The part of a file that says what the initiative does: the first sentence of eight words or
 * more that speaks of it ("we", "our", "helps", "is a"), and the rest of its paragraph. A file
 * opens with its title, a date or a contents list as often as with a description, so its first
 * characters are not taken as they come, and the heading after the paragraph is not run into it.
 * Empty when the file holds no such sentence.
 */
export function aboutPassage(text: string): string {
  // The start of a long file, a paragraph at a time, with a line end inside one read as a space.
  const paragraphs = text
    .slice(0, 20_000)
    .replace(/\r\n?/gu, "\n")
    .split(/\n[ \t]*\n+/u)
    .map((paragraph) =>
      paragraph
        .replace(/[ \t]*\n[ \t]*/gu, " ")
        .replace(/[ \t]{2,}/gu, " ")
        .trim()
        .split(/(?<=[.!?])[ \t]+/u)
        .filter(Boolean),
    );
  const long = (sentence: string) => countWords(sentence) >= ABOUT_OWN_WORDS && sentence.length <= 600;
  for (const fits of [(sentence: string) => long(sentence) && ABOUT_CUE.test(sentence), long])
    for (const sentences of paragraphs) {
      const start = sentences.findIndex(fits);
      if (start >= 0) return sentences.slice(start).join(" ");
    }
  return "";
}
/**
 * About it is the person's own words when they said enough to describe the initiative, as the
 * initiative's own description: without what it needs or could offer, and without the speaker's
 * own name (`initiativeWords`). A file fills it only when they did not, so a description they gave
 * is never mixed with a document's.
 */
function aboutWords(said: string, fromFiles: string, all: string): string {
  if (!fromFiles) return initiativeWords(all);
  if (countWords(said) >= ABOUT_OWN_WORDS) return initiativeWords(said);
  return aboutPassage(fromFiles) || all;
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
