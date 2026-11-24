import { CLAUSE, heard, KIND, spokenLabels } from "./names.ts";

/**
 * The words a place is looked for in, made cheap to read whatever was given: the first 20,000
 * characters, with one kind of line end and a run of spaces as one space. Where an initiative is
 * is said early, and a file of hundreds of pages is not read for it. A second place stated after
 * that is not seen, so it does not keep the first from being proposed.
 */
const HEAD = 20_000;
function readable(text: string): string {
  return text.slice(0, HEAD).replace(/\r\n?/gu, "\n").replace(/[ \t]{2,}/gu, " ");
}
/** How far back a sentence's subject is looked for, and how far on a list is. Each match costs no more. */
const BEFORE = 400;
const AFTER = 200;
/** The sentence up to a match, or null when it began further back than is read. */
function before(text: string, index: number): string | null {
  const start = Math.max(0, index - BEFORE);
  const parts = text.slice(start, index).split(/[.!?\n]/u);
  if (parts.length === 1 && start > 0) return null;
  return parts.at(-1)!.trimStart();
}
/** The words after a match, as far as a list or a cut-off name can be told from them. */
const after = (text: string, match: RegExpExecArray | RegExpMatchArray) =>
  text.slice(match.index! + match[0].length, match.index! + match[0].length + AFTER);

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

/**
 * The plainer ways people say where they are: "in", "across", "from", and Portuguese "em", "no",
 * "na" and Spanish "en", "desde". These words also introduce sectors ("we work in Education"),
 * languages, dates and other people's places, so a place after them counts only when the
 * initiative is the subject and says what it is: "We are a school garden in Nairobi", "Our group
 * is in Lamu", "Riverbend Seed Library is a volunteer group in Porto Alegre", "Bee Corridors, a
 * network of beekeepers across Ghana", "Somos a Horta Vila Nova, em Porto Alegre", or a sentence
 * that opens "In Lagos, we". A verb such as "work", "operate", "grow" or "were" never counts.
 */
const NEAR = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?<!(?:[Bb]ased|[Ll]ocated|[Ss]ituated|[Hh]eadquartered)[ \t])(?:in|In|across|Across|throughout|from|From|em|Em|no|na|nos|nas|en|En|desde|Desde)[ \t]+(${PLACE})`,
  "gu",
);
/** Words in a description that say the place belongs to someone the initiative works with. */
const ELSEWHERE = words("with for to and or by alongside com para e ou con y");
const ARTICLE = String.raw`(?:the|The|o|a|os|as|el|la|los|las)`;
const KIND_ARTICLE = String.raw`(?:a|an|um|uma|un|una)`;
/**
 * The subject and a form of "be", and what it says it is: "We are a school garden", "Somos la
 * Red de Semillas del Sur, un colectivo", "X is a volunteer group", "X, a network of beekeepers".
 */
function nearSubject(name: string): RegExp {
  const be = [
    String.raw`[Ww]e(?:['’]re|[ \t]+are)`,
    String.raw`(?:[Nn]ós[ \t]+)?[Ss]omos`,
    String.raw`[Ee]stamos`,
    String.raw`[Oo]ur[ \t]+${NOUN}(?:[ \t]+${NOUN})?[ \t]+(?:is|are)`,
  ];
  if (name.trim()) be.push(String.raw`${escape(name.trim())}[ \t]+(?:is|are|é|são|es|son|está|están)`);
  const apposition = name.trim() ? String.raw`|${escape(name.trim())},[ \t]+${KIND_ARTICLE}(?:[ \t]+[\p{Ll}-]+){1,6}` : "";
  // What it is: an article and a name ("the Red de Semillas del Sur,"), then a kind ("a school garden").
  const what = String.raw`(?:[ \t]+${ARTICLE})?(?:[ \t]+${NAME},?)?(?:[ \t]+${KIND_ARTICLE})?(?:[ \t]+[\p{Ll}-]+){0,6}`;
  return new RegExp(String.raw`(?:^|[,;:][ \t]*)(?:(?:${be.join("|")})${what}${apposition})[ \t]+$`, "u");
}
/**
 * True when what the subject says it is names no one else: no "with", "for" or "and" after the
 * form of "be", and no "working" or "based" where a kind of group should be.
 */
function ownDescription(prefix: string): boolean {
  const said = prefix.split(/[ \t,]+/u).filter(Boolean);
  const be = said.findIndex((word) => /^(?:are|is|somos|estamos|é|são|es|son|está|están|we['’]re)$/iu.test(word));
  const what = said.slice(be + 1);
  if (what.some((word) => ELSEWHERE.has(word.toLocaleLowerCase()))) return false;
  // "We are working in Partnership": a verb, not what the initiative is.
  const first = what[0];
  return !first || !/^\p{Ll}[\p{L}\p{M}]*(?:ing|ed)$/u.test(first);
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

/**
 * The place the words say the initiative is in, for the person to review on the check card.
 * A labelled line ("Location: Awka") is taken as written when it holds one place. Otherwise a
 * capitalised name counts after "based in", "located in", "situated in", "headquartered in" or
 * "in the town of", and only when the initiative says it about itself: "we", "our garden", the
 * card's name, or a sentence that opens with "Based in". After "in", "across", "from" and their
 * Portuguese and Spanish words, a name counts only as `NEAR` says. A place that belongs to someone else, a
 * second place, a list, or an unclear phrase leaves Where empty. Nothing is added: no country,
 * region or map point the words do not state. The patterns are English, with Portuguese and Spanish
 * for the plainer words.
 * Only settled words should be passed, so a half-typed name is never proposed.
 */
export function statedWhere(words: string, name = ""): StatedWhere {
  const text = readable(words);
  const labelled = new Map<string, string>();
  for (const match of text.matchAll(LABEL)) labelled.set(match[1]!.toLocaleLowerCase(), match[1]!);
  if (labelled.size) return labelled.size === 1 ? labelledWhere([...labelled.values()][0]!) : NONE;

  // Every place the words locate something in must be the same one, whoever it belongs to.
  const subject = aboutInitiative(name);
  const mentioned: string[] = [];
  const stated: string[] = [];
  for (const match of text.matchAll(LOCATIVE)) {
    const { place, unclear, list } = placeName(match[1]!, after(text, match));
    if (unclear || list) return NONE;
    mentioned.push(place);
    const sentence = before(text, match.index);
    if (sentence !== null && subject.test(sentence)) stated.push(place);
  }
  // The plainer words count only for the initiative itself, so they never add someone else's place.
  const near = nearSubject(name);
  for (const match of text.matchAll(NEAR)) {
    const next = after(text, match);
    const { place, unclear, list } = placeName(match[1]!, next);
    // "in January", "from The", "in Partnership with": not a place at all, and not a reason to doubt the others.
    if (!place || place.split(/[ \t,]+/u).some((word) => NOT_WHERE.has(word.toLocaleLowerCase()))) continue;
    const sentence = before(text, match.index);
    if (sentence === null) continue;
    const opens = !sentence.trim() && /^,?[ \t]*(?:we|our|nós|nosotros)(?![\p{L}\p{M}])/iu.test(next);
    if (!opens && !(near.test(sentence) && ownDescription(sentence))) continue;
    // "From" names a hometown as often as a base: "students from Unilag". It counts only when the
    // initiative has said it is a kind of group: "a seed library from Lancashire".
    if (/^(?:from|desde)$/iu.test(match[0].split(/[ \t]/u)[0]!) && !opens && !KIND.test(sentence)) continue;
    if (unclear || list) return NONE;
    mentioned.push(place);
    stated.push(place);
  }
  // "Awka" says less than "Awka, Nigeria": a place that begins a longer one stated here is the same
  // place. Every shorter beginning of every mention is noted once, so this is one pass, however
  // many times a place is mentioned.
  const keys = mentioned.map(key);
  const beginnings = new Set(keys.flatMap((parts) => parts.slice(0, -1).map((_, end) => parts.slice(0, end + 1).join(", "))));
  const distinct = new Set(keys.map((parts) => parts.join(", ")).filter((joined) => !beginnings.has(joined)));
  if (distinct.size !== 1 || !stated.length) return NONE;
  // The initiative's own words, at their most explicit: "Awka, Nigeria" over "Awka".
  const place = stated.reduce((best, next) => (key(next).length > key(best).length ? next : best));
  return { locations: [place.slice(0, 120)], isGlobal: false };
}

/** No spoken place is longer than this many words, and no more than this many are read to find its end. */
const SPOKEN_PLACE_WORDS = 4;
const SPOKEN_PLACE_READ = 7;
const SPOKEN_LOCATIVE =
  /(?<![\p{L}\p{M}])(?:based|located|situated|headquartered)[ \t]+in[ \t]+(?:like[ \t]+)?(?:the[ \t]+(?:town|city|village|municipality)[ \t]+of[ \t]+|(the)[ \t]+)?/giu;
/** Where a spoken place ends: the word that starts the next thing said. */
const PLACE_STOP = words(
  "we we're we’re and or but where which who that our i i'm i’m it it's it’s is are was to for with because so since",
  "a an the in on at by this they there here also now",
);
/** After "and", these go on with the sentence; any other word names a second place. */
const GOES_ON = words("we we're we’re i i'm i’m our it it's it’s they also have are is then");
/** Words that say what kind of place, or how many, and never which. */
const NOT_NAMED = words(
  "rural urban local remote online several many various different multiple two three four communities community",
  "villages village schools towns cities areas regions places countries cloud internet field countryside",
  // Kinds of place, never which one: "Refugee Camps", "five counties of Kenya".
  "counties districts provinces camps settlements shelters hospitals clinics prisons slums",
);
/**
 * What an initiative works in that is not a place: "we work in education", "our work is in
 * partnership with", "it's in Swahili".
 */
const NOT_WHERE = words(
  "education health healthcare agriculture conservation partnership collaboration technology tech energy climate water",
  "housing research science policy advocacy development sustainability regeneration permaculture agroforestry forestry",
  "farming finance media arts culture tourism nutrition sanitation biodiversity restoration progress person touch",
  "phase year stage round grade beta season talks need charge",
  "management security services rights justice design software hardware engineering construction manufacturing",
  "logistics retail fintech crypto blockchain data law governance peacebuilding humanitarian relief aid welfare",
  "wellbeing wellness medicine sports sport music film fashion food transport mobility infrastructure mining fishing",
  "aquaculture livestock dairy horticulture beekeeping recycling waste plastics carbon forests oceans marine wildlife",
  "ecology environment communications marketing sales operations teams shifts pairs groups partnerships sectors",
  "borders disciplines generations cultures",
  // Where people find an initiative online, said with "en" or "in" as a place is: "Estamos en Facebook".
  "facebook instagram whatsapp youtube tiktok linkedin twitter telegram zoom google discord slack",
  "quechua aymara guarani nahuatl creole patois pidgin wolof",
  // "We work in support of Ukraine", "in memory of", "in honour of": a cause, not a place.
  "support memory honour honor solidarity",
  "swahili kiswahili hindi german chinese mandarin yoruba igbo hausa zulu amharic italian dutch russian japanese korean turkish",
);
/** A word before a country that is part of its name as said, with no comma between: "Western Kenya". */
const PART_OF = words("north south east west northern southern eastern western central coastal upper lower greater");

/** Regions the browser names that are not places a person works in, and names people say that it does not list. */
const NOT_COUNTRIES = new Set(["ZZ", "XA", "XB", "QO", "EZ", "UN"]);
const ALSO_SAID = "usa|uk|uae|drc|england|scotland|wales|ivory coast|congo|burma|turkey|czech republic|palestine|cape verde|east timor|swaziland|macedonia|kinshasa|brazzaville";
let countryNames: Set<string> | undefined;
/**
 * Country names in English and in lower case, as the browser lists them. A place said without a
 * capital is taken after the plainer words ("we work in") only when it names one of these, and a
 * place said without capitals ends at its country. No list is shipped: a browser without the
 * names keeps the few above, and a place then needs its capital.
 */
function countries(): Set<string> {
  if (countryNames) return countryNames;
  const names = new Set(ALSO_SAID.split("|"));
  try {
    const regions = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    for (let first = 65; first <= 90; first++)
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const name = NOT_COUNTRIES.has(code) ? undefined : regions.of(code);
        if (!name) continue;
        // "Hong Kong SAR China" is Hong Kong, "Myanmar (Burma)" is Myanmar and Burma, "Congo - Kinshasa"
        // is Congo, and "Cocos (Keeling) Islands" is Cocos Islands. Only whole names are kept, so
        // "islands" or "keeling" alone is never a country.
        const plain = name.replace(/ SAR China$/u, "");
        const forms = [
          plain.replace(/[ \t]*\([^()]*\)[ \t]*/gu, " ").replace(/[ \t]+-[ \t]+.*$/u, "").trim(),
          plain.match(/^[^()]+\(([^()]+)\)$/u)?.[1]?.trim() ?? "",
        ];
        for (const form of forms)
          if (form) names.add(form.toLocaleLowerCase().replaceAll("’", "'").replaceAll("&", "and").replaceAll(".", ""));
      }
  } catch {
    // Left with the names above.
  }
  return (countryNames = names);
}
/** The first country the words name, as the span of words that hold it. */
function countryIn(lower: readonly string[]): { start: number; end: number } | null {
  const names = countries();
  for (let start = 0; start < lower.length; start++)
    for (let size = Math.min(4, lower.length - start); size > 0; size--)
      if (names.has(lower.slice(start, start + size).join(" ").replaceAll("’", "'"))) return { start, end: start + size };
  return null;
}

/** A spoken place as it would be written: a capital on each word that has none, joining words apart. */
const titledPlace = (parts: readonly string[]) =>
  parts
    .map((word, index) =>
      // "Rio de Janeiro", "Bosnia and Herzegovina": joining words keep their small letter.
      /\p{Lu}/u.test(word) || (index > 0 && (PARTICLE.test(word) || /^(?:and|y|e)$/u.test(word)))
        ? word
        : word.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase()),
    )
    .join(" ");
/** Words before a country that make one name with it, with no comma between: "New Mexico", "Lake Chad", "Mount Kenya". */
const ONE_NAME = words("new nueva nuevo nova novo lake lago gulf golfo mount monte");
/** Words before "of" that make one place with the country after it: "Republic of Ireland", "the coast of Kenya", "Estado de México". */
const OF_HEAD = words(
  "republic bay isle island kingdom state province region sea coast interior",
  "república estado ciudad cidade provincia província región região reino bahía baía isla ilha costa norte sur sul este oeste leste centro",
);
/** A word with a hyphen that describes a country rather than naming a part of it: "war-torn", "drought-hit", "post-war". */
const DESCRIBES =
  /^(?:\p{Ll}[\p{L}\p{M}]*-(?:torn|hit|affected|stricken|ravaged|prone|ridden|struck|damaged|scarred|battered|plagued|held|occupied|controlled|speaking)|post-\p{Ll}[\p{L}\p{M}]*)$/u;
/** Parts said with the country that holds them, "Scotland, UK" or "Georgia, USA": one place, not a list of two. */
const HELD: readonly (readonly [string, string])[] = [
  ["england|scotland|wales|gibraltar|jersey|guernsey|isle of man|bermuda|cayman islands|falkland islands|anguilla|montserrat|british virgin islands", "uk|united kingdom"],
  ["georgia|puerto rico|guam|american samoa|northern mariana islands", "usa|united states"],
  ["hong kong|macao", "china"],
  ["kinshasa", "drc|congo"],
  ["brazzaville", "congo"],
  ["greenland|faroe islands", "denmark"],
  ["canary islands", "spain"],
  ["french guiana|guadeloupe|martinique|réunion|mayotte|new caledonia|french polynesia", "france"],
  ["aruba|curaçao|sint maarten|caribbean netherlands", "netherlands"],
  ["christmas island|norfolk island", "australia"],
  ["cook islands|niue|tokelau", "new zealand"],
  ["åland islands", "finland"],
];
const heldBy = (part: string, whole: string) => HELD.some(([parts, wholes]) => parts.split("|").includes(part) && wholes.split("|").includes(whole));
/** Words after a country said without capitals that make it another place or a firm: "the niger delta", "kenya power", "jordan valley". */
const NOT_THE_COUNTRY = words("delta valley basin state city power bank airways airlines telecom post railways plateau highlands coast");
/** Words after a country written with capitals that make it a firm, an event or a building: "the Ghana Commercial Bank", "the Kenya Seed Fair". */
const INSTITUTION = words(
  "bank commercial power airways airlines telecom seed fair hall pavilion fund foundation university hospital school college council",
  "ministry embassy society association club company group ltd inc corporation authority board climate challenge",
);
/** Country names that are also an everyday word: "chile farming" is not Chile. */
const COMMON_WORDS = words("chile china jersey turkey cuba chad jordan georgia niger guinea mali peru malta jamaica panama");

interface SpokenPlace {
  place: string;
  /** A second place follows, so the words name a list. */
  list: boolean;
  /** The place was given its capital, or names a country: it is a place and not some other word. */
  known: boolean;
  country: boolean;
}

/**
 * The place the words open with, or null when they do not settle on one. A place given capitals
 * ends at the first word without one, as a written place does. A place without them ends at the
 * word that starts the next thing said, or at its country: "nairobi kenya schools love us" is
 * Nairobi, Kenya. `afterThe` is true for "in the …", which names a place only when it is known.
 */
function spokenPlace(rest: string, afterThe = false): SpokenPlace | null {
  const tokens = [...rest.slice(0, AFTER).matchAll(/[^ \t,.;:!?\n]+|[,.;:!?\n]/gu)].map((match) => match[0]);
  const capital = /^\p{Lu}/u.test(tokens[0] ?? "");
  let said: string[] = [];
  /** The words a comma came before. */
  const breaks = new Set<number>();
  let list = false;
  /** The word the place stopped at, when a word ended it. */
  let endedAt = "";
  for (const [index, token] of tokens.entries()) {
    const lower = token.toLocaleLowerCase();
    if (token === ",") {
      if (said.length) breaks.add(said.length);
      continue;
    }
    // "Bosnia and Herzegovina" is one country, not a list of two places.
    const oneCountry =
      lower === "and" &&
      said.length > 0 &&
      [1, 2].some((ahead) => countries().has([said.at(-1)!, "and", ...tokens.slice(index + 1, index + 1 + ahead)].join(" ").toLocaleLowerCase()));
    const joins = said.length > 0 && (PARTICLE.test(lower) || oneCountry);
    const ends =
      /^[.;:!?\n]$/u.test(token) ||
      (!joins && PLACE_STOP.has(lower)) ||
      (said.length > 0 && /^\p{Ll}[\p{L}\p{M}]*ing$/u.test(token)) ||
      (capital && !joins && !/^\p{Lu}/u.test(token));
    if (!/^[.;:!?\n]$/u.test(token) && !/^\p{L}/u.test(token)) return null;
    if (ends) {
      endedAt = token;
      const next = tokens[index + 1];
      const after = next?.toLocaleLowerCase() ?? "";
      list =
        (lower === "and" || lower === "or") &&
        !!next &&
        !GOES_ON.has(after) &&
        (capital ? /^\p{Lu}/u.test(next) : !CLAUSE.has(after) && !/ing$/u.test(after));
      break;
    }
    if (said.length === SPOKEN_PLACE_READ) break;
    said.push(token);
  }
  // A possessive that ends the words names someone's thing, not a place: "Georgia's garden", "Kenya
  // Power's depot". One inside a place's name stays: "Cox's Bazar", "Kenya's Rift Valley".
  if (/['’]s$/iu.test(said.at(-1) ?? "")) return null;
  // "the Democratic Republic of the Congo", "the University of the West Indies": the words stopped
  // at "of the", short of the place they name.
  if (endedAt.toLocaleLowerCase() === "the" && /^of$/iu.test(said.at(-1) ?? "")) return null;
  // "hospitals across kenya": a place does not run across another.
  if (said.some((word) => /^(?:across|throughout)$/iu.test(word))) return null;
  const found = countryIn(said.map((word) => word.toLocaleLowerCase()));
  // "the Ghana Commercial Bank", "the Kenya Seed Fair": a country that starts a firm's or an event's name.
  if (found && capital && said.slice(found.end).some((word) => INSTITUTION.has(word.toLocaleLowerCase()))) return null;
  if (found && !capital) {
    const next = (said[found.end] ?? endedAt).toLocaleLowerCase() || undefined;
    // "the niger delta", "kenya power offices", "jordan valley": another place, or a firm.
    if (next && NOT_THE_COUNTRY.has(next)) return null;
    // "chile farming": a country's name that is also a word, said before what it names.
    if (found.start === 0 && found.end - found.start === 1 && COMMON_WORDS.has(said[0]!.toLocaleLowerCase()) && !/^\p{Lu}/u.test(said[0]!) && next && NOT_WHERE.has(next))
      return null;
    // Another country straight after the first is a list: "kenya uganda tanzania".
    if (countryIn(said.slice(found.end).map((word) => word.toLocaleLowerCase()))?.start === 0) list = true;
    said = said.slice(0, found.end);
  }
  while (said.length && (PARTICLE.test(said.at(-1)!) || said.at(-1)!.toLocaleLowerCase() === "and")) said.pop();
  if (!said.length || said.length > (found ? SPOKEN_PLACE_READ : SPOKEN_PLACE_WORDS)) return null;
  const lower = said.map((word) => word.toLocaleLowerCase());
  // A country's own words are not doubted: the "and" of "Bosnia and Herzegovina" is part of its name.
  const doubted = lower.filter((_, index) => !found || index < found.start || index >= found.end);
  if (doubted.some((word) => NOT_NAMED.has(word) || NOT_WHERE.has(word) || UNCLEAR.has(word) || UNDECIDED.has(word) || NOT_PLACES.has(word)))
    return null;
  // A word all in capitals is an abbreviation, not a capital on a place: "WASH programmes", "ICT".
  const shouted = said.some((word, index) => doubted.includes(lower[index]!) && /^\p{Lu}{2,}$/u.test(word));
  const known = (capital && !shouted) || !!found;
  if (afterThe && !known) return null;
  // "Kenya, Uganda, Rwanda": a country, a comma and another country are a list, not a place and its region.
  if (found && found.start === 0 && breaks.has(found.end) && countryIn(lower.slice(found.end))?.start === 0) {
    const second = countryIn(lower.slice(found.end))!;
    const part = lower.slice(found.start, found.end).join(" ");
    const whole = lower.slice(found.end, found.end + second.end).join(" ");
    // "Scotland, UK" and "Georgia, USA" are a part and its country, as written; "Panama, Panama" is one place said twice.
    if (whole !== part && !heldBy(part, whole)) list = true;
  }
  const prior = found && found.start > 0 ? lower[found.start - 1]! : "";
  // "the university of ghana", "parts of kenya": a country after "of" makes one place with the word
  // before only when that word names a place, as in "Gulf of Mexico" or "north of Kenya".
  if (found && found.start > 1 && PARTICLE.test(prior)) {
    const head = lower[found.start - 2]!;
    if (!OF_HEAD.has(head) && !ONE_NAME.has(head) && !PART_OF.has(head)) return null;
  }
  // "war-torn South Sudan", "drought-hit northern kenya": the word describes the country and is no part of the place.
  if (found && found.start >= 1 && DESCRIBES.test(said[0]!) && lower.slice(1, found.start).every((word) => PART_OF.has(word))) {
    said = said.slice(1);
    return { place: titledPlace(said), list, known, country: true };
  }
  // "nairobi kenya" is written "Nairobi, Kenya"; "western kenya", "new jersey" and "gulf of mexico" have no comma to add.
  if (found && found.start > 0 && !PART_OF.has(prior) && !ONE_NAME.has(prior) && !PARTICLE.test(prior)) breaks.add(found.start);
  const segments: string[][] = [[]];
  for (const [index, word] of said.entries()) {
    if (breaks.has(index) && segments.at(-1)!.length) segments.push([]);
    segments.at(-1)!.push(word);
  }
  return { place: segments.map(titledPlace).join(", "), list, known, country: !!found };
}

/** Who a spoken "based in" is about: "we are", "we're a seed library", "our garden is", or the card's name. */
function spokenSubject(name: string): RegExp {
  // "Our initiative, the Green Corridor Project, is": its name may be set off by commas. "Green
  // Earth, our partner organisation, is" opens with someone else, so it is not this.
  const be = String.raw`(?:we[ \t]+are|we['’]re|i[ \t]+am|i['’]m|it[ \t]+is|it['’]s|our[ \t]+${NOUN}(?:[ \t]+${NOUN})?(?:,[^,.;:!?\n]{2,80},)?[ \t]+(?:is|are))`;
  const what = String.raw`(?:[ \t]+(?:now|still|currently|mainly|mostly|also))?(?:[ \t]+(?:a|an)(?:[ \t]+[\p{L}\p{M}-]+){1,5})?`;
  const named = name.trim()
    ? String.raw`|(?:${be}[ \t]+)?(?:the[ \t]+)?${escape(name.trim())}(?:,?[ \t]+(?:a|an)(?:[ \t]+[\p{L}\p{M}'’-]+){1,5})?(?:[ \t]+(?:is|are)|,?[ \t]+which[ \t]+(?:is|are))?`
    : "";
  return new RegExp(String.raw`(?:^|(?:^|[ \t,])(?:and[ \t]+)?(?:${be}${what}${named}),?[ \t]*)$`, "iu");
}

/**
 * The plainer ways people say aloud where the initiative is, each with it as the subject: "we're
 * in", "we operate out of", "our office is in", "it's in", "where we work is", "location is",
 * and the card's name followed by "in". The same words open things that are not places ("we're
 * in our third year", "it's in Swahili"), so `spokenWhere` takes what follows only when it is
 * known to be a place. "We work in" is apart, in `workLocatives`. "We're from" is not read: it
 * says a hometown as often as a base.
 */
function ownLocatives(name: string): RegExp {
  const adverb = String.raw`(?:[ \t]+(?:mainly|mostly|currently|also|now|primarily))?`;
  const forms = [
    String.raw`(?:we[ \t]+are|we['’]re)${adverb}[ \t]+(?:in|out[ \t]+of)`,
    String.raw`(?:we|i)${adverb}[ \t]+(?:work|operate)[ \t]+out[ \t]+of`,
    String.raw`our[ \t]+(?:office|base|headquarters|${NOUN})[ \t]+(?:is|are)${adverb}[ \t]+in`,
    String.raw`(?:it[ \t]+is|it['’]?s)${adverb}[ \t]+in`,
    String.raw`where[ \t]+(?:we|i)[ \t]+work[ \t]+is(?:[ \t]+in)?`,
    String.raw`(?:(?:the|our|its)[ \t]+)?location(?:[ \t]+is(?:[ \t]+in)?|[ \t]*:)`,
  ];
  if (name.trim()) forms.push(String.raw`${escape(name.trim())},?[ \t]+(?:(?:is|are)[ \t]+)?in`);
  return new RegExp(String.raw`(?<![\p{L}\p{M}'’-])(?:${forms.join("|")})[ \t]+(?:like[ \t]+)?(?:(the)[ \t]+)?`, "giu");
}
/**
 * "We work in", "we operate across" and "our project works in". They name a sector as often as a
 * place ("we work in education"), so the keyword rules never read a place after them in a file
 * (19 November 2026). In the person's own words they answer what the page asks, where you work,
 * so there they are read, and only where what follows is known to be a place (the owner's
 * decision, 21 November 2026).
 */
function workLocatives(name: string): RegExp {
  const adverb = String.raw`(?:[ \t]+(?:mainly|mostly|currently|also|now|primarily))?`;
  const forms = [
    String.raw`(?:we|i)${adverb}[ \t]+(?:work|operate|are[ \t]+working|are[ \t]+operating)${adverb}[ \t]+(?:in|across|throughout)`,
    String.raw`(?:the|our|this)[ \t]+${NOUN}[ \t]+(?:works|operates|runs|takes[ \t]+place)${adverb}[ \t]+(?:in|across|throughout)`,
  ];
  if (name.trim()) forms.push(String.raw`${escape(name.trim())},?[ \t]+(?:works|work|operates|operate)${adverb}[ \t]+(?:in|across|throughout)`);
  return new RegExp(String.raw`(?<![\p{L}\p{M}'’-])(?:${forms.join("|")})[ \t]+(?:like[ \t]+)?(?:(the)[ \t]+)?`, "giu");
}
/** "A Nairobi based group", "we are a Kenya-based nonprofit": the place is said before "based". */
const BASED_AFTER =
  /(?<![\p{L}\p{M}'’-])(?:an?|we[ \t]+are|we['’]re|is)[ \t]+((?:[\p{L}\p{M}'’]+[ \t]+){0,3}[\p{L}\p{M}'’]+)[ -]based(?![\p{L}\p{M}]|[ \t]+in(?![\p{L}\p{M}]))/giu;
const NOT_BASED = words("faith volunteer web home school land nature place research membership science evidence church youth women farmer");

const placeWords = (place: string) => place.toLocaleLowerCase().split(/[ \t,]+/u).filter(Boolean);
/** True when one place's words are found, in order and together, in the other's: "Nairobi" in "Nairobi, Kenya". */
function within(small: readonly string[], big: readonly string[]): boolean {
  for (let start = 0; start + small.length <= big.length; start++)
    if (small.every((word, index) => big[start + index] === word)) return true;
  return false;
}

/**
 * The place as speech gives it. Many browsers return what was said without full stops, and with a
 * capital only on the places they know: "we are orchard learning circle and we work in Nairobi
 * we help families". `statedWhere` reads a place by its sentence, so it finds none there. This
 * reads "based in", "located in", "situated in" and "headquartered in" in any case, and the
 * plainer words of `ownLocatives` where what follows is known to be a place: it has a capital,
 * or it names a country. It holds to the same rules as the written words: the initiative says it
 * about itself, every place so stated is the same one, and a list or a phrase that names no one
 * place leaves Where empty. It is for words `statedWhere` found no place in, and it gives the
 * place the capitals and comma a written place has. Nothing is added. `own` is the part of the
 * words the person said or typed themself: only there is "we work in" read, as `workLocatives` says.
 */
export function spokenWhere(words: string, name = "", own = ""): StatedWhere {
  const text = heard(readable(words));
  const mentioned: string[] = [];
  const stated: string[] = [];
  // The three things the page asks for, said as labels: the place is what follows "location".
  const labels = spokenLabels(text);
  if (labels) {
    // Up to a third label the words are the place, whatever they are. Without one, a place must be known to be one.
    const found = spokenPlace(labels.where || labels.after);
    const whole = !!found && (labels.where ? placeWords(found.place).length === placeWords(labels.where).length : found.known);
    return found && whole && !found.list ? { locations: [found.place.slice(0, 120)], isGlobal: false } : NONE;
  }
  const subject = spokenSubject(name);
  for (const match of text.matchAll(SPOKEN_LOCATIVE)) {
    const found = spokenPlace(text.slice(match.index + match[0].length), !!match[1]);
    if (!found || found.list) return NONE;
    mentioned.push(found.place);
    const sentence = before(text, match.index);
    if (sentence !== null && subject.test(sentence)) stated.push(found.place);
  }
  for (const match of text.matchAll(ownLocatives(name))) {
    const found = spokenPlace(text.slice(match.index + match[0].length), !!match[1]);
    // "we're in our third year": not a place, and not a reason to doubt the others.
    if (!found?.known) continue;
    if (found.list) return NONE;
    mentioned.push(found.place);
    stated.push(found.place);
  }
  const mine = heard(readable(own));
  for (const match of mine.matchAll(workLocatives(name))) {
    const found = spokenPlace(mine.slice(match.index + match[0].length), !!match[1]);
    // "we work in education": not a place, and not a reason to doubt the others.
    if (!found?.known) continue;
    if (found.list) return NONE;
    mentioned.push(found.place);
    stated.push(found.place);
  }
  for (const match of text.matchAll(BASED_AFTER)) {
    // The place is the capitals that end the words before "based", or the country that ends them.
    const said = match[1]!.split(/[ \t]+/u);
    let from = said.length;
    while (from > 0 && /^\p{Lu}/u.test(said[from - 1]!) && !NOT_PLACES.has(said[from - 1]!.toLocaleLowerCase())) from--;
    const lower = said.map((word) => word.toLocaleLowerCase());
    const country = countryIn(lower);
    const place = from < said.length ? said.slice(from) : country?.end === said.length ? said.slice(country.start) : [];
    // "a Faith-based group", "a Community based project": what it rests on, not where it is.
    if (!place.length || place.some((word) => NOT_BASED.has(word.toLocaleLowerCase()) || NOT_NAMED.has(word.toLocaleLowerCase()))) continue;
    mentioned.push(titledPlace(place));
    stated.push(titledPlace(place));
  }
  // A sentence that is only a place, after one that is only the name: "River Keepers. Nairobi, Kenya. We restore riverbanks."
  if (name.trim() && text.toLocaleLowerCase().startsWith(name.trim().toLocaleLowerCase())) {
    const second = text.slice(name.trim().length).match(/^[ \t]*[.\n][ \t\n]*([^.!?\n]{1,80})(?:[.!?\n]|$)/u)?.[1];
    const found = second ? spokenPlace(second) : null;
    // Every sentence opens with a capital, so one word with one is not known to be a place: "River Keepers. Welcome."
    const placed = !!found && (found.country || placeWords(found.place).length > 1);
    if (found && placed && !found.list && placeWords(found.place).length === placeWords(second!).length) {
      mentioned.push(found.place);
      stated.push(found.place);
    }
  }
  // Every place the words locate something in must be the same one: "Nairobi" and "Nairobi, Kenya" are.
  const best = stated.reduce((longest, next) => (placeWords(next).length > placeWords(longest).length ? next : longest), "");
  if (!best || !mentioned.every((place) => within(placeWords(place), placeWords(best)))) return NONE;
  return { locations: [best.slice(0, 120)], isGlobal: false };
}
