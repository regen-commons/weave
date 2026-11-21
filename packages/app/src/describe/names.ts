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
    /[,.;:!?()\n]|[ \t][-–][ \t]|[ \t](?:in|at|based|located|from|who|which|that|where|and[ \t]+(?:we|it|i|I|our|they|is|are)|we|is|are|em|en|que|com|con|para|é|es|son|são)(?![\p{L}\p{M}])/u,
  );
  return (stop < 0 ? raw : raw.slice(0, stop)).trim();
}

const words = (...lines: string[]) => new Set(lines.join(" ").split(" "));
/** A name never opens with these: they open a sentence about something else. */
const NOT_A_START = words(
  "we our us i my me this that these those it its there here they their he she his her you your",
  "i'm i’m we're we’re it's it’s that's that’s there's there’s they're they’re i've i’ve we've we’ve",
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
  const english = sentence.match(/^(?:we[ \t]are|we['’]re)[ \t](?:the[ \t])?/iu);
  // "We are Atlas weavers a women's cooperative": the name ends where the words say what kind of group it is.
  if (english) return plausible(cut(sentence.slice(english[0].length)).replace(/[ \t]an?[ \t]+\p{Ll}.*$/u, ""));
  const opening = sentence.match(/^(?:nós[ \t])?somos[ \t](?:(?:o|a|os|as|el|la|los|las)[ \t])?/iu);
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
const KINDS =
  /initiative|project|group|organi[sz]ation|collective|cooperative|co-op|coop|team|network|farm|school|centre|center|hub|community|association|programme|program|kitchen|nursery|library|circle|alliance|movement|foundation|trust|charity|non-?profit|enterprise|company|club|society|festival|lab|laboratory|studio|space|fund|campaign|coalition|union|council|garden|app|platform|business|startup|academy|institute|iniciativa|projeto|grupo|coletivo|cooperativa|associação|rede|horta|escola|biblioteca|comunidade|organização|movimento|fundação|instituto|centro|proyecto|colectivo|asociación|red|huerta|huerto|escuela|comunidad|organización|fundación/;
export const KIND = wholeWords(KINDS);

/** "X is a volunteer group", "X é uma cooperativa", "X es un colectivo", "X, a network of", and "X is based in". */
function isA(sentence: string): string | null {
  // Each shape is found where it first occurs, and the name is what comes before it.
  const based = sentence.search(/[ \t](?:is|are)[ \t](?:based|located|situated|headquartered)[ \t]in(?![\p{L}\p{M}])/u);
  if (based > 0) return aName(sentence.slice(0, based));
  const verb = sentence.match(/[ \t](?:is|are|é|são|es|son)[ \t](?:a|an|the|one[ \t]of[ \t]the|um|uma|un|una|o|el|la)[ \t]/u);
  const comma = sentence.match(/,[ \t](?:a|an|the|um|uma|un|una|o|el|la)[ \t]/u);
  const found = verb && verb.index! > 0 ? verb : comma && comma.index! > 0 ? comma : null;
  if (!found) return null;
  // What it is said to be must be a kind of initiative, within its first few words.
  const kind = sentence.slice(found.index! + found[0].length).split(/[ \t]/u).slice(0, 8).join(" ");
  if (!KIND.test(kind)) return null;
  return aName(sentence.slice(0, found.index!));
}

/** Words a clause holds and a name does not: "the organisation's name is Highland Seed Bank and it" is a clause. */
const NOT_IN_NAME = words("is are am was were it we i they he she who which that because but");
/** The words before "is a" or "is based in" as a name, or null when they are a clause. */
function aName(raw: string): string | null {
  return raw.split(/[ \t]+/u).some((word) => NOT_IN_NAME.has(word.toLocaleLowerCase())) ? null : plausible(raw);
}

/** Words that make a first line a sentence rather than a name. */
export const CLAUSE = words(
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

/** "Good morning." and "Thank you." open what is said and name nothing. */
const GREETING =
  /^(?:hello|hi|hey|greetings|good[ \t]+(?:morning|afternoon|evening|day)|thanks|thank[ \t]+you|olá|ola|oi|hola|buenos[ \t]+días|bom[ \t]+dia)(?![\p{L}\p{M}])/iu;

/**
 * A first line that is only a name, such as "Synthetic Garden" above the words about it, or a
 * first sentence of a few words such as "Orchard learning circle." A first clause that goes on
 * after a comma is the start of a sentence, not a name, so it never counts.
 */
function firstLine(text: string): string {
  const first = text.trimStart().match(/^([^,.!?\n]*)(?:[.!?]?(?:\n|$)|[.!?][ \t])/u)?.[1]?.trim() ?? "";
  if (!first || /[:/]/u.test(first) || GREETING.test(first)) return "";
  const parts = first.split(/[ \t]+/u);
  if (parts.length > 7 || parts.some((word) => CLAUSE.has(word.toLocaleLowerCase()))) return "";
  return plausible(first) ?? "";
}

/** No spoken name is read from further in than this, or is longer than this many words. */
const SPOKEN_HEAD = 600;
const SPOKEN_WORDS = 6;
/** A person is still opening, and so introducing the initiative, for this many words. */
const SPOKEN_OPENING = 8;
const LETTER = String.raw`[\p{L}\p{M}'’-]`;
/** Sounds of thinking aloud that some recognizers write down, and a small word said twice over. */
const THINKING = new RegExp(String.raw`(?:,[ \t]*)?(?<!${LETTER})(?:u+m+|u+h+|e+r+m*|a+h+|h+m+)(?!${LETTER})[,.]?[ \t]*`, "giu");
const ASIDE = new RegExp(String.raw`(?<!${LETTER})(?:you[ \t]+know|i[ \t]+mean)(?!${LETTER}),?[ \t]*`, "giu");
const TWICE = new RegExp(
  String.raw`(?<!${LETTER})(we['’]re|we[ \t]are|we|i['’]m|i|the|an?|and|in|is|are|our|it['’]s)[ \t]\1(?!${LETTER})`,
  "giu",
);
/** Words as they were meant, without the sounds of saying them: "um we're we're based in" reads "we're based in". */
export function heard(text: string): string {
  return text
    .replace(THINKING, " ")
    .replace(ASIDE, " ")
    // "based in, like, Nairobi": between commas, "like" is a pause.
    .replace(/,[ \t]*like,[ \t]*/giu, " ")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(TWICE, "$1")
    .trim();
}
/** Greetings and openers that begin a sentence said aloud. */
const FILLER =
  /^(?:(?:hello|hi|hey|okay|ok|so|well|yes|yeah|yep|right|alright|basically|good[ \t]+(?:morning|afternoon|evening)|olá|ola|oi|hola)(?:[ \t]+(?:there|everyone|everybody|all))?[,.!]?[ \t]+)+/iu;
/** Where a spoken name ends: the word that starts what is said about it. */
const SPOKEN_STOP = words(
  "based located situated headquartered in at from we we're we’re which who that where is are it it's it’s",
  "our i i'm i’m because so but to with here location description",
);
/** After "and", these go on with the sentence; any other word may be part of a name: "Seeds and Soil". */
const AND_GOES_ON = words("we we're we’re i i'm i’m our it it's it’s they then also is are");
/**
 * What follows "we are" when it is not a name. A first word that says how things stand, how many
 * or how much: "we are still", "we are five friends", "we are really". A word anywhere that says
 * how the group feels: "we are very happy and we". A last word that says who its people are or
 * how it is run: "we are community organizers", "we are women led", "we are open source". A name
 * may open with "New", "Young" or "Small", so those words alone do not rule one out.
 */
const NOT_SPOKEN_START = words(
  "also still just not very all here now currently already always never only about made like",
  "one two three four five six seven eight nine ten dozen hundred several many few some both",
  "really quite truly deeply super extremely pretty too so more most mostly mainly newly",
);
/** Words that end in "ly" and open a name: "Family Farms Network", "Early Years Lab". */
const NOT_ADVERBS = words("family holy lily italy early july ally rally valley only friendly lively lovely");
const FEELS = words(
  "happy excited grateful proud glad pleased delighted thrilled honoured honored keen eager ready able sure sorry afraid",
  "passionate committed dedicated focused interested involved engaged",
);
const NOT_SPOKEN_END = words(
  "organizers organisers activists researchers engineers developers designers educators scientists workers leaders",
  "entrepreneurs professionals practitioners experts citizens locals refugees immigrants survivors elders kids girls boys",
  "men guys folks ones vendors traders graduates producers journalists fans",
  "led based run owned driven powered funded founded located rooted registered established known source",
);
/** Words that say what kind of thing it is and never which: "the project", "our team", "a small business". */
const GENERIC = words(
  "team group project organization organisation community initiative company nonprofit non-profit charity collective",
  "network cooperative club program programme association foundation ngo startup business enterprise movement",
  "social small local new",
);
/** Words a title keeps small, except as its first word. */
const SMALL = words("of the and for in on at to de da do das dos del la le el di du y e");
const NOUNS = `(?:${KINDS.source})`;
/**
 * The words that say a name follows: "called X", "named X", "we call ourselves X", "the name is X",
 * "our organization's name is X", "the name of our project is X". "My name is" names a person.
 */
const NAMING = new RegExp(
  String.raw`(?<!${LETTER})(?:(called|named)(?:[ \t]+(?:it|this|ourselves|us))?|(?:we|i)[ \t]+call[ \t]+(?:ourselves|it|this|us)|(?:(?:the|our|its)(?:[ \t]+${NOUNS}(?:['’]?s)?)?|my[ \t]+${NOUNS}(?:['’]?s)?)[ \t]+name[ \t]+is|name[ \t]+of[ \t]+(?:the|our|my|this)[ \t]+${NOUNS}[ \t]+is)[ \t]+(?:like[ \t]+)?(?:the[ \t]+)?`,
  "giu",
);
/** "I'm the founder of X": what follows is the initiative. */
const FOUNDED = new RegExp(String.raw`(?<!${LETTER})(?:co-?)?founder[ \t]+of[ \t]+(?:the[ \t]+)?`, "iu");
/** "I'm with X", "I represent X", "on behalf of X": what follows may be the initiative, or the people it serves. */
const SPEAKS_FOR = new RegExp(
  String.raw`(?<!${LETTER})(?:(?:i[ \t]+am|i['’]m)[ \t]+(?:here[ \t]+)?with|i[ \t]+represent|on[ \t]+behalf[ \t]+of)[ \t]+(?:the[ \t]+)?`,
  "iu",
);
const WE_ARE = new RegExp(String.raw`(?<!${LETTER})(?:we[ \t]+are|we['’]re)[ \t]+(?:like[ \t]+)?(?:the[ \t]+)?`, "iu");
const THIS_IS = new RegExp(String.raw`(?<!${LETTER})this[ \t]+is[ \t]+(?:the[ \t]+)?`, "iu");
const OUR_IS = new RegExp(String.raw`(?<!${LETTER})(?:my|our)[ \t]+${NOUNS}[ \t]+is[ \t]+(?:the[ \t]+)?`, "iu");
/**
 * "I started Wild Coast Rangers", "we run Akoma Youth Hub": a name after these words is read only
 * by its capitals, since "we run workshops" and "I started a garden" are said the same way.
 */
const CAPITAL = String.raw`\p{Lu}[\p{L}\p{M}\p{N}'’&-]*`;
const STARTED = new RegExp(
  String.raw`(?<!${LETTER})(?:[Ww]e|I)[ \t]+(?:(?:co-?)?founded|started|run|lead|launched|created|set[ \t]+up|direct|manage|coordinate)[ \t]+(?:the[ \t]+)?(${CAPITAL}(?:[ \t]+(?:(?:of|the|and|for|de|da|do|del|la)[ \t]+)?${CAPITAL}){0,5})`,
  "u",
);
/** A capital that says when, not what: "we started January". */
const WHEN = words(
  "january february march april may june july august september october november december",
  "monday tuesday wednesday thursday friday saturday sunday",
);
/** What may follow the name in "we are X …": where it is, that the sentence goes on about "we", a place, or its end. */
const THEN_WHERE = /^[,.;]?[ \t]*(?:and[ \t]+(?:we[ \t]+are|we['’]re)[ \t]+)?(?:based|located|situated|headquartered)[ \t]+in(?![\p{L}\p{M}])/iu;
const THEN_GOES_ON = /^[,.;]?[ \t]*(?:and[ \t]+)?(?:we|our|i)(?![\p{L}\p{M}-])/iu;
const THEN_PLACE = /^,?[ \t]*(?:from|in|out[ \t]+of)[ \t]+\S/iu;
const THEN_ENDS = /^[ \t]*(?:[.!?]|$)/u;
const SPOKEN_IS_A = /[ \t](?:is|are)[ \t]+(?:a|an)[ \t]+/iu;
/** "Our initiative, the Green Corridor Project": what kind of thing it is, said before its name. */
const OPENS_WITH_KIND = new RegExp(String.raw`^(?:(?:our|my|the)[ \t]+${NOUNS}[ \t]*,?[ \t]+)?(?:the[ \t]+)?`, "iu");
const DOES = new RegExp(
  String.raw`^(?:the[ \t]+)?(${CAPITAL}(?:[ \t]+(?:(?:of|the|and|for|de|da|do|del|la)[ \t]+)?${CAPITAL}){1,5})[ \t]+(?:runs|works|helps|makes|grows|collects|shares|teaches|supports|brings|builds|provides|creates|plants|restores|trains|connects|protects)(?![\p{L}\p{M}])`,
  "u",
);
/** "Our group, Prairie Seed Savers, works in": a name set off by commas after what kind of thing it is. */
const SET_OFF = new RegExp(String.raw`(?:^|[.!?][ \t]+)(?:our|my|the)[ \t]+${NOUNS}[ \t]*,[ \t]*([^,.;:!?\n]{2,80}),`, "iu");
/**
 * The page asks for three things, and some people say them as labels: "name river keepers
 * location nairobi kenya description we restore the riverbank".
 */
const LABELS =
  /^(?:the[ \t]+)?name[ \t]*(?:is[ \t]+)?[:,]?[ \t]*([^.,;:!?\n]{1,80}?)[ \t]*[.,;]?[ \t]+(?:location|place|where[ \t]+(?:we|i)[ \t]+work)[ \t]*(?:is[ \t]+)?[:,]?[ \t]*/iu;
const THIRD_LABEL = /^([^.;:!?\n]{1,80}?)[ \t]*[.,;]?[ \t]+(?:description|about[ \t]+it|about|what[ \t]+we[ \t]+do)(?![\p{L}\p{M}])/iu;
/** A word a name can hold: letters and digits, with an apostrophe, an ampersand or a hyphen. */
const NAME_WORD = /^[\p{L}\p{M}\p{N}'’&-]+$/u;
const lowered = (parts: readonly string[]) => parts.map((word) => word.toLocaleLowerCase());

/** The words said aloud that a name is looked for in: the start, without sounds of thinking or a greeting. */
function spokenHead(text: string): string {
  return heard(readable(text).slice(0, SPOKEN_HEAD).replace(/[ \t]*\n+[ \t]*/gu, " ")).replace(FILLER, "");
}

/**
 * The name and the place said as labels, as they were said, or null when the words do not open
 * with them. `where` is the words up to a third label, which are the place whatever they are.
 * Without a third label it is empty, and `after` is where a place may be read from.
 */
export function spokenLabels(text: string): { name: string; where: string; after: string } | null {
  const head = spokenHead(text);
  const found = head.match(LABELS);
  if (!found) return null;
  const after = head.slice(found[0].length);
  return { name: found[1]!.trim(), where: after.match(THIRD_LABEL)?.[1]?.trim() ?? "", after };
}

/**
 * The words up to the first that ends a spoken name, and the rest. Null when no name ends in time.
 * `said` is true after words that say a name follows: there "a" and "and" may be part of it.
 */
function spokenCut(raw: string, said: boolean): { words: string[]; rest: string } | null {
  const kept: string[] = [];
  const tokens = [...raw.matchAll(/[^ \t,.;:!?\n]+|[,.;:!?\n]/gu)];
  let at = 0;
  for (const [index, match] of tokens.entries()) {
    const word = match[0];
    const lower = word.toLocaleLowerCase();
    const next = tokens[index + 1]?.[0].toLocaleLowerCase();
    const ends =
      /^[,.;:!?\n]$/u.test(word) ||
      SPOKEN_STOP.has(lower) ||
      (!said && (lower === "a" || lower === "an")) ||
      // "Seeds and Soil" is one name; "River Keepers and we" is a name and what comes next.
      (lower === "and" &&
        (!said || !kept.length || !next || /^[,.;:!?\n]$/u.test(next) || SPOKEN_STOP.has(next) || AND_GOES_ON.has(next)));
    if (ends) return { words: kept, rest: raw.slice(match.index) };
    if (kept.length === SPOKEN_WORDS) return null;
    kept.push(word);
    at = match.index + word.length;
  }
  return { words: kept, rest: raw.slice(at) };
}

/** A spoken name as it would be written: a capital on each word that has none, small words apart. */
function titled(parts: readonly string[]): string {
  return parts
    .map((word, index) =>
      /\p{Lu}/u.test(word) || (index > 0 && SMALL.has(word)) ? word : word.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase()),
    )
    .join(" ");
}

/**
 * The words as a name, or null when they are not one. `said` is true after words that say a name
 * follows, such as "called". Without them the words must not read as a description: who the
 * people are, what the group is doing, or what it is like.
 */
function spokenPlausible(parts: readonly string[], said: boolean): string | null {
  if (!parts.length || parts.some((word) => !NAME_WORD.test(word) || /\d{3,}/u.test(word))) return null;
  const lower = lowered(parts);
  if (NOT_A_START.has(lower[0]!) || SMALL.has(lower[0]!) || SMALL.has(lower.at(-1)!)) return null;
  // "the project", "small farmers": a kind of thing, or people, and no name among the words.
  if (lower.every((word) => GENERIC.has(word) || PEOPLE.has(word))) return null;
  if (said) return titled(parts);
  if (NOT_SPOKEN_START.has(lower[0]!) || NOT_SPOKEN_END.has(lower.at(-1)!)) return null;
  if (lower.some((word) => CLAUSE.has(word) || PEOPLE.has(word) || FEELS.has(word))) return null;
  // "working with farmers", "fully remote": what the group is doing, or how.
  if (/ing$/u.test(lower[0]!) || (/ly$/u.test(lower[0]!) && !NOT_ADVERBS.has(lower[0]!))) return null;
  return titled(parts);
}

const SOMEONE_ELSES = words("with for alongside near by support supports supporting help helps helping visit visited joined partner partners");
const LINKING = words("is are was were be been also now just simply currently officially originally");
const SELF = words("we we're we’re it it's it’s its that's that’s this they they're they’re");
/**
 * True when "called" is said of the initiative: "we are called", "it's called", "a project called".
 * "I am called", "a village called" and "a method called" name a person, a place and a thing, and
 * "we work with a school called" names someone else's.
 */
function saysInitiative(before: string): boolean {
  const said = lowered(before.split(/[.;:!?\n]/u).at(-1)!.split(/[ \t,]+/u).filter(Boolean).slice(-6));
  while (said.length && LINKING.has(said.at(-1)!)) said.pop();
  const subject = said.pop();
  if (!subject || SELF.has(subject)) return true;
  if (!KIND.test(subject)) return false;
  let other = said.length - 1;
  while (other >= 0 && !SOMEONE_ELSES.has(said[other]!)) other--;
  return other < 0 || said.slice(other + 1).some((word) => word === "my" || word === "our");
}

/**
 * The name as speech gives it. Many browsers return what was said without capitals or full stops:
 * "we are orchard learning circle based in nairobi we help families". `statedName` reads a name
 * by its capital and its sentence, so it finds none there. This reads the ways people say a name
 * aloud, in any case: words that say a name follows ("called X", "the name is X", "I'm the founder
 * of X"), "we are X" where the sentence then goes on to where or what ("based in", "and we", "a
 * community of"), and "X is a seed library". It is for words `statedName` found no name in, and
 * it gives the name the capitals a written name has. Nothing is made up: a person's own name,
 * someone else's project and a description ("we are five friends") leave the name empty.
 */
export function spokenName(text: string): string {
  const head = spokenHead(text);
  const labelled = spokenLabels(head)?.name.split(/[ \t]+/u);
  if (labelled && labelled.length <= SPOKEN_WORDS) {
    const name = spokenPlausible(labelled, true);
    if (name) return name;
  }
  for (const naming of head.matchAll(NAMING)) {
    if (naming[1] && !saysInitiative(head.slice(0, naming.index))) continue;
    const cut = spokenCut(head.slice(naming.index + naming[0].length), true);
    const name = cut && spokenPlausible(cut.words, true);
    if (name) return name;
  }
  const founded = head.match(FOUNDED);
  if (founded) {
    const cut = spokenCut(head.slice(founded.index! + founded[0].length), false);
    const name = cut && spokenPlausible(cut.words, true);
    if (name) return name;
  }
  const speaksFor = head.match(SPEAKS_FOR);
  if (speaksFor) {
    const cut = spokenCut(head.slice(speaksFor.index! + speaksFor[0].length), false);
    const name = cut && spokenPlausible(cut.words, false);
    if (name) return name;
  }
  const started = head.match(STARTED)?.[1]?.split(/[ \t]+/u);
  if (started && !WHEN.has(started[0]!.toLocaleLowerCase())) {
    const name = spokenPlausible(started, true);
    if (name) return name;
  }
  for (const [opening, introduces] of [[head.match(THIS_IS), true], [head.match(WE_ARE), true], [head.match(OUR_IS), false]] as const) {
    if (!opening) continue;
    const cut = spokenCut(head.slice(opening.index! + opening[0].length), false);
    if (!cut) continue;
    // "based in" or "a community of" right after says the words before it are a name. That the
    // sentence only goes on, or ends, says less: it counts for two words or more, either given
    // their capitals or said as the person opens ("we are river keepers and we"). Later on, and
    // after "our project is", the same shape describes as often as it names.
    const kind = /^,?[ \t]*an?[ \t]+/iu.test(cut.rest) && KIND.test(cut.rest.split(/[ \t]+/u).slice(0, 8).join(" "));
    const goesOn = THEN_GOES_ON.test(cut.rest) || THEN_PLACE.test(cut.rest) || THEN_ENDS.test(cut.rest);
    const capitals = cut.words.length > 1 && cut.words.every((word, index) => /^\p{Lu}/u.test(word) || (index > 0 && SMALL.has(word)));
    const opens = introduces && head.slice(0, opening.index!).split(/[ \t]+/u).filter(Boolean).length <= SPOKEN_OPENING;
    const name =
      THEN_WHERE.test(cut.rest) || kind || (goesOn && cut.words.length > 1 && (capitals || opens))
        ? spokenPlausible(cut.words, capitals)
        : null;
    if (name) return name;
  }
  // "river keepers is based in nairobi", "our initiative the green corridor project is located in": the
  // name opens the words, and where it is follows.
  const based = head.search(/,?[ \t](?:(?:is|are)[ \t]+)?(?:based|located|situated|headquartered)[ \t]+in(?![\p{L}\p{M}])/iu);
  if (based > 0) {
    const stated = /^,?[ \t](?:is|are)/iu.test(head.slice(based));
    const parts = head.slice(0, based).replace(OPENS_WITH_KIND, "").split(/[ \t]+/u).filter(Boolean);
    // Without "is", two words that end in a kind of group describe one: "tech startup based in".
    const names = stated || (parts.length > 1 && (parts.length > 2 || !GENERIC.has(parts.at(-1)!.toLocaleLowerCase())));
    const name = names && parts.length <= SPOKEN_WORDS ? spokenPlausible(parts, false) : null;
    if (name) return name;
  }
  // "Sacred Groves Initiative works with temple forests": a name given its capitals, then what it does.
  const does = head.match(DOES)?.[1]?.split(/[ \t]+/u);
  if (does) {
    const name = spokenPlausible(does, true);
    if (name) return name;
  }
  // "river keepers is a community group": the name opens the words, and what it is follows.
  const isA = head.match(SPOKEN_IS_A);
  if (isA && isA.index! > 0) {
    const kind = head.slice(isA.index! + isA[0].length).split(/[ \t]/u).slice(0, 8).join(" ");
    const parts = head.slice(0, isA.index!).split(/[ \t]+/u);
    const name = KIND.test(kind) && parts.length <= SPOKEN_WORDS ? spokenPlausible(parts, false) : null;
    if (name) return name;
  }
  const setOff = head.match(SET_OFF)?.[1]?.trim().replace(/^the[ \t]+/iu, "").split(/[ \t]+/u);
  return (setOff && setOff.length <= SPOKEN_WORDS && spokenPlausible(setOff, true)) || "";
}

/** A first line that names a kind of document, not an initiative: "Project Proposal", "Annual Report". */
const DOCUMENT_TITLE =
  /^(?:(?:project|grant|funding|annual|final|progress|impact|concept|pitch|executive|cover|business|strategic)[ \t]+)*(?:proposal|report|application|overview|summary|introduction|note|deck|letter|plan|budget|agenda|minutes|draft|contents|abstract|untitled|document)s?$/iu;

/**
 * The name a file's words state. A file opens with its own title as often as with the
 * initiative's, so a first line that only names a kind of document is not taken.
 */
export function fileName(text: string): string {
  const name = statedName(text);
  return DOCUMENT_TITLE.test(name) ? "" : name;
}
