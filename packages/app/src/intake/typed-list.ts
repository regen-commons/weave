/**
 * A needs or offers box read into one piece per need or offer (24 November 2026). People type a
 * list the way they write one ("Fruit tree seedlings, a water pump and help with grafting"), or
 * paste the whole description of their initiative, with a sentence of what it needs and one of
 * what it could offer. A list is split at its commas and at an "and" before a new thing; a box that
 * says what this step asks for in its own sentences is read from those sentences, and the sentences
 * that only describe the initiative make no card. A card that is half a thing is worse than one
 * card that holds two, so where the words could be one item ("volunteers in Awka, Enugu and
 * Lagos", "salt and pepper", "a big, dry shed") they stay one. Every rule only splits or leaves
 * words out, never rewords, and each card is a suggestion the person checks.
 */
import type { AskKind } from "./contracts.ts";

/** Lines, semicolons and sentence ends, as the step always split a box. */
const SENTENCES = /(?:\r?\n)+|;\s*|(?<=[.!?])\s+(?=[A-ZÀ-Þ])/iu;
/** The comma before a new thing that always started a new card: "land, a tractor", "seedlings, and someone". */
const NEW_THING_WORDS = String.raw`(?:someone|somebody|an?\b|help\b|land\b|tools?\b|funding\b|money\b|equipment\b|fencing\b|volunteers?\b|uma?\b|alguém\b)`;
const NEW_THING_COMMA = new RegExp(String.raw`,\s+(?=(?:and\s+)?${NEW_THING_WORDS})`, "iu");
/** A word that always started a new card, which never describes the thing before it. */
const NEW_THING_WORD = new RegExp(String.raw`^${NEW_THING_WORDS}`, "iu");

const NOT_LETTER = String.raw`(?![\p{L}\p{M}])`;
/** "And", "Also" and their like before what a sentence says. */
const OPEN = String.raw`^(?:(?:and|also|but|so|plus|y|e|pero|mas|también|também)[\s,]+)*`;
const ADVERB = String.raw`(?:\s+(?:also|really|still|urgently|desperately|badly|definitely))?`;
/** A sentence that says what the initiative needs: "We need", "We're also looking for", "Precisamos de", "Necesitamos". */
const NEED_LEAD = new RegExp(
  OPEN +
    String.raw`(?:(?:we|i)${ADVERB}\s+(?:need|needs|require|lack|want|could\s+use|would\s+(?:like|love))` +
    String.raw`|(?:we|i)(?:['’]re|['’]m|\s+are|\s+am)${ADVERB}\s+(?:looking\s+for|in\s+need\s+of|missing|seeking)|(?:we|i)['’]d${ADVERB}\s+(?:like|love)` +
    String.raw`|what\s+we\s+(?:most\s+)?need\s+(?:most\s+)?is|our\s+(?:biggest\s+|main\s+|greatest\s+|first\s+|top\s+)?needs?\s+(?:is|are)` +
    String.raw`|(?:nós\s+)?(?:também\s+)?precisamos(?:\s+de)?|(?:nosotros\s+)?(?:también\s+)?(?:necesitamos|requerimos)|nos\s+(?:hace\s+|hacen\s+)?falta(?:n)?)` +
    NOT_LETTER +
    // "We would love to share our seed bank" gives; it asks for nothing.
    String.raw`(?!\s+to\s+(?:offer|share|lend|host|teach|give|provide|run|bring|contribute)${NOT_LETTER})`,
  "iu",
);
/** A sentence that says what the initiative could offer: "We can offer", "We can lend", "We're happy to share", "Oferecemos". */
const OFFER_LEAD = new RegExp(
  OPEN +
    String.raw`(?:(?:we|i)(?:\s+(?:also|can|could|would|will))+\s+(?:offer|share|provide|give|contribute|lend|teach|host|bring|run)` +
    String.raw`|(?:we|i)(?:\s+also)?\s+(?:offer|share|provide|contribute)` +
    String.raw`|(?:we|i)(?:['’]re|['’]m|['’]d\s+be|\s+are|\s+am|\s+would\s+be)(?:\s+also)?\s+(?:happy|glad|able|willing)\s+to\s+(?:offer|share|lend|host|teach|give|provide|run|bring)` +
    String.raw`|(?:we|i)(?:\s+would|['’]d|\s+also)*\s+(?:love|like|want|be\s+glad|be\s+happy)\s+to\s+(?:offer|share|lend|host|teach|give|provide|run|bring|contribute)` +
    String.raw`|what\s+we\s+(?:can\s+)?offer\s+is` +
    String.raw`|(?:nós\s+)?(?:também\s+)?(?:oferecemos|podemos\s+(?:oferecer|compartilhar|emprestar))|(?:nosotros\s+)?(?:también\s+)?(?:ofrecemos|podemos\s+(?:ofrecer|prestar|compartir)))` +
    NOT_LETTER,
  "iu",
);
const LEADS: Record<AskKind, RegExp> = { needs: NEED_LEAD, offers: OFFER_LEAD };
/** Words of this step anywhere in a sentence: "We provide meals and need a bigger stove" also asks. */
const SAYS: Record<AskKind, RegExp> = {
  needs: /(?<![\p{L}\p{M}])(?:need|needs|looking\s+for|lack|missing|short\s+on|precisamos|necesitamos)(?![\p{L}\p{M}])/iu,
  offers: /(?<![\p{L}\p{M}])(?:offer|share|lend|host|teach|give|provide|oferecemos|ofrecemos|podemos)(?![\p{L}\p{M}])/iu,
};
const OTHER: Record<AskKind, AskKind> = { needs: "offers", offers: "needs" };

/** Words that say a sentence still asks or gives something, so it is never left out: "Our kitchen is also available". */
const ASKS_SOMETHING =
  /(?<![\p{L}\p{M}])(?:need|needs|needed|looking\s+for|in\s+need\s+of|missing|lack|lacks|no|without|hoping|hope|wish|would\s+help|would\s+love|would\s+be\s+(?:great|nice|good|helpful|welcome|amazing)|short\s+on|welcome|wanted|want|available|(?:is|are)\s+(?:free|open|empty)|happy\s+to|glad\s+to|able\s+to|willing\s+to|can|could|lend|share|teach|give|giving|donate|offer|offers|priority|challenge|problem|precisa\w*|necesita\w*|falta\w*|podemos|ofrece\w*|oferece\w*|sin|sem)(?![\p{L}\p{M}])/iu;
/** A sentence that describes the initiative: "We work globally", "Our first hub is", "Based in Nairobi", "Somos". */
const DESCRIBES = new RegExp(
  String.raw`^(?:(?:we|i)\s+(?:are|am|work|worked|build|built|started|founded|grow|serve|have\s+been|were|was)|(?:we|i)['’](?:re|m|ve\s+been)` +
    String.raw`|our\s+(?:[\p{L}\p{M}-]+\s+){0,2}(?:is|are|was|were|has|have|started|began)|(?:it|this)\s+(?:is|was|helps|has)` +
    String.raw`|(?:members|people|volunteers|families|students|neighbou?rs)\s+(?:(?:also|often|usually|then|still|now|all|each|always|regularly)\s+)?(?:log|return|come|meet|are|have|sort|bring|use|get|learn|work|gather|visit|confirm|join|grow|cook)` +
    String.raw`|based\s+in|founded\s+in|since|somos|trabajamos|trabalhamos|desde|fundad[oa]s?)` +
    NOT_LETTER,
  "iu",
);
/**
 * A long sentence that names the initiative and says what it does: "Green Goods is", "Tech and Sun
 * builds", "Riverbend Seed Library lends". The name has two words with capitals or more, and the
 * verb is one that describes, so "Microsoft Office licenses" or "Maria Silva teaches grafting" is not one.
 */
const NAMED = new RegExp(
  String.raw`^\p{Lu}[\p{L}\p{M}-]*(?:\s+(?:(?:and|of|de|da|do|del|y|e)\s+)?\p{Lu}[\p{L}\p{M}-]*){1,4}\s+(?:is|are|was|were|has|builds|helps|lends|runs|works|grows|serves|makes|connects|supports|brings|trains|started|began|restores|protects|plants|organi[sz]es|collects|produces)` +
    NOT_LETTER,
  "u",
);
const NAMED_WORDS = 10;
/** A sentence that only points somewhere: "Find us at …", "You can visit us on …", a bare link. */
const POINTS =
  /^(?:(?:you\s+can\s+)?(?:find|visit|follow|see|reach|contact)\s+us|check\s+(?:us\s+)?out|more\s+(?:at|on)|(?:our\s+)?(?:website|site|web|email|e-mail)(?![\p{L}\p{M}])|https?:\/\/|www\.|[\p{L}\p{M}\d-]+\.(?:org|com|net|app|io|co|info|earth|eco)\S*$)/iu;
/** A sentence a person opens as themselves, not as an item: "We are", "Our garden", "It helps". */
const SUBJECT = /^(?:we|i|our|my|it|its|they|their|this|these|those|there|he|she|you)(?![\p{L}\p{M}'’])/iu;
/** A clause inside a list, which opens with who does something: "we are a garden". "Our seeds" is an item. */
const CLAUSE = /^(?:we|i|it|they|there|he|she|you)(?:['’](?:re|m|s|ve|ll|d))?(?![\p{L}\p{M}'’])/iu;

/** What goes on with the item before it: "which", "such as", "ideally", "on weekends", "between June". */
const GOES_ON =
  /^(?:which|who|whom|whose|that|because|since|so|as|while|where|when|if|unless|until|till|like|such\s+as|including|especially|ideally|preferably|e\.g\.|for\s+example|for\s+instance|either|in|on|at|for|from|to|by|with|every|each|during|before|after|near|between|around|across|about|over|under|throughout|que|quien|quienes|porque|como|donde|cuando|incluindo|incluyendo|especialmente|preferiblemente|de\s+preferência|de\s+preferencia|whichever|whatever|para|por|con|sin|en|com|sem|em)(?![\p{L}\p{M}])/iu;
/** Examples of the item before: "equipment, such as a drill, saw and sander". */
const EXAMPLES = /^(?:such\s+as|including|like|e\.g\.|for\s+example|for\s+instance|incluindo|incluyendo|como)(?![\p{L}\p{M}])/iu;
/** "And more", "etc." at the end of the last item. */
const TRAILING_FILLER = /(?<![\s,])(?:,?\s+(?:and|or|e|y)\s+(?:more|so\s+on|the\s+like|other\s+things|others|mais|más)|,?\s+etc\.?)[.!?]*$/iu;
/** A wish about the item before it: "electric if possible". */
const WISH = /(?<![\p{L}\p{M}])(?:if\s+possible|if\s+we\s+can|ideally|preferably|si\s+es\s+posible|se\s+possível)(?![\p{L}\p{M}])/iu;
/** The word that joins the last item of a list after its comma: ", and evaluators". */
const LAST = /^(?:and|or|plus|as\s+well\s+as|e|y|ou|o)\s+/iu;
/** A last item that only says "and so on". */
const FILLER =
  /^(?:(?:and|or|e|y)\s+)?(?:etc\.?|et\s+cetera|more|so\s+on|the\s+like|other\s+things|others|anything\s+else|whatever\s+else|whatever|más|mais|otros|outros|outras|otras|cosas\s+así|coisas\s+assim)\.?$/iu;
/** A determiner: an item that opens with one is a thing of its own. */
const DETERMINER = /^(?:a|an|the|our|their|some|any|another|um|uma|o|os|as|un|una|unos|unas|el|la|los|las)(?![\p{L}\p{M}])/iu;
/** Words that start a new thing after "and": "and a pump", "and someone", "and help with". Not "and a half". */
const NEW_THING = String.raw`(?:(?:a|an)\s+(?!(?:half|bit|few|little|lot|couple)${NOT_LETTER})|(?:some|someone|somebody|any|another|help|access\s+to)${NOT_LETTER})`;
const NEW_THING_PT = String.raw`(?:um|uma|alguém)${NOT_LETTER}`;
const NEW_THING_ES = String.raw`(?:un|una|unos|unas|alguien)${NOT_LETTER}`;
const NEW_THING_START = new RegExp(`^(?:${NEW_THING}|${NEW_THING_PT}|${NEW_THING_ES})`, "iu");
/** What an offer does, which starts an offer's next item: "and share our seeds". */
const OFFER_VERB = String.raw`(?:lend|host|share|teach|run|offer|provide|give|bring)${NOT_LETTER}`;
const AND_NEW: Record<AskKind, RegExp> = {
  needs: andNew(NEW_THING),
  offers: andNew(`(?:${NEW_THING}|${OFFER_VERB})`),
};
function andNew(next: string): RegExp {
  return new RegExp(
    String.raw`(?<!\s)\s+(?:and\s+(?:also\s+)?(?=${next})|e\s+(?:também\s+)?(?=${NEW_THING_PT})|y\s+(?:también\s+)?(?=${NEW_THING_ES})|(?:and\s+also|e\s+também|y\s+también)\s+(?!(?:more|mais|más)${NOT_LETTER}))`,
    "iu",
  );
}
/** A preposition, an infinitive or a relative clause, after which a short list belongs to the item. */
const ITEM_TAIL = /(?<![\p{L}\p{M}])(?:for|in|into|on|onto|at|with|from|between|like|including|of|about|to|towards?|via|per|by|who|that|where|para|en|em|de|como|con|com|sobre)\s/iu;
/** "And", "e" or "y" between two words, matched from where the space before it starts. */
const AND = /(?<!\s)\s+(?:and|e|y)\s+/iu;
/** "And" or "or" between two words. */
const AND_OR = /(?<!\s)\s+(?:and|or|e|y|o|ou)\s+/iu;
/** A greeting before what a sentence says: "Hello, we need a pump". */
const GREETING = /^(?:hi|hello|hey|olá|oi|hola|bom\s+dia|buenos\s+días)(?:\s+(?:there|all|everyone|team|todos))?[,!.]?\s+/iu;
/** A courtesy, or words that are no item: "Hi", "Please", "Not sure". */
const COURTESY =
  /^(?:hi|hello|hey|dear|please|thanks|thank\s+you|cheers|not\s+sure|get\s+in\s+touch|contact\s+us|let\s+us\s+know|ok|okay|yes|olá|oi|hola|gracias|obrigad[oa]|por\s+favor)(?![\p{L}\p{M}])/iu;
/** Words that start a description of the thing before: "50 metres deep", "size large", "free on Mondays", "solar powered". */
const DESCRIPTOR =
  /^(?:\d|size|free|open|available|seats|holds|fits|sleeps|at\s+least|up\s+to|min|max|used|second-?hand|refurbished|new|old|big|small|large|medium|cheap|solar|electric|diesel|petrol|manual|portable|working|[\p{L}-]+-powered|powered)(?![\p{L}\p{M}])/iu;

const words = (text: string) => text.split(/\s+/u).filter(Boolean).length;
/** The text without these characters at its end, walking back so a long run of them costs only its length. */
function trimEnd(text: string, characters: string): string {
  let end = text.length;
  while (end > 0 && characters.includes(text[end - 1]!)) end--;
  return text.slice(0, end);
}
const withoutEndMarks = (text: string) => trimEnd(text, ".!?");
/** A bare list is short: a long sentence with commas is prose, split only as before. */
const LIST_WORDS = 20;

/** Where "and" joins two things in one item: each "and" before a new thing. */
function andSplit(text: string, kind: AskKind): string[] | null {
  const items: string[] = [];
  let rest = text;
  for (let found = AND_NEW[kind].exec(rest); found; found = AND_NEW[kind].exec(rest)) {
    const before = rest.slice(0, found.index);
    // "A shed with a roof and a door", "someone who has a car and a licence": one thing, said with its parts.
    // "Funding for fencing and a gate", "help to write a grant and a budget": the "and" belongs to what the item is for.
    if (/(?<![\p{L}\p{M}])(?:with|who|that|which|of|for|to|con|com|que|para|de|do|da)(?![\p{L}\p{M}])/iu.test(before)) break;
    items.push(before);
    rest = rest.slice(found.index + found[0].length);
  }
  return items.length ? [...items, rest] : null;
}

/**
 * The items of one list, or null when the words are not one: "seedlings, a pump and help" is three
 * items; "a van, ideally electric" and "volunteers in Awka, Enugu and Lagos" are one.
 */
function listItems(body: string, kind: AskKind): string[] | null {
  // "If anyone can help, …": a sentence that opens with what goes on from somewhere else is no list.
  if (GOES_ON.test(body)) return null;
  const segments: string[] = [];
  for (const segment of body.replace(TRAILING_FILLER, "").split(/,\s+/u)) {
    const core = segment.replace(LAST, "");
    // "Equipment, such as a drill, saw and sander": examples of one thing are not a list. "Hi, we are a
    // garden", "please get in touch", "and we also need tools": a clause, not an item.
    if (segments.length && (EXAMPLES.test(segment) || COURTESY.test(core) || CLAUSE.test(core) || LEADS.needs.test(core) || LEADS.offers.test(core))) return null;
    if (!segments.length && COURTESY.test(segment)) return null;
    // "Which costs $200", "on weekends", "electric if possible": the item before goes on.
    if (segments.length && (GOES_ON.test(segment) || WISH.test(segment))) segments[segments.length - 1] += `, ${segment}`;
    else segments.push(segment);
  }
  // "And so on", "etc.": the list goes on, but with nothing to make a card of.
  if (segments.length > 1 && FILLER.test(segments.at(-1)!)) segments.pop();
  if (segments.length < 2) return null;
  const first = segments[0]!;
  // A word or two with no determiner, or a name such as "the EU".
  const bare = (segment: string) => words(segment) <= 2 && (!DETERMINER.test(segment) || /^the\s+\p{Lu}/u.test(segment));
  const parts = (segment: string) => segment.replace(LAST, "").split(AND_OR);
  // "A big, dry, secure shed": words that describe one thing.
  if (DETERMINER.test(first) && words(first) === 2 && segments.slice(1).flatMap(parts).every(bare)) return null;
  const last = segments.at(-1)!;
  const oxford = LAST.test(last);
  // "Thanks, and good luck!": two parts make a list only when the second is a new thing.
  if (segments.length === 2 && oxford && !NEW_THING_START.test(last.replace(LAST, ""))) return null;
  const items = [first];
  for (const [index, segment] of segments.slice(1).entries()) {
    const previous = items[items.length - 1]!;
    const core = segment.replace(LAST, "");
    // "Volunteers in Awka, Enugu and Lagos", "training in Igbo, Hausa or Yoruba", "workshops on digital
    // skills, Web3 and climate": short words after an item with "in", "on", "to" and the like finish its own list.
    const ownList = ITEM_TAIL.test(previous) && parts(segment).every(bare);
    // "A cold room, solar powered", "a pump, 50 metres deep", "a new roof, metal": words that describe the thing before.
    const describesIt =
      (DESCRIPTOR.test(core) || (DETERMINER.test(previous) && words(core) === 1)) && !NEW_THING_WORD.test(core);
    // "A big, dry shed and a ladder": a determiner and one word is not yet a thing.
    const unfinished = index === 0 && DETERMINER.test(first) && words(first) === 2 && !DETERMINER.test(core) && !NEW_THING_WORD.test(core);
    // "Volunteers from Lagos, Abuja, Kano and a truck": the short words before "and a" finish the list before it.
    const split = !ownList && ITEM_TAIL.test(previous) ? andSplit(segment, kind) : null;
    if (ownList || describesIt) items[items.length - 1] += `, ${segment}`;
    else if (split && bare(split[0]!)) {
      items[items.length - 1] += `, ${split[0]}`;
      items.push(...split.slice(1));
    } else if (unfinished) {
      const [head, ...tail] = andSplit(segment, kind) ?? [segment];
      items[items.length - 1] += `, ${head}`;
      items.push(...tail);
    } else items.push(segment);
  }
  if (items.length < 2) return null;
  // With a comma before its last "and", each item keeps its own "and".
  if (oxford && items.at(-1) === last) return [...items.slice(0, -1), last.replace(LAST, "")];
  if (oxford) return items;
  // No comma before the last "and": the last item splits at its "and" before a new thing. Single
  // words joined by "and" stay together, since "salt and pepper" cannot be told from "tools and compost".
  const split = andSplit(items.at(-1)!, kind);
  if (split) return [...items.slice(0, -1), ...split];
  return items.length >= 3 && !items.some((item) => AND.test(item)) ? items : null;
}

/** One sentence that asks for what this step lists, or is a bare list, read into its items. */
function itemsOf(sentence: string, lead: RegExp, kind: AskKind): string[] {
  const opening = sentence.match(lead)?.[0] ?? "";
  const body = withoutEndMarks(sentence.slice(opening.length).replace(/^[\s,:]+/u, "").trimEnd());
  // A colon or brackets hold a list inside one thing: "Kitchen equipment (pots, pans and knives)", "People: volunteers and a coordinator".
  const items = /[:(]/u.test(body) ? null : (listItems(body, kind) ?? andSplit(body, kind));
  if (!items) return sentence.split(NEW_THING_COMMA);
  // The first item keeps the words that opened the sentence, which its card's title leaves out.
  // "Workshops, our calendar, and a greenhouse" split at its "and" leaves the comma before it behind.
  const [first, ...rest] = items.map((item) => trimEnd(item.trim(), ", \t")).filter(Boolean);
  return first ? [`${opening}${opening && !/\s$/u.test(opening) ? " " : ""}${first}`, ...rest] : [sentence];
}

/**
 * The pieces of a needs or offers box, one per need or offer. Where the box says what this step
 * asks for in sentences of its own ("We need …"), only those sentences are read as lists, and the
 * sentences that only describe the initiative, point at a link or say what the other step asks for
 * make no card; a sentence that still asks or gives something always stays.
 */
export function listPieces(text: string, kind: AskKind): string[] {
  const lead = LEADS[kind];
  const other = LEADS[OTHER[kind]];
  const sentences = text.split(SENTENCES).filter((sentence) => sentence.trim());
  const focused = sentences.some((sentence) => lead.test(sentence.trim()));
  const pieces: string[] = [];
  for (const raw of sentences) {
    const trimmed = raw.trim();
    // "Hello, we need a pump": the greeting is left out when what follows asks.
    const greeted = trimmed.replace(GREETING, "");
    const sentence = greeted !== trimmed && lead.test(greeted) ? greeted : trimmed;
    const asks = lead.test(sentence);
    const asksOther = !asks && other.test(sentence);
    if (focused && !asks) {
      // A link has its own field, so a sentence that points at one makes no card ("You can find us at …").
      const describes = DESCRIBES.test(sentence) || (NAMED.test(sentence) && words(sentence) >= NAMED_WORDS);
      // "Hello!", "Thank you!": a courtesy makes no card, and would crowd a need out of the four.
      const courtesy = COURTESY.test(sentence) && words(sentence) <= 6;
      if ((asksOther && !SAYS[kind].test(sentence)) || POINTS.test(sentence) || ((describes || courtesy) && !ASKS_SOMETHING.test(sentence))) continue;
    }
    // Only what asks for this step, or a short bare list in a box that asks for nothing, is read as a list.
    // A bullet is already one item of the person's own list, so it is not split again.
    const bulleted = /^\s*(?:[-*•]|\d+[.)])\s/u.test(sentence);
    const bare = !focused && !bulleted && !asksOther && !SUBJECT.test(sentence) && !COURTESY.test(sentence) && !GREETING.test(sentence) && !DESCRIBES.test(sentence) && !NAMED.test(sentence) && !POINTS.test(sentence) && words(sentence) <= LIST_WORDS;
    if ((asks && !bulleted) || bare) pieces.push(...itemsOf(sentence, lead, kind));
    else pieces.push(...sentence.split(NEW_THING_COMMA));
  }
  return pieces;
}
