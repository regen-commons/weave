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
const PARTICLE = new RegExp(`^${JOIN}$`, "u");
const WHOLE_PLACE = new RegExp(`^${PLACE}$`, "u");

/** Words that say where something is: "based in", "located in", "in the town of". */
const TOWN = String.raw`the[ \t]+(?:town|city|village|municipality)[ \t]+of[ \t]+`;
const LOCATIVE = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?:(?:[Bb]ased|[Ll]ocated|[Ss]ituated|[Hh]eadquartered)[ \t]+in[ \t]+(?:${TOWN}|the[ \t]+)?|in[ \t]+${TOWN})(${PLACE})`,
  "gu",
);
/** Another place follows, so the words name a list rather than one place. */
const LIST = /^(?:[ \t]*,[ \t]*(?:(?:and|or)[ \t]+)?|[ \t]+(?:and|or|&)[ \t]+)(?:the[ \t]+)?\p{Lu}/u;
const LABEL =
  /^[ \t]*(?:locations?|where|place|based in|region|onde|localização|localizacao)[ \t]*:[ \t]*(\S[^\n]*?)[ \t]*$/gimu;

const words = (...lines: string[]) => new Set(lines.join(" ").split(" "));
/**
 * Capitalised words that start a sentence, join title-case words or name a time or a language,
 * never a place. A name stops at the first of them.
 */
const NOT_PLACES = words(
  "a an the this that these those our we us it its their they them he she his her i my you your there here",
  "and or on at by for from with to in into near since until during every each all some",
  "january february march april may june july august september october november december",
  "monday tuesday wednesday thursday friday saturday sunday mondays tuesdays wednesdays thursdays",
  "fridays saturdays sundays spring summer autumn fall winter",
  "english portuguese spanish french arabic",
);
/** A title or an abbreviation means the words are about a person or a street, or are cut short. */
const UNCLEAR = words("st ste mt ft dr mr mrs ms prof rev sr jr");
/** A labelled value that says where is not decided or is not a place. */
const UNDECIDED = words("tbd tbc tba n/a na none unknown various online remote virtual yes no sim não nao");

/**
 * Who the words are about: "we", "our garden", "our community garden", or the card's name. A
 * sentence may open with a time ("Today, we") and a clause may open after a comma or "and".
 */
const NOUN = String.raw`(?:initiative|garden|project|group|organisation|organization|collective|cooperative|co-op|coop|team|network|farm|school|centre|center|hub|community|association|work|programme|program|kitchen|nursery)`;
const OPENING = String.raw`(?:^|[,;:][ \t]*|[ \t](?:and|but)[ \t]+)(?:(?:[Tt]oday|[Nn]ow|[Cc]urrently|[Ss]ince[ \t]+\d{4}),?[ \t]+)?`;
const VERB = String.raw`(?:['’]re|[ \t]+(?:is|are|am|remain|remains))`;
const ADVERB = String.raw`(?:[ \t]+(?:now|still|currently|mainly|mostly|also))`;
/** "We are Synthetic Garden, a community garden based in…": a name, then what kind of initiative it is. */
const DESCRIPTION = String.raw`(?:[ \t]+${NAME},)?(?:[ \t]+(?:a|an)(?:[ \t]+[\p{Ll}-]+){1,5})?`;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function aboutInitiative(name: string): RegExp {
  const subjects = [String.raw`[Ww]e`, String.raw`[Oo]ur[ \t]+${NOUN}(?:[ \t]+${NOUN})?`];
  if (name.trim()) subjects.push(escape(name.trim()));
  return new RegExp(
    String.raw`(?:^|${OPENING}(?:${subjects.join("|")})(?:${VERB}${ADVERB}?${DESCRIPTION})?[ \t]+)$`,
    "u",
  );
}

/** The place a matched name holds: cut at a word that is not a place, or unclear when it cannot be one. */
function placeName(raw: string, after: string): { place: string; unclear: boolean; list: boolean } {
  const kept: string[] = [];
  let cut = false;
  for (const segment of raw.split(/,[ \t]*/u)) {
    const parts = segment.split(/[ \t]+/u);
    const stop = parts.findIndex((word) => NOT_PLACES.has(word.toLocaleLowerCase()));
    const name = stop < 0 ? parts : parts.slice(0, stop);
    while (name.length && PARTICLE.test(name.at(-1)!)) name.pop();
    if (name.length) kept.push(name.join(" "));
    if (stop >= 0) {
      cut = true;
      break;
    }
  }
  const place = kept.join(", ");
  const unclear =
    !place ||
    place.split(/[ \t,]+/u).some((word) => UNCLEAR.has(word.toLocaleLowerCase())) ||
    (!cut && /^[ \t]*\d/u.test(after));
  return { place, unclear, list: !cut && LIST.test(after) };
}

/** A labelled line is one place written with capitals, or global. Lists, counts and "TBD" say no place. */
function labelledWhere(value: string): StatedWhere {
  const where = value.replace(/\.$/u, "").trim();
  if (GLOBAL.test(where)) return { locations: [], isGlobal: true };
  if (!WHOLE_PLACE.test(where) || UNDECIDED.has(where.toLocaleLowerCase())) return NONE;
  const { place, unclear } = placeName(where, "");
  return place === where && !unclear ? { locations: [where.slice(0, 120)], isGlobal: false } : NONE;
}

const key = (place: string) => place.toLocaleLowerCase().split(/,[ \t]*/u);
/** "Awka" says less than "Awka, Nigeria", so the same place stated twice is still one place. */
const within = (short: string[], long: string[]) =>
  short.length < long.length && short.every((part, index) => part === long[index]);

/**
 * The place the words say the initiative is in, for the person to review on the check card.
 * A labelled line ("Location: Awka") is taken as written when it holds one place. Otherwise a
 * capitalised name counts after "based in", "located in", "situated in", "headquartered in" or
 * "in the town of", and only when the initiative says it about itself: "we", "our garden", the
 * card's name, or a sentence that opens with "Based in". A place that belongs to someone else, a
 * second place, a list, or an unclear phrase leaves Where empty. Nothing is added: no country,
 * region or map point the words do not state. The patterns are English, with Portuguese labels.
 * Only settled words should be passed, so a half-typed name is never proposed.
 */
export function statedWhere(text: string, name = ""): StatedWhere {
  const labelled = new Map<string, string>();
  for (const match of text.matchAll(LABEL)) labelled.set(match[1]!.toLocaleLowerCase(), match[1]!);
  if (labelled.size) return labelled.size === 1 ? labelledWhere([...labelled.values()][0]!) : NONE;

  // Every place the words locate something in must be the same one, whoever it belongs to.
  const subject = aboutInitiative(name);
  const mentioned: string[] = [];
  const stated: string[] = [];
  for (const match of text.matchAll(LOCATIVE)) {
    const { place, unclear, list } = placeName(match[1]!, text.slice(match.index + match[0].length));
    if (unclear || list) return NONE;
    mentioned.push(place);
    const sentence = text.slice(0, match.index).split(/[.!?\n]/u).at(-1)!.trimStart();
    if (subject.test(sentence)) stated.push(place);
  }
  const distinct = new Set(
    mentioned.filter((place) => !mentioned.some((other) => within(key(place), key(other)))).map((place) => key(place).join(", ")),
  );
  if (distinct.size !== 1 || !stated.length) return NONE;
  // The initiative's own words, at their most explicit: "Awka, Nigeria" over "Awka".
  const place = stated.reduce((best, next) => (key(next).length > key(best).length ? next : best));
  return { locations: [place.slice(0, 120)], isGlobal: false };
}
