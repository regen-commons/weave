import { wholeWords } from "../intake/keywords.ts";

/**
 * The initiative's name as the person's words state it, read with keyword rules on the device.
 * It reads only the plain shapes people write: a "Name:" line, "our project is called X",
 * "we are X" and "somos X", "at X, we", "X is a cooperative", "X, a network of", and a first
 * line that is only a name. A name starts with a capital, as names are written. When no shape
 * fits, the name is empty: nothing is made up from a description.
 */
export function statedName(text: string): string {
  const head = readable(text);
  const label = head.match(/^[ \t]*(?:name|nome|nombre)[ \t]*:[ \t]*([^\n]+)$/imu)?.[1];
  if (label) return plausible(cut(label)) ?? "";
  const sentences = head
    .split(/(?<=[.!?])\s+|\n+/u)
    // "Hello, we are Tree Keepers": a greeting is not part of what is said.
    .map((sentence) => sentence.trim().replace(/^(?:hello|hi|hey|olá|ola|oi|hola|buenos[ \t]+días|bom[ \t]+dia)[,!.]?[ \t]+/iu, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((sentence) => sentence.slice(0, SENTENCE));
  for (const sentence of sentences) {
    const called = sentence.match(CALLED);
    if (called) {
      const name = plausible(cut(sentence.slice(called.index! + called[0].length)));
      if (name) return name;
    }
  }
  for (const sentence of sentences) {
    const name = weAre(sentence) ?? atName(sentence) ?? isA(sentence);
    if (name) return name;
  }
  return firstLine(head);
}

/**
 * The words a name is looked for in, made cheap to read whatever was given: a name is stated at
 * the start, so only the first few thousand characters count. Line ends are one kind and a run
 * of spaces is one space, so no rule below ever retries across a long run of either.
 */
const HEAD = 4000;
/** No sentence a name is read from is longer than this. */
const SENTENCE = 300;
function readable(text: string): string {
  return text.slice(0, HEAD).replace(/\r\n?/gu, "\n").replace(/[ \t]{2,}/gu, " ");
}

/** "Our project is called X", "we are called X", "we call ourselves X", and the same in Portuguese and Spanish. The name is what follows. */
const CALLED = new RegExp(
  String.raw`(?:^|[\s,])(?:(?:initiative|project|group|organi[sz]ation|collective|network|garden|team|programme|program|association)[ \t](?:is[ \t])?called|we[ \t]are[ \t]called|we['’]re[ \t]called|we[ \t]call[ \t]ourselves|^called|chama-se|se[ \t]chama|nos[ \t]chamamos|chamad[oa]|se[ \t]llama|nos[ \t]llamamos|llamad[oa])[ \t]`,
  "iu",
);

/** Where a name ends: punctuation, a dash, or a word that starts what is said about it. */
function cut(raw: string): string {
  const stop = raw.search(
    /[,.;:!?()\n]|[ \t][-–][ \t]|[ \t](?:in|at|based|located|from|who|which|that|where|and[ \t]+we|we|is|are|em|en|que|com|con|para|é|es|son|são)(?![\p{L}\p{M}])/u,
  );
  return (stop < 0 ? raw : raw.slice(0, stop)).trim();
}

const words = (...lines: string[]) => new Set(lines.join(" ").split(" "));
/** A name never opens with these: they open a sentence about something else. */
const NOT_A_START = words(
  "we our us i my me this that these those it its there here they their he she his her you your",
  "today now currently hello hi a an in at from since based founded for with to by on",
  "nós nosso nossa nossos nossas este esta isto isso ele ela olá um uma em desde para",
  "nosotros nuestro nuestra nuestros nuestras hola un una en",
);
/** People, not an initiative: "Brazilian farmers" says who they are, not what the initiative is called. */
const PEOPLE = words(
  "farmers families students children women youth volunteers neighbours neighbors people residents artists growers gardeners",
  "parents teachers mothers fathers friends members beekeepers fishers fishermen",
  "agricultores famílias estudantes crianças mulheres jovens voluntários moradores artistas",
  "agricultoras familias estudiantes niños mujeres jóvenes voluntarios vecinos",
);

/** A name as written, or null when the words are not one. */
function plausible(raw: string): string | null {
  // Trailing spaces and punctuation, dropped by walking back, which costs one step a character.
  let end = raw.length;
  while (end > 0 && /[\s.,;:!?]/u.test(raw[end - 1]!)) end--;
  const name = raw.slice(0, end).trim();
  if (!name || name.length > 120 || /\/|@|\d{3,}/u.test(name)) return null;
  const parts = name.split(/[ \t]+/u);
  if (parts.length > 12) return null;
  if (!/^\p{Lu}/u.test(name) || NOT_A_START.has(parts[0]!.toLocaleLowerCase())) return null;
  // "Brazilian farmers": a capitalised word for where people are from, then who they are.
  const rest = parts.slice(1);
  if (rest.length && rest.every((word) => !/^\p{Lu}/u.test(word)) && PEOPLE.has(parts.at(-1)!.toLocaleLowerCase())) return null;
  return name;
}

/** "We are X", "We're the X", "Somos a X", "Somos la X", "Nós somos o X". */
function weAre(sentence: string): string | null {
  // Portuguese and Spanish take a definite article before a name; English "a" says what kind of group it is.
  const opening =
    sentence.match(/^(?:we[ \t]are|we['’]re)[ \t](?:the[ \t])?/iu) ??
    sentence.match(/^(?:nós[ \t])?somos[ \t](?:(?:o|a|os|as|el|la|los|las)[ \t])?/iu);
  return opening ? plausible(cut(sentence.slice(opening[0].length))) : null;
}

/** "At X, we" and "Here at X we": the name runs from "at" to the first "we" or "our". */
function atName(sentence: string): string | null {
  const opening = sentence.match(/^(?:here[ \t])?at[ \t]/iu);
  if (!opening) return null;
  const rest = sentence.slice(opening[0].length);
  const subject = rest.search(/,?[ \t](?:we|our)(?![\p{L}\p{M}])/iu);
  return subject > 0 ? plausible(rest.slice(0, subject)) : null;
}

/** Words that say the subject is an initiative, a group or a place of work, and not a person. */
export const KIND = wholeWords(
  /initiative|project|group|organi[sz]ation|collective|cooperative|co-op|coop|team|network|farm|school|centre|center|hub|community|association|programme|program|kitchen|nursery|library|circle|alliance|movement|foundation|trust|charity|non-?profit|enterprise|company|club|society|festival|lab|laboratory|studio|space|fund|campaign|coalition|union|council|garden|app|platform|business|startup|academy|institute|iniciativa|projeto|grupo|coletivo|cooperativa|associação|rede|horta|escola|biblioteca|comunidade|organização|movimento|fundação|instituto|centro|proyecto|colectivo|asociación|red|huerta|huerto|escuela|comunidad|organización|fundación/,
);

/** "X is a volunteer group", "X é uma cooperativa", "X es un colectivo", "X, a network of", and "X is based in". */
function isA(sentence: string): string | null {
  // Each shape is found where it first occurs, and the name is what comes before it.
  const based = sentence.search(/[ \t](?:is|are)[ \t](?:based|located|situated|headquartered)[ \t]in(?![\p{L}\p{M}])/u);
  if (based > 0) return plausible(sentence.slice(0, based));
  const verb = sentence.match(/[ \t](?:is|are|é|são|es|son)[ \t](?:a|an|the|one[ \t]of[ \t]the|um|uma|un|una|o|el|la)[ \t]/u);
  const comma = sentence.match(/,[ \t](?:a|an|the|um|uma|un|una|o|el|la)[ \t]/u);
  const found = verb && verb.index! > 0 ? verb : comma && comma.index! > 0 ? comma : null;
  if (!found) return null;
  // What it is said to be must be a kind of initiative, within its first few words.
  const kind = sentence.slice(found.index! + found[0].length).split(/[ \t]/u).slice(0, 8).join(" ");
  if (!KIND.test(kind)) return null;
  return plausible(sentence.slice(0, found.index!));
}

/** Words that make a first line a sentence rather than a name. */
const CLAUSE = words(
  "is are am was were be been has have had do does did will would can could should",
  "run runs work works working help helps make makes grow grows collect collects share shares teach teaches",
  "support supports bring brings build builds provide provides create creates plant plants restore restores",
  "started founded based located visit see",
  "é são era foi tem têm somos estamos trabalha trabalham ajuda ajudam",
  "es son está están trabaja trabajan ayuda ayudan",
  "we our us i my me they their he she it its you your who which that where when because but",
  "nós nosso nossa nosotros nuestro nuestra",
  "est sont une ist sind eine",
);

/**
 * A first line that is only a name, such as "Synthetic Garden" above the words about it, or a
 * first sentence of a few words such as "Orchard learning circle." A first clause that goes on
 * after a comma is the start of a sentence, not a name, so it never counts.
 */
function firstLine(text: string): string {
  const first = text.trimStart().match(/^([^,.!?\n]*)(?:[.!?]?(?:\n|$)|[.!?][ \t])/u)?.[1]?.trim() ?? "";
  if (!first || /[:/]/u.test(first)) return "";
  const parts = first.split(/[ \t]+/u);
  if (parts.length > 7 || parts.some((word) => CLAUSE.has(word.toLocaleLowerCase()))) return "";
  return plausible(first) ?? "";
}
