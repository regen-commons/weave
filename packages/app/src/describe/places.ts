/** The card's Where as words state it: up to eight places as written, or global. */
export interface StatedWhere {
  locations: string[];
  isGlobal: boolean;
}

const NONE: StatedWhere = { locations: [], isGlobal: false };
const GLOBAL = /^(?:global|worldwide|anywhere|em todo o mundo)$/iu;

/** An answer to "Where does most of your work happen?", taken as written: one place per line or semicolon. */
export function whereFromAnswer(answer: string): StatedWhere {
  const where = answer.trim();
  if (GLOBAL.test(where)) return { locations: [], isGlobal: true };
  return {
    locations: where
      .split(/[;\n]/u)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((value) => value.slice(0, 120)),
    isGlobal: false,
  };
}

// A place is written with capitals: "Awka", "Rio de Janeiro", "Stratford-upon-Avon", "N'Djamena".
// An apostrophe followed by a lone s is a possessive, not part of the name.
const WORD = String.raw`\p{Lu}[\p{L}\p{M}]*(?:-\p{L}[\p{L}\p{M}]*|['’](?![sS](?![\p{L}\p{M}]))\p{L}[\p{L}\p{M}]*)*`;
const JOIN = String.raw`(?:de|da|do|das|dos|del|di|du|of|la|le|el)`;
const NAME = String.raw`${WORD}(?:[ \t]+(?:${JOIN}[ \t]+)?${WORD}){0,4}`;
const PLACE = String.raw`${NAME}(?:,[ \t]*${NAME}){0,2}`;
const START = String.raw`(?<![\p{L}\p{M}])`;
const PARTICLE = new RegExp(`^${JOIN}$`, "u");
const THE = String.raw`(?:the[ \t]+)?`;
/** How an initiative relates to a place in its own words: based in, works in, or "the town of". */
const IN = String.raw`(?:[Bb]ased|[Ll]ocated|[Ss]ituated|[Hh]eadquartered|[Ww]ork(?:s|ing)?|[Oo]perat(?:e|es|ing))[ \t]+in`;
const OF = String.raw`(?:[Tt]own|[Cc]ity|[Vv]illage|[Mm]unicipality)[ \t]+of`;
const STATED = new RegExp(String.raw`${START}(?:${IN}|${OF})[ \t]+${THE}(${PLACE})`, "gu");
/** "in Awka, Nigeria": a bare "in" counts only with a comma between two capitalised names. */
const IN_PAIR = new RegExp(String.raw`${START}[Ii]n[ \t]+${THE}(${NAME},[ \t]*${PLACE})`, "gu");
/** Another place follows, so the words name a list rather than one place. */
const LIST = /^(?:[ \t]*,[ \t]*(?:(?:and|or)[ \t]+)?|[ \t]+(?:and|or|&)[ \t]+)(?:the[ \t]+)?\p{Lu}/u;
const LABEL =
  /^[ \t]*(?:locations?|where|places?|based in|region|onde|local|localização|localizacao)[ \t]*:[ \t]*(\S[^\n]*?)[ \t]*$/gimu;
/**
 * Capitalised words that start a sentence, join title-case words or name a time or a language,
 * never a place. A name stops at the first of them.
 */
const NOT_PLACES = new Set(
  [
    "a an the this that these those our we us it its their they them he she his her i my you your there here",
    "and or on at by for from with to in into near since until during every each all some",
    "january february march april may june july august september october november december",
    "monday tuesday wednesday thursday friday saturday sunday mondays tuesdays wednesdays thursdays",
    "fridays saturdays sundays spring summer autumn fall winter",
    "english portuguese spanish french arabic",
  ]
    .join(" ")
    .split(" "),
);

/** The leading part of a matched name that is a place, or "" when it opens with a word that is not one. */
function placeOnly(raw: string): { place: string; cut: boolean } {
  const kept: string[] = [];
  for (const segment of raw.split(/,[ \t]*/u)) {
    const words = segment.split(/[ \t]+/u);
    const stop = words.findIndex((word) => NOT_PLACES.has(word.toLocaleLowerCase()));
    if (stop === 0) return { place: kept.join(", "), cut: true };
    if (stop > 0) {
      const name = words.slice(0, stop);
      while (name.length && PARTICLE.test(name.at(-1)!)) name.pop();
      kept.push(name.join(" "));
      return { place: kept.join(", "), cut: true };
    }
    kept.push(words.join(" "));
  }
  return { place: kept.join(", "), cut: false };
}

const key = (place: string) => place.toLocaleLowerCase().split(/,[ \t]*/u);
/** "Awka" says less than "Awka, Nigeria", so the same place stated twice is still one place. */
const within = (short: string[], long: string[]) =>
  short.length < long.length && short.every((part, index) => part === long[index]);

/**
 * The place words state explicitly, for the person to review on the check card. A labelled line
 * ("Location: Awka") is taken as written. Otherwise a capitalised name counts after "based in",
 * "located in", "works in", "operates in", "the town of" or "the city of", or after
 * "in" with a comma ("in Awka, Nigeria"). Only one place is proposed. Two different places, a
 * list, or none leave Where empty. Nothing is added: no country, region or map point the words do
 * not state. The patterns are English, with Portuguese labels.
 */
export function statedWhere(text: string): StatedWhere {
  const labelled = new Map<string, string>();
  for (const match of text.matchAll(LABEL)) labelled.set(match[1]!.toLocaleLowerCase(), match[1]!);
  if (labelled.size) return labelled.size === 1 ? whereFromAnswer([...labelled.values()][0]!) : NONE;

  const found = new Map<string, string>();
  for (const [pattern, parts] of [
    [STATED, 1],
    [IN_PAIR, 2],
  ] as const)
    for (const match of text.matchAll(pattern)) {
      const { place, cut } = placeOnly(match[1]!);
      if (!place || key(place).length < parts) continue;
      if (!cut && LIST.test(text.slice(match.index + match[0].length))) return NONE;
      found.set(place.toLocaleLowerCase(), place);
    }
  const places = [...found.values()].filter(
    (place) => ![...found.values()].some((other) => within(key(place), key(other))),
  );
  return places.length === 1 ? { locations: [places[0]!.slice(0, 120)], isGlobal: false } : NONE;
}
