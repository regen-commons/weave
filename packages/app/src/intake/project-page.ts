import {
  ASK_LIMIT,
  AskStepSchema,
  AskSuggestionSchema,
  EMPTY_ASK,
  type AskFields,
  type AskItem,
  type AskKind,
  type AskStep,
} from "./contracts.ts";
import { chunksFrom, suggestKinds } from "./keywords.ts";
import { activeItems, fingerprint, PROJECT_PAGE_SOURCE } from "./state.ts";

/** At most this many needs and this many offers come from a project page, so the person's own still fit. */
export const PROJECT_PAGE_LIMIT = 3;
/** Certified project descriptions reach Weave cut at this many characters (`@weave/api` project discovery). */
const DESCRIPTION_CUT = 600;

/** One need or offer a project's description states, with the source key its entry keeps. */
export interface ProjectStatement {
  readonly key: string;
  readonly text: string;
  readonly value: AskFields;
}

/** The source every suggestion from one project shares: the prefix and a short, stable key for its address. */
export function projectSource(uri: string): string {
  let hash = 0x811c9dc5;
  for (const char of uri) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193);
  return `${PROJECT_PAGE_SOURCE}${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** Whole words in any script, since `\b` knows only ASCII letters. */
const cue = (...phrases: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.join("|")})(?![\\p{L}\\p{N}])`, "iu");
const WE = "(?:we|i)(?:['’]re| are| am)?(?: [a-z]+ly| still| also| now)?";
/** Words that ask for something. A sentence that both asks and offers counts as a need. */
const NEED = cue(
  `${WE} (?:need|needs|seek|seeking|looking for|searching for|asking for|calling for|in need of)`,
  "looking for", "searching for", "seeking", "in need of", "help us", "support us", "join us",
  "how (?:you|to) (?:can )?help", "ways to help",
  "(?:we|i)(?:['’]d| would) (?:welcome|love) (?:help|support|volunteers?|donations?|partners?|funding)",
  "please donate", "donate to (?:us|our|the project)", "accept(?:ing)? donations?",
  "your (?:donation|support|gift|contribution)s?", "volunteers? (?:needed|wanted|welcome)",
  "raising (?:funds|money)", "fundraising", "to raise (?:funds|money)",
  "our (?:main |biggest |current |next |key |urgent )?needs?",
  "precisamos", "necessitamos", "procuramos", "buscamos", "estamos (?:procurando|buscando|captando|arrecadando)",
  "ajude(?:-nos)?", "apoie", "contribua", "doações", "faça uma doação",
  "necesitamos", "estamos buscando", "ayúdanos", "apóyanos", "donaciones", "haz una donación",
);
/** Words that offer something: to share, teach, lend or open to others. */
const OFFER = cue(
  "(?:we|i)(?: also| can| now| regularly)? (?:offer|provide|share|teach|train|host|lend|give|distribute|mentor|facilitate|publish|organi[sz]e|run|deliver|help)",
  "offers", "provides", "shares", "teaches", "trains", "hosts", "lends", "gives away", "distributes", "mentors",
  "facilitates", "publishes", "helps", "connects", "enables", "equips", "offer", "provide", "share", "teach", "lend",
  "sharing", "lending", "available (?:to|for)", "open to (?:the public|all|everyone|anyone|visitors|schools|families)",
  "free of charge", "for free", "workshops?", "courses", "trainings?", "classes", "mentorship", "toolkits?", "guides?",
  "(?:seed|tool) (?:exchange|swap|library|bank)s?", "open[- ]source", "open data",
  "oferecemos", "oferece", "compartilhamos", "compartilha", "ensinamos", "ensina", "realizamos", "promovemos",
  "promove", "disponibilizamos", "disponibiliza", "emprestamos", "empresta", "distribuímos", "distribui",
  "capacitamos", "capacita", "apoiamos", "ajudamos", "oficinas?", "cursos?", "mutirões", "mutirão", "gratuit[oa]s?",
  "ofrecemos", "ofrece", "compartimos", "comparte", "enseñamos", "enseña", "brindamos", "brinda", "talleres",
);
/** Openings that only say who asks or offers, so the title can start with what is asked or offered. */
const LEAD: Record<AskKind, RegExp> = {
  needs:
    /^(?:(?:we|i)(?:['’]re| are| am)?(?: [a-z]+ly| still| also| now)? (?:need|seek|seeking|looking for|searching for|in need of)|(?:nós )?(?:precisamos|necessitamos)(?: de)?|(?:nós )?(?:procuramos|buscamos)|estamos (?:procurando|buscando)|necesitamos|estamos buscando)\s+/iu,
  offers:
    /^(?:(?:we|i)(?: also| can| now)? (?:offer|provide|share)|(?:nós )?(?:oferecemos|compartilhamos|disponibilizamos)|ofrecemos|compartimos|brindamos)\s+/iu,
};
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/u;

const kindOf = (text: string): AskKind | null => (NEED.test(text) ? "needs" : OFFER.test(text) ? "offers" : null);

/** A description cut on its way from Certified ends at its last whole sentence or line. */
function whole(description: string): string {
  if ([...description].length < DESCRIPTION_CUT) return description;
  const end = Math.max(...[".", "!", "?", "…", "\n"].map((mark) => description.lastIndexOf(mark)));
  return end > 0 ? description.slice(0, end + 1) : description;
}

/** The entry for one statement: its own words as the title, opened at what is asked or offered. */
function entry(text: string, kind: AskKind): AskFields | null {
  const words = text.replace(/\s+/gu, " ").trim();
  const rest = words.replace(LEAD[kind], "").replace(/[\s.!;:,]+$/u, "");
  const title = rest ? rest.charAt(0).toLocaleUpperCase() + rest.slice(1) : words;
  const long = title.length > 140;
  const value = AskSuggestionSchema.safeParse({
    ...EMPTY_ASK,
    // A long statement keeps its opening words as the title, cut between words, and all of it below.
    title: long ? title.slice(0, 140).replace(/\s+\S*$/u, "") : title,
    description: long ? words.slice(0, 600) : null,
    capitalForms: suggestKinds(words),
  });
  return value.success ? value.data : null;
}

/**
 * The needs and offers a project's public description states, in its order. Transparent keyword
 * proposals for the person to check, never a classification: a sentence counts only when its
 * words ask or offer. A list under a heading such as "What we need:" takes the heading's kind.
 */
export function projectPageAsks(description: string, source: string): Record<AskKind, ProjectStatement[]> {
  const found: Record<AskKind, ProjectStatement[]> = { needs: [], offers: [] };
  let heading: AskKind | null = null;
  let index = 0;
  const add = (text: string, kind: AskKind | null) => {
    const key = `${source}:${index++}`;
    const value = kind && entry(text, kind);
    if (kind && value) found[kind].push({ key, text, value });
  };
  for (const line of whole(description).split(/\r?\n/u)) {
    const text = line.trim();
    if (!text) continue;
    if (BULLET.test(text)) add(text.replace(BULLET, ""), kindOf(text) ?? heading);
    else if (text.endsWith(":")) heading = kindOf(text);
    else {
      heading = null;
      for (const chunk of chunksFrom(text, source)) add(chunk.text, kindOf(chunk.text));
    }
  }
  return found;
}

/** Words only, without a leading article, so "A water mapping workshop." and "Water mapping workshop" are one entry. */
const plain = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(?:a|an|the|um|uma|o|os|as|el|la|los|las|un|una) /u, "");

/**
 * Adds a project page's statements to one list as suggestions in pencil, after what is already
 * there. It never replaces an entry, repeats one, brings back one the person removed or goes past
 * the list's limit, and it adds at most three. They are not the person's change, so a list the
 * person already checked stays checked while they wait.
 */
export function suggestFromProjectPage(step: AskStep, statements: readonly ProjectStatement[]): AskStep {
  const seen = new Set(
    step.items.flatMap((item) => [item.value.title, item.value.description ?? ""].map(plain).filter(Boolean)),
  );
  const room = Math.min(PROJECT_PAGE_LIMIT, ASK_LIMIT - activeItems(step).length);
  const added: AskItem[] = [];
  for (const { key, text, value } of statements) {
    if (added.length >= room) break;
    const words = [value.title, value.description ?? "", text].map(plain).filter(Boolean);
    if (words.some((word) => seen.has(word))) continue;
    for (const word of words) seen.add(word);
    added.push({
      id: crypto.randomUUID(),
      sourceKey: key,
      fingerprint: fingerprint(value.description || value.title),
      value,
      decision: "pencil",
      decisionBeforeRemove: null,
    });
  }
  return added.length ? AskStepSchema.parse({ ...step, items: [...step.items, ...added] }) : step;
}
