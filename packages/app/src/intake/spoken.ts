/**
 * A list said in one go, read into one line per need or offer. Speech recognizers often write
 * no full stops or commas, so the written rules in `chunksFrom` would make one card of a whole
 * recording. These rules read the ways people go from one item to the next aloud: saying the
 * need or offer again ("we also need"), "and also" and its like, "and a" or "and someone", and
 * counting ("first ... second ..."). They only add line breaks and drop sounds of thinking; every
 * other word stays as it was said. Each rule is a suggestion: the person checks every card.
 */

/** Letters, marks and digits in any script, so a rule never matches inside a longer word. */
const LETTER = String.raw`[\p{L}\p{M}\p{Nd}_]`;
const END = String.raw`(?!${LETTER}|['’-])`;
const START = String.raw`(?<!${LETTER}|['’])`;
const APOSTROPHE = String.raw`['’]`;

/** Sounds of thinking a recognizer writes as words. */
const FILLER = /^(?:u+m+|u+h+|u+h+m+|e+r+m*|h+m+|a+h+)[,.]?$/iu;

/** Saying a need: "we need", "we also need", "we'd like", "we're looking for", "we could use". */
const NEED_VERB = String.raw`(?:need|needs|require|lack|want|are\s+missing|${APOSTROPHE}re\s+missing)`;
/** The verbs that only say "this is an offer", so a card's title leaves them out. */
const OFFER_VERB = String.raw`(?:offer|share|provide|give|contribute)`;
/** The verbs that say what kind of offer it is, so a card's title keeps them. */
const OFFER_ACTION = String.raw`(?:lend|teach|host|bring|run|help\s+with)`;
const SUBJECT = String.raw`(?:we|i)`;
const ADVERB = String.raw`(?:\s+(?:also|really|still|definitely|especially|always))?`;
const MODAL = String.raw`\s+(?:can|could|would|will)${ADVERB}`;
/** The words that say what follows is a need or an offer: the subject, any helper verb and the verb. */
const LEAD_PARTS = [
  // "we'd like", "we would also love"
  String.raw`(?:${APOSTROPHE}d|\s+would)${ADVERB}\s+(?:like|love)(?:\s+to\s+have)?`,
  // "we're looking for", "we are also looking for"
  String.raw`(?:${APOSTROPHE}re|\s+are)${ADVERB}\s+(?:looking\s+for|searching\s+for|after)`,
  // "we could use", "we can offer", "we can also share"
  String.raw`${MODAL}\s+(?:use|${OFFER_VERB})`,
  // "we need", "we also need", "we really want", "we offer"
  String.raw`${ADVERB}\s+(?:${NEED_VERB}|${OFFER_VERB})`,
  // "we have ... to offer", "we've got to share"
  String.raw`(?:${APOSTROPHE}ve|\s+have)(?:\s+got)?\s+(?:to\s+)?(?:offer|share|give)`,
].join("|");
/** "We need" and its like, as a person opens a need or an offer. */
const LEAD = String.raw`${SUBJECT}(?:${LEAD_PARTS})${END}`;
/** "We can lend", "I can teach": the offer's own verb stays in the card's title. */
const ACTION_LEAD = String.raw`${SUBJECT}(?:${MODAL}|${ADVERB})\s+(?=${OFFER_ACTION}${END})`;
/** Portuguese, as the written rules read it. */
const LEAD_PT = String.raw`(?:nós\s+)?(?:também\s+)?(?:precisamos(?:\s+de)?|oferecemos|podemos\s+oferecer|queremos)${END}`;
/** Words that only join one item to the next. */
const JOINER = String.raw`(?:and\s+also|and\s+then|and\s+another\s+thing(?:\s+is)?|another\s+thing(?:\s+is)?|as\s+well\s+as|on\s+top\s+of\s+that|besides\s+that|apart\s+from\s+that|plus|also|e\s+também)`;
/** "And" before a new thing: "and a", "and someone", "and help with". */
const AND_NEW = String.raw`(?:and|e)\s+(?:a|an|some|someone|somebody|more|any|access\s+to|help|um|uma|alguém|mais)${END}`;
/** Counting the items aloud. "Last" and "next" alone are left: "last year", "next season". */
const ORDINAL = String.raw`(?:first(?:ly)?(?:\s+of\s+all)?|second(?:ly)?|third(?:ly)?|fourth(?:ly)?|fifth(?:ly)?|finally|lastly|last\s+of\s+all|number\s+(?:one|two|three|four|five)|primeiro|segundo|terceiro|por\s+último)${END}`;
/** "We need three things", which announces the list and is not an item of it. */
const ANNOUNCEMENT = new RegExp(
  String.raw`^(?:a\s+few|a\s+couple(?:\s+of)?|some|several|many|a\s+lot\s+of|two|three|four|five|\d+|the\s+following)\s+(?:things?|items?)(?:\s+\S+){0,4}[.:,]?$`,
  "iu",
);
/** A joiner, or "so" or "but", left at the start of a piece by the split before it. */
const OPENING = new RegExp(String.raw`^(?:(?:${JOINER}|and|so|but|then|e|também)${END}[\s,:]*)+`, "iu");
/** Words that start a new thing, so a sound of thinking just before one is a pause between items. */
const NEW_THING = /^(?:a|an|some|someone|somebody|more|any|another|help|access|um|uma|alguém)$/iu;
/** Words after which "we need" goes on the same need: "because we need to plant". */
const DEPENDENT = String.raw`(?:because|since|that|which|who|where|when|if|as|until|while|unless|whether|what|how|why|so\s+that|than|porque|que|quando)`;
const CLOSING = /(?:(?<![\s,])[\s,]+(?:and|so|but|e))+[\s,]*$|(?<![\s,])[\s,]+$/iu;
const LEADING = new RegExp(String.raw`^(?:${LEAD}|${LEAD_PT})[\s,:]*`, "iu");
const ORDINAL_START = new RegExp(String.raw`^${ORDINAL}[\s,:]*`, "iu");
/** "We have a truck", a short thing said to be had, which a "we can lend" straight after describes. */
const HAVE_THING = new RegExp(String.raw`^${SUBJECT}(?:\s+have|${APOSTROPHE}ve\s+got)(?:\s+[\p{L}\p{M}'’-]+){1,4}$`, "iu");
/**
 * "We can lend" said straight after the thing, or after only "and", with no thing of its own after
 * the verb: "we have a trailer we can lend on weekends" and "we have a trailer and we can lend it"
 * lend the trailer, while "we can also teach cooking" is a new offer.
 */
const CAN_VERB = new RegExp(
  String.raw`^${SUBJECT}${MODAL}\s+(?:${OFFER_ACTION}|${OFFER_VERB}|use)${END}(?:\s+(?:it|them|out|on|in|at|for|to|every|each|whenever|when|during|if|anytime|sometimes|most|any)${END}.*)?$`,
  "iu",
);

/**
 * The spaces and commas between two words, matched whole from where they start. Matching a run
 * only from its start, and only to its end, keeps every rule linear on a box of 20,000 commas.
 */
const GAP = String.raw`(?<![\s,])[\s,]+(?![\s,])`;
const COMMA_GAP = String.raw`(?<![\s,])\s*,[\s,]*(?![\s,])`;

function boundaries(counted: boolean): RegExp {
  const rules = [
    // Saying the need or offer again starts the next one, unless it explains the one before.
    String.raw`(?<!${START}${DEPENDENT})${GAP}(?=(?:(?:and|but|so|then|e)\s+)?(?:${LEAD}|${LEAD_PT}|${ACTION_LEAD}))`,
    // "And we have" brings another thing to offer; "we have" alone may explain a need.
    String.raw`${GAP}(?=and\s+${SUBJECT}(?:\s+also)?\s+have${END})`,
    // A comma before "and", or before a new thing, closes an item in a list: "seedlings, a room, and fencing".
    String.raw`${COMMA_GAP}(?=and\s|(?:a|an|some|someone|somebody|more|any|another|help|access|um|uma|alguém)${END})`,
    // "And also": not the "also" inside "we also need" or "can also share".
    String.raw`(?<!${START}(?:we|i|can|could|would|will|do|are|${APOSTROPHE}d|${APOSTROPHE}re))${GAP}(?=${JOINER}${END})`,
    String.raw`${GAP}(?=${AND_NEW})`,
  ];
  // Counting splits only where at least two counted items were said, so "first aid kits" stays whole.
  if (counted) rules.push(String.raw`${GAP}(?=(?:and\s+)?${ORDINAL})`);
  return new RegExp(rules.join("|"), "iu");
}

/** True when the words count off two items or more, as in "first seedlings, second a room". */
function counts(text: string): boolean {
  return (text.match(new RegExp(`${START}${ORDINAL}`, "giu"))?.length ?? 0) >= 2;
}

/**
 * Splits spoken words into one line per need or offer. Sentences and line breaks already in the
 * words are kept as they are; the spoken rules only split within them. A piece that only says
 * "we need", or announces how many things follow, joins the piece after it.
 */
export function spokenLines(said: string): string[] {
  // Sounds of thinking go. One just before "a" or "someone" was a pause between two things.
  const tokens = said.split(/[^\S\r\n]+/u).filter(Boolean);
  const words = tokens
    .map((word, index) => {
      if (!FILLER.test(word)) return word;
      const next = tokens[index + 1];
      return index > 0 && next && NEW_THING.test(next) ? "\n" : "";
    })
    .filter(Boolean)
    .join(" ");
  const counted = counts(words);
  const split = boundaries(counted);
  const lines: string[] = [];
  let carried = "";
  for (const sentence of words.split(/\r?\n+|;\s*|(?<=[.!?])\s+/u)) {
    let previous = "";
    for (const raw of sentence.split(split)) {
      let piece = raw.replace(OPENING, "");
      if (counted) piece = piece.replace(ORDINAL_START, "");
      piece = piece.replace(CLOSING, "").trim();
      if (!piece) continue;
      const lead = piece.match(LEADING)?.[0] ?? "";
      const rest = piece.slice(lead.length).replace(/[.:]$/u, "").trim();
      // "We need" said alone, or "we need three things", goes on to the item said next.
      if (!rest || ANNOUNCEMENT.test(rest)) {
        carried = lead.trim() || carried;
        continue;
      }
      // "We have a truck we can lend on weekends": the truck is the offer, and lending is what it is for.
      // A lone "and" between them was a piece of its own and left nothing, so the two still meet here.
      if (previous && HAVE_THING.test(previous) && CAN_VERB.test(raw.trim()) && lines.length) {
        lines[lines.length - 1] = `${lines[lines.length - 1]} ${piece}`;
        previous = "";
        continue;
      }
      lines.push(carried && !lead ? `${carried} ${piece}` : piece);
      previous = piece;
      carried = "";
    }
  }
  return lines;
}

/** The spoken words with one need or offer on each line, as the box shows them and the list reads them. */
export const spokenList = (said: string): string => spokenLines(said).join("\n");

const TITLE_LEAD = new RegExp(
  String.raw`^(?:(?:and|so|also|but|plus)\s+)*(?:${ACTION_LEAD}|${LEAD}[\s,:]*|${LEAD_PT}[\s,:]*)`,
  "iu",
);

/**
 * A card's title from the words it came from, without the "we need" or "we can offer" that the
 * list's own heading already says: "We need seedlings" is "Seedlings" under What You Need. An
 * offer's own verb stays, as in "Lend tools". The words as said stay in the step's own record.
 */
export function cardTitle(text: string): string {
  const title = text.replace(TITLE_LEAD, "").trim();
  return (title || text).replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase());
}
