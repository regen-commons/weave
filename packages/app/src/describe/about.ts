import { KIND } from "./names.ts";

/**
 * About it as the initiative's own description, in the person's own words: the box without the
 * clauses that say what the initiative needs or could offer, which belong on the Needs and Offers
 * steps, and without the speaker introducing themself by name. Clauses are left out whole, never
 * reworded, and only where a new one starts ("…and we need a pool", "…, but we serve 300 meals"),
 * so a description before or after an ask stays. What the work aims at stays too: "we need to
 * restore the river", "we're looking for ways to cut waste", "buscamos fortalecer…" and "so we can
 * offer free meals" describe the work. Where a rule cannot tell, the words stay: a clause that asks
 * and also says what the work does ("we need a van and the kitchen feeds 200 families") is kept
 * whole, and when nothing would be left, the words stay as they are. A sentence that only points at
 * the card's link is left out apart, in fill.ts, where the link is known.
 */

/** Words that may open a clause before what it says: "And", "But also", "Right now,". */
const LEAD = String.raw`(?:(?:and|but|also|so|plus|right[ \t]+now|currently|today|at[ \t]+the[ \t]+moment|y|pero|además|también|ahora|e|mas|também|agora)[, \t]+)*`;
/** Adverbs that may stand before a verb with or without its subject: "Still need volunteers". */
const ADVERBS = "also|really|still|urgently|desperately|badly|truly|actually|además|también|também|ainda|todavía|realmente|muito|mucho";
/** An adverb between "we" and its verb: "we really need", "we desperately need", "a gente também precisa". */
const ADVERB = String.raw`(?:(?:${ADVERBS})[ \t]+|[\p{L}\p{M}]+ly[ \t]+)?`;
/** An adverb before a verb said without its subject. No word in -ly: "Family needs shape everything we do" asks nothing. */
const BARE_ADVERB = String.raw`(?:(?:${ADVERBS})[ \t]+)?`;
/** Spanish and Portuguese words ending in -ar, -er or -ir that are nouns, not infinitives: "necesitamos lugar". */
const NOUNS_LIKE_VERBS = "lugar|hogar|mar|bar|altar|pilar|collar|azúcar|açúcar|taller|mujer|mulher|poder|placer|prazer|ayer|porvenir|par|celular|computador|ventilador";
/** Verbs that, after "need", are always something to get: "need to buy a boat", "necesitamos pagar el alquiler". */
const BUYING = "buy|hire|rent|pay|comprar|pagar|alquilar|alugar|contratar";
/**
 * Verbs that, after "need", are something to get only when a thing or money follows: "need to find
 * a venue", "raise funds". "Need to find homes for rescued dogs" and "raise awareness" are the work.
 */
const FINDING = "raise|get|find|replace|conseguir|arrecadar|recaudar|substituir|sustituir";
/** What makes a finding verb a getting: an article, "more", "new", or money. */
const A_THING =
  "a|an|some|new|more|another|the|our|funds|money|funding|donations|un|una|unos|unas|um|uma|uns|umas|más|mais|nuevo|nueva|novo|nova|otro|otra|outro|outra|fondos|fundos|dinero|dinheiro|recursos|financiamiento|financiamento|el|la|los|las|o|os|as|nuestro|nuestra|nosso|nossa";
/** Something to get, after "need to" or "necesitamos": "buy a boat", "raise funds", "conseguir un local". */
const GOT = String.raw`(?:(?:${BUYING})(?![\p{L}\p{M}])|(?:${FINDING})[ \t]+(?:(?:${A_THING})(?![\p{L}\p{M}])|[\p{N}$€£]))`;
/** An infinitive that says what the work aims at, not what it lacks: "fortalecer", "plantar", "pôr fim". */
const AIM = String.raw`(?!(?:${NOUNS_LIKE_VERBS})(?![\p{L}\p{M}])|${GOT})[\p{L}\p{M}]+(?:ar|er|ir|ír|ôr)(?![\p{L}\p{M}])`;
/** What follows "looking for", "seeking", "buscando" or "procurando" that makes it an aim: "ways to", "solutions to". */
const WAYS = String.raw`(?:ways|a[ \t]+way|new[ \t]+ways|solutions|answers|alternatives|justice|formas|maneras|maneiras|modos|caminos|caminhos|soluciones|soluções|respuestas|respostas|alternativas|justicia|justiça|to|que|de[ \t]+${AIM})(?![\p{L}\p{M}])`;

/**
 * What the initiative needs, as a clause opens: "We need tools", "we are looking for volunteers",
 * "The garden needs a fence", "Necesitamos herramientas", "Precisamos de mudas", "Looking for
 * volunteers!".
 */
const NEEDS = [
  String.raw`(?:(?:we|i|we['’]re|we[ \t]+are|were)[ \t]+${ADVERB}(?:need|needs)|${BARE_ADVERB}need|needs?[ \t]*:)(?![ \t]+to[ \t]+(?!${GOT}))(?![ \t]+each[ \t]+other)`,
  String.raw`(?:(?:we['’]re|we[ \t]+are|were|we)[ \t]+${ADVERB}|${BARE_ADVERB})(?:looking[ \t]+for|seeking|in[ \t]+need[ \t]+of)(?![ \t]+${WAYS})`,
  String.raw`(?:we|i)[ \t]+${ADVERB}(?:lack|could[ \t]+use|would[ \t]+love|would[ \t]+welcome)`,
  String.raw`(?:our|the)[ \t]+(?:biggest[ \t]+|main[ \t]+|greatest[ \t]+)?needs?[ \t]+(?:is|are)`,
  String.raw`what[ \t]+(?:we|i)[ \t]+${ADVERB}need[ \t]+(?:is|are|most)`,
  String.raw`(?:the|our|o|a|la|el|nuestra|nuestro|nossa|nosso)[ \t]+[\p{L}\p{M}]+[ \t]+(?:needs|necesita|precisa)(?![ \t]+(?:to[ \t]+)?${AIM})(?![ \t]+to[ \t]+(?!${GOT}))`,
  String.raw`(?:(?:nosotros|yo)[ \t]+${ADVERB}|${BARE_ADVERB})(?:necesitamos|necesito|requerimos)(?![ \t]+(?:${AIM}|que(?![\p{L}\p{M}])))`,
  String.raw`lo[ \t]+que[ \t]+(?:más[ \t]+)?necesitamos[ \t]+es`,
  String.raw`nos[ \t]+(?:hace[ \t]+falta|hacen[ \t]+falta|falta|faltan)`,
  String.raw`(?:estamos[ \t]+)?(?:buscando|buscamos)(?![ \t]+${AIM})(?![ \t]+${WAYS})`,
  String.raw`(?:(?:nós|eu|a[ \t]+gente)[ \t]+${ADVERB}|${BARE_ADVERB})(?:precisamos|precisa|preciso)(?:[ \t]+de)?(?![ \t]+(?:${AIM}|que(?![\p{L}\p{M}])))`,
  String.raw`o[ \t]+que[ \t]+(?:mais[ \t]+)?precisamos[ \t]+é`,
  String.raw`(?:estamos[ \t]+)?(?:procurando|procuramos)(?![ \t]+${AIM})(?![ \t]+${WAYS})`,
];
/** What the initiative could offer, as a clause opens: "We can offer our kitchen", "Podemos prestar sillas". */
const OFFERS = [
  String.raw`(?:we|i)[ \t]+${ADVERB}(?:can|could)[ \t]+${ADVERB}(?:offer|lend|share|host|give|provide)`,
  String.raw`we['’]d[ \t]+be[ \t]+happy[ \t]+to[ \t]+(?:offer|lend|share|host)`,
  String.raw`(?:nosotros[ \t]+)?podemos[ \t]+(?:ofrecer|compartir|prestar|dar)`,
  String.raw`(?:nós[ \t]+)?podemos[ \t]+(?:oferecer|compartilhar|emprestar|dar)`,
];
const opening = (shapes: readonly string[]) => new RegExp(String.raw`^${LEAD}(?:${shapes.join("|")})(?![\p{L}\p{M}])`, "iu");
const NEED = opening(NEEDS);
const OFFER = opening(OFFERS);
/** An offer said as what the work already does: "We can host up to 40 children", "thanks to donations". */
const DOES = /(?<![\p{L}\p{M}])(?:up[ \t]+to|thanks[ \t]+to|gracias[ \t]+a|graças[ \t]+a)(?![\p{L}\p{M}])/iu;
/** An opening phrase before the clause's own subject: "In need of a change, we started the market". */
const OPENING_PHRASE = /^(?:in[ \t]+need[ \t]+of|looking[ \t]+for|seeking|buscando|procurando)(?![\p{L}\p{M}])[^,]*,[ \t]*\p{L}/iu;
/** "The X needs" with a kind of group or place. */
const OF_KIND = /^(the|our|o|a|la|el|nuestra|nuestro|nossa|nosso)[ \t]+([\p{L}\p{M}]+)[ \t]+(?:needs|necesita|precisa)(?![\p{L}\p{M}])/iu;
/** Groups and places whose needs are why the work exists, unless they are "ours": "The school needs a garden, so we built one". */
const THEIRS = new Set(
  "community communities school schools village town city neighbourhood neighborhood region comunidad comunidade escuela escola barrio bairro pueblo ciudad cidade".split(" "),
);
const OURS = new Set(["our", "nuestra", "nuestro", "nossa", "nosso"]);

/** Whether a clause asks or offers, read from its first letters, after any emoji or bullet before them. */
function asks(clause: string): boolean {
  const start = clause.replace(/^[^\p{L}]+/u, "").slice(0, 160);
  if (OPENING_PHRASE.test(start)) return false;
  // "The garden needs a fence" says a need of the initiative itself, a kind of group or place;
  // "the world needs more trees" and "the school needs a garden, so we built one" say why the work matters.
  const of = OF_KIND.exec(start);
  if (of && of[2]!.toLowerCase() !== "gente") {
    if (!KIND.test(of[2]!)) return false;
    if (!OURS.has(of[1]!.toLowerCase()) && THEIRS.has(of[2]!.toLowerCase())) return false;
  }
  if (OFFER.test(start)) return !DOES.test(clause.slice(0, 400));
  return NEED.test(start);
}

/**
 * A second subject inside a clause that asks: "We need a van and the kitchen feeds 200 families",
 * "…because Maria cooks for the street", "Necesitamos una furgoneta y la cocina alimenta…". What
 * it says about the work cannot be told from the ask by keywords, so the clause stays whole.
 */
const SECOND_SUBJECT = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?:` +
    [
      String.raw`(?:and|but|while|whereas)[ \t]+(?:(?:the|our|their|this|these|those|my)(?![\p{L}\p{M}])|\p{Lu})`,
      String.raw`(?:y|pero|mientras)[ \t]+(?:(?:el|la|los|las|nuestr[oa]s?|est[ea]s?)(?![\p{L}\p{M}])|\p{Lu})`,
      String.raw`(?:e|mas|enquanto)[ \t]+(?:(?:o|a|os|as|noss[oa]s?|est[ea]s?|ess[ea]s?)(?![\p{L}\p{M}])|\p{Lu})`,
      String.raw`(?:because|since|porque|pois)(?![\p{L}\p{M}])`,
      String.raw`(?:ya|já)[ \t]+que(?![\p{L}\p{M}])`,
    ].join("|") +
    ")",
  "u",
);

/** Who opens a clause: "we", "I", "a gente", or a verb that says "we". */
const SUBJECT = String.raw`(?=(?:also[ \t]+|además[ \t]+|también[ \t]+|também[ \t]+|still[ \t]+)?(?:we|i|we['’]re|i['’]m|nós|nosotros|a[ \t]+gente|yo|eu|[\p{L}\p{M}]+(?:amos|emos|imos)|necesito|preciso|need|needs|nos[ \t]+(?:falta|faltan|hace|hacen)|lo[ \t]+que|o[ \t]+que|what[ \t]+we)(?![\p{L}\p{M}]))`;
/**
 * Where a new clause starts partway through a sentence: a joining word, a colon or a semicolon,
 * followed by who does something ("…and we need a pool", "…, but we serve 300 meals", "…y además
 * necesitamos…", "…por isso fazemos mutirões", "what we do: we restore reefs"). "So we can" and
 * "so that" go on with the clause before them. Joining words between things ("gloves and bags")
 * do not start a clause.
 */
const CLAUSE_START = new RegExp(
  String.raw`(?:[:;][ \t]*|(?:,[ \t]*|[ \t]+)(?:and|but|plus|while|so(?![ \t]+(?:that[ \t]+)?(?:we|i)[ \t]+(?:can|could)(?![\p{L}\p{M}]))|y|pero|e|mas|por[ \t]+isso|por[ \t]+eso|that[ \t]+is[ \t]+why|which[ \t]+is[ \t]+why)[ \t]+)${SUBJECT}`,
  "giu",
);
/** How many clause starts are read in one sentence, so a long run-on box stays cheap. The rest is one clause, kept. */
const MOST_CLAUSES = 40;

/** The text without these characters at its end, walking back so a long run costs only its length. */
function trimEnd(text: string, characters: string): string {
  let end = text.length;
  while (end > 0 && characters.includes(text[end - 1]!)) end--;
  return text.slice(0, end);
}
/** Closing quotes and brackets that may follow a sentence's end mark. */
const CLOSERS = `"'”’»)]`;

/** A sentence without the clauses that ask for or offer something. "" when every clause does. */
function withoutAsks(sentence: string): string {
  // Each clause, with the joining words that open it.
  const parts: { lead: string; body: string; unread: boolean }[] = [];
  let cursor = 0;
  let lead = "";
  let seen = 0;
  let unread = false;
  for (const match of sentence.matchAll(CLAUSE_START)) {
    if (++seen > MOST_CLAUSES) {
      unread = true;
      break;
    }
    parts.push({ lead, body: sentence.slice(cursor, match.index), unread: false });
    lead = match[0];
    cursor = match.index + match[0].length;
  }
  parts.push({ lead, body: sentence.slice(cursor), unread });
  const kept = parts.filter((part) => part.unread || !asks(part.body.trim()) || SECOND_SUBJECT.test(part.body));
  if (kept.length === parts.length) return sentence;
  if (!kept.length) return "";
  // The first clause kept loses the joining words before it; the others keep theirs.
  let joined = trimEnd(
    kept.map((part, index) => (index === 0 ? part.body.trim() : `${part.lead}${part.body}`)).join(""),
    " \t,;:-\u2013\u2014",
  );
  if (kept[0] !== parts[0]) joined = joined.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
  // A clause cut from the end leaves the sentence without its own end, a mark and any closing quote: it is put back.
  const whole = sentence.trimEnd();
  const end = whole.slice(trimEnd(trimEnd(whole, CLOSERS), ".!?").length);
  const last = joined.at(-1) ?? "";
  return /[.!?]/u.test(end) && !".!?".includes(last) && !CLOSERS.includes(last) ? `${joined}${end}` : joined;
}

/** Words that are not a name: "I'm from Bogotá", "soy profesora", "I'm with Semillas", "I'm happy to". */
const NOT_A_NAME = new Set(
  "a an the from in at so very really happy glad here just also of de da do del la el o los las um uma un una originally with part one not dr mr mrs ms".split(" "),
);
/** Small words inside a person's name: "Maria José da Silva", "Juan de la Cruz". */
const NAME_JOIN = new Set("da de do dos das del la y e van von bin".split(" "));
/**
 * The speaker introducing themself, at the start of a sentence: "My name is Grace and", "Hi, I'm
 * Tomás.", "My name is Tomás, and", "Me llamo Rosa y", "Meu nome é Ana e", "Soy Rosa y", "Eu sou a
 * Joana e". Their name is not the initiative's description. After "my name is" and its like, a name
 * said without capitals is one or two words before "and" or a comma; after "I'm", "soy" and "sou"
 * it must have its capitals.
 */
const INTRODUCTION =
  /^(?:(?:hi|hello|hey|hola|olá|ola|oi|buenos[ \t]+días|bom[ \t]+dia|um+|uh+|so|ok|okay|well)[,!.]?[ \t]+)*(?:(my[ \t]+name['’]?s|my[ \t]+name[ \t]+is|me[ \t]+llamo|mi[ \t]+nombre[ \t]+es|meu[ \t]+nome[ \t]+é|eu[ \t]+me[ \t]+chamo|me[ \t]+chamo)|i['’]m|i[ \t]+am|(?:yo[ \t]+)?soy|(?:eu[ \t]+)?sou(?:[ \t]+(?:a|o))?)[ \t]+((?:[\p{L}\p{M}'’.-]+[ \t]+){0,4}?[\p{L}\p{M}'’-]+)(?:(?<!(?:^|[ \t])(?:Dr|Mr|Mrs|Ms|Sr|Sra|Srta|Prof))[ \t]*[,.!][ \t]*(?:(?:and|y|e)[ \t]+)?|[ \t]+(?:and|y|e)[ \t]+|$)/iu;
function withoutIntroduction(sentence: string): string {
  const found = sentence.match(INTRODUCTION);
  if (!found) return sentence;
  const explicit = !!found[1];
  const name = found[2]!.split(/[ \t]+/u);
  const capitals = name.every((word, index) => /^\p{Lu}/u.test(word) || (index > 0 && NAME_JOIN.has(word.toLowerCase())));
  const plain = explicit && name.length <= 2 && sentence.slice(found[0].length).trim().length > 0;
  if (!capitals && !plain) return sentence;
  // The first word is the name's start: "I'm from Bogotá" and "soy de aquí" are not names; "Maria José da Silva" is.
  if (NOT_A_NAME.has(name[0]!.toLowerCase().replace(/\.$/u, "")) && !/^(?:Dr|Mr|Mrs|Ms)\.$/u.test(name[0]!)) return sentence;
  if (name.some((word, index) => /ing$/iu.test(word) || (index > 0 && NOT_A_NAME.has(word.toLowerCase()) && !NAME_JOIN.has(word.toLowerCase())))) return sentence;
  const rest = sentence.slice(found[0].length).trim();
  // "I coordinate the Kibera Green Hub" stays; a sentence that was only the introduction goes.
  return rest.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}

/** About it holds 400 characters, so no more than this is read for it: a box of 2,000,000 characters is read as fast as a short one. */
const READ = 20_000;
/** Where a sentence ends: its mark and the space after, or a line end. A title's full stop does not end one: "Dr. Ana Souza". */
const SENTENCE_END = /(?<=(?<!(?:^|[ \t])(?:Dr|Mr|Mrs|Ms|Sr|Sra|Srta|Prof|St|Mt))[.!?])[ \t]+|[ \t]*\n+[ \t]*/gu;
/** A piece that only numbers or marks a list's item: "2.", "b)", "-". It goes with the item after it. */
const LIST_MARK = /^(?:\(?(?:\p{N}{1,3}|\p{L})[.)]|[-*•])$/u;
/** What stood between two sentences: a space, a line end or a blank line, widest last. */
const GAPS = [" ", "\n", "\n\n"] as const;
const gapOf = (separator: string) => Math.min(2, separator.split("\n").length - 1);

/** The person's words as the initiative's own description, or the words as they are when nothing is left out. */
export function initiativeWords(text: string): string {
  // A run of spaces is one space, as the other keyword rules read it, so no pattern retries across it.
  const read = text.slice(0, READ).replace(/[ \t]{2,}/gu, " ");
  const pieces: { piece: string; before: string }[] = [];
  let cursor = 0;
  let before = "";
  for (const match of read.matchAll(SENTENCE_END)) {
    pieces.push({ piece: read.slice(cursor, match.index), before });
    before = match[0];
    cursor = match.index + match[0].length;
  }
  pieces.push({ piece: read.slice(cursor), before });

  let changed = false;
  let kept = "";
  // The widest gap since the last sentence kept, so a line end or a blank line between sentences stays.
  let gap = -1;
  let mark = "";
  for (const { piece, before: separator } of pieces) {
    if (separator) gap = Math.max(gap, gapOf(separator));
    const sentence = piece.trim();
    if (!sentence) continue;
    if (LIST_MARK.test(sentence)) {
      mark = sentence;
      continue;
    }
    const without = withoutAsks(withoutIntroduction(sentence)).trim();
    if (without !== sentence) changed = true;
    if (without) {
      kept += `${kept ? GAPS[Math.max(gap, 0)] : ""}${mark ? `${mark} ` : ""}${without}`;
      gap = -1;
    }
    // A list item left out takes its number with it.
    mark = "";
  }
  // Nothing left out: the words as the person gave them, line ends and all.
  if (!changed || !kept) return text;
  return kept;
}
