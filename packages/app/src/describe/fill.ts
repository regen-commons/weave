import {
  ABOUT_LIMIT,
  EMPTY_INITIATIVE,
  STORED_SAID_LIMIT,
  LENS_LABELS,
  LensSchema,
  LinkSchema,
  StageSchema,
  confirmDraft,
  revise,
  type DerivedKey,
  type DeviceDraft,
  type FieldKey,
  type Initiative,
  type RecordForm,
} from "./contracts.ts";
import { DETAIL_KEYS, detailValues, keptValues } from "./details.ts";
import { editsFromForm, formFrom, parseRecordForm } from "./forms.ts";
import { STAGE_LABELS } from "../listing.ts";
import { previewFields } from "./view.ts";

/**
 * A problem with what the person typed, said in a sentence the page can show as it is. `field`
 * is the one of the four fields it is about, so the page can say it there (DL-123); a problem
 * with the box has none.
 */
export class FieldsProblem extends Error {
  readonly field: FieldKey | undefined;
  constructor(message: string, field?: FieldKey) {
    super(message);
    this.field = field;
  }
}

const FIELDS: readonly FieldKey[] = ["name", "where", "about", "links"];
const DETAILS = DETAIL_KEYS;
const NAME_HELP = "Add a name for your initiative.";
const PLACES_HELP = "Use up to eight places, each up to 120 characters.";
const LINK_HELP = "Use a complete http or https link, such as https://example.org.";
const ABOUT_HELP = `Keep About it to ${ABOUT_LIMIT} characters or fewer.`;

/** What the four fields show, and so what Continue reads. */
export function fieldsForm(draft: DeviceDraft): RecordForm {
  return draft.form ?? formFrom(previewFields(draft));
}

/** As many characters as the box takes by typing or talking. */
export const SAID_LIMIT = 20000;
const BOX_FULL = "The box takes 20,000 characters, and this would be more. You can shorten what is here. Nothing has been removed.";

/**
 * What the box holds: the words the person said or typed. A draft from the earlier guided
 * conversation shows everything it held there, in the order it was given: each sent answer as
 * the person last changed it, then the words still being typed, which that version stored beside
 * the answers on every keystroke, then a link typed and not yet added. Nothing it held is lost.
 */
export function saidText(draft: DeviceDraft): string {
  const link = draft.pendingLink.trim();
  // Words being typed are returned exactly, spaces and line ends included.
  if (!draft.turns.length && !link) return draft.composer;
  const answers = draft.turns.map((turn) => draft.answerEdits[turn.id]?.trim() || turn.text);
  return [...answers, draft.composer, link].filter((part) => part.trim()).join("\n\n");
}

/**
 * The person changed the box. Everything the earlier conversation held is already in the text
 * the box showed, so it becomes the box's own words and is kept once.
 */
export function changeSaid(draft: DeviceDraft, text: string): DeviceDraft {
  // Earlier answers can add up to more than the box takes. A change that does not make them
  // longer is always accepted, so they can be trimmed a character at a time. Only adding is refused.
  if (text.length > SAID_LIMIT && (text.length > saidText(draft).length || text.length > STORED_SAID_LIMIT))
    throw new FieldsProblem(BOX_FULL);
  return revise(draft, { composer: text, turns: [], answerEdits: {}, pendingLink: "" }, true);
}

/** What the page says under a box that holds more than it takes, so typing that adds nothing is explained. */
export function boxNote(said: string): string {
  return said.length > SAID_LIMIT
    ? "This is more than the box takes, so you can shorten it but not add to it. Fill In The Fields still reads it."
    : "";
}

/** Cuts words to a length at the end of a sentence where there is one, otherwise between words. */
export function clip(text: string, limit: number): string {
  const whole = text.trim().replace(/\s+/gu, " ");
  if (whole.length <= limit) return whole;
  const cut = whole.slice(0, limit + 1);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence >= limit / 2) return cut.slice(0, sentence + 1);
  return cut.slice(0, limit).replace(/\s+\S*$/u, "");
}

/** The first complete link in the words, or nothing. Only a link the person gave is ever proposed. */
export function linkIn(text: string): string {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/giu)) {
    const candidate = match[0].replace(/[.,;:!?)\]]+$/u, "");
    if (LinkSchema.safeParse(candidate).success) return candidate;
  }
  return "";
}

/**
 * The links text as two parts: the first line is the one field's own slot, and every link after
 * it belongs to a card saved earlier. The slot may be empty. An empty slot stays empty, so
 * clearing the field never pulls another link into it for the next keystroke to change.
 */
function linkSlots(form: RecordForm): { main: string; others: string[] } {
  const [first = "", ...rest] = form.links.split("\n");
  const [main = "", ...sameLine] = first.trim().split(/\s+/u).filter(Boolean);
  return { main, others: [...sameLine, ...rest.flatMap((line) => line.trim().split(/\s+/u).filter(Boolean))] };
}
/** The one link the field shows: its own slot, which is the first link of a card loaded with several. */
export const mainLink = (form: RecordForm): string => linkSlots(form).main;
/** Links a card saved earlier holds beyond the field's own. They stay with the card and are not shown as fields. */
export const otherLinks = (form: RecordForm): string[] => linkSlots(form).others;
/** The links text after the one field changed: its slot, empty or not, then the others as they were. */
export function withMainLink(form: RecordForm, link: string): string {
  const others = otherLinks(form);
  return others.length ? [link.trim(), ...others].join("\n") : link.trim();
}

/** Words that only point somewhere: "See ... for more", "Visit ... to learn more", "Saiba mais em ...". */
const POINTER = new Set(
  [
    "see visit more info information details at on our the website site web page homepage for find us here go to",
    "check out learn read about online link follow and or a also can you please full story more:",
    "mais veja visite acesse acesso informações informacoes saiba em no na nosso nossa página pagina para ver sobre aqui",
    "más mas información informacion visita visítanos visitanos en nuestro nuestra sitio aquí aqui conoce",
  ]
    .join(" ")
    .split(" "),
);
/**
 * About it without the sentences that only point at a link the card holds, such as "See
 * https://example.org for more." A sentence that says something beside its link is kept whole,
 * and so is one whose link the card does not hold, since it is then the only place the link is.
 */
export function withoutLinkPointers(text: string, links: readonly string[]): string {
  if (!links.length) return text;
  const held = new Set(links.map((link) => link.trim()));
  return text
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => {
      const found = [...sentence.matchAll(/https?:\/\/[^\s<>"']+/giu)].map((match) => match[0].replace(/[.,;:!?)\]]+$/u, ""));
      if (!found.length || !found.every((link) => held.has(link))) return true;
      const rest = sentence.replace(/https?:\/\/[^\s<>"']+/giu, " ").toLocaleLowerCase().match(/[\p{L}\p{M}:]+/gu) ?? [];
      return !rest.every((word) => POINTER.has(word));
    })
    .join(" ");
}

/** What a fill did, so the page can say it in one line. */
export interface FillResult {
  readonly draft: DeviceDraft;
  readonly fields: readonly FieldKey[];
  readonly details: number;
  /** Which of Name and Where you work are still empty, so the page can ask for them by name. */
  readonly missing: readonly FieldKey[];
}

/**
 * Puts a suggestion into the four fields in place. It fills a blank field, and one that still
 * holds an earlier fill; a field the person typed or changed is theirs and stays. The suggested
 * details become chips in pencil, and the ones already kept stay kept.
 */
export function fillFields(
  draft: DeviceDraft,
  suggestion: Initiative,
  build: NonNullable<DeviceDraft["lastBuild"]>,
  said = saidText(draft),
): FillResult {
  const before = fieldsForm(draft);
  const proposed: RecordForm = {
    // "we are the seed library" names the Seed library: a name starts with a capital and no article.
    name: suggestion.name.trim().replace(/^the\s+/u, "").replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase()),
    where: suggestion.isGlobal ? "Global" : suggestion.locations.join("; "),
    about: "",
    links: linkIn(said),
  };
  const form = { ...before };
  const filled = new Set(draft.filled);
  // The link the card will hold after this fill, by the same rule as the loop below. A sentence in
  // About it that only points at a link the card holds says nothing the link field does not.
  const keepsLink = !!proposed.links && (!mainLink(before) || filled.has("links"));
  const cardLinks = [keepsLink ? proposed.links : mainLink(before), ...otherLinks(before)].filter(Boolean);
  proposed.about = clip(withoutLinkPointers(suggestion.description, cardLinks), ABOUT_LIMIT);
  const fields: FieldKey[] = [];
  for (const key of FIELDS) {
    const current = key === "links" ? mainLink(before) : before[key].trim();
    if ((current && !filled.has(key)) || !proposed[key]) continue;
    form[key] = key === "links" ? withMainLink(before, proposed.links) : proposed[key];
    filled.add(key);
    fields.push(key);
  }
  const next = revise(
    draft,
    {
      mode: "fields",
      form,
      filled: FIELDS.filter((key) => filled.has(key)),
      publicEdits: editsFromForm(form, draft.publicEdits),
      // The suggestion is kept at the length the field takes, so nothing longer is ever on offer.
      proposal: { ...suggestion, description: proposed.about },
      proposalVersion: draft.inputVersion + 1,
      lastBuild: build,
    },
    true,
  );
  return {
    draft: next,
    fields,
    details: detailChips(next).filter((chip) => !chip.kept).length,
    missing: (["name", "where"] as const).filter((key) => !form[key].trim()),
  };
}

/** The person changed a field. It is theirs from now on, so it leaves the filled list. */
export function editFields(draft: DeviceDraft, form: RecordForm): DeviceDraft {
  const before = fieldsForm(draft);
  return revise(
    draft,
    {
      mode: "fields",
      form,
      filled: draft.filled.filter((key) => form[key] === before[key]),
      publicEdits: editsFromForm(form, draft.publicEdits),
    },
    true,
  );
}

/** One suggested detail as a chip: dashed until tapped, kept once it is. */
export interface DetailChip {
  readonly key: DerivedKey;
  readonly value: string;
  readonly label: string;
  readonly kept: boolean;
}

function labelOf(key: DerivedKey, value: string): string {
  if (key === "stage") return STAGE_LABELS[StageSchema.parse(value)];
  if (key === "lenses") return LENS_LABELS[LensSchema.parse(value)];
  if (key === "languages") return new Intl.DisplayNames(["en"], { type: "language" }).of(value) ?? value;
  // Themes and who it serves are the person's own words, shown as a label starts: with a capital.
  return value.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase());
}
/**
 * Every detail on offer, in the order Stage, Type of work, Themes, Who it serves, Languages:
 * what the last fill suggested and what the person keeps. None of them is needed to continue.
 */
export function detailChips(draft: DeviceDraft): DetailChip[] {
  return DETAILS.flatMap((key) => {
    const kept = keptValues(draft, key);
    return [...new Set([...kept, ...detailValues(key, draft.proposal)])].map((value) => ({
      key,
      value,
      label: labelOf(key, value),
      kept: kept.includes(value),
    }));
  });
}

/** Tapping a chip keeps it, and tapping it again lets it go. An initiative has one stage, so a new one takes its place. */
export function toggleDetail(draft: DeviceDraft, chip: Pick<DetailChip, "key" | "value">): DeviceDraft {
  const kept = keptValues(draft, chip.key);
  const next = kept.includes(chip.value)
    ? kept.filter((value) => value !== chip.value)
    : chip.key === "stage"
      ? [chip.value]
      : [...kept, chip.value];
  return revise(draft, {
    kept: [...new Set([...draft.kept, chip.key])],
    removed: draft.removed.filter((key) => key !== chip.key),
    derivedEdits: { ...draft.derivedEdits, [chip.key]: chip.key === "stage" ? (next[0] ?? null) : next },
    reviewEdits: Object.fromEntries(Object.entries(draft.reviewEdits).filter(([key]) => key !== chip.key)),
    confirmed: null,
  });
}

/**
 * What About it already read on this card before now: as last continued, as built, and as saved
 * to the account. A card from before the shorter limit may hold more than it, and keeps it.
 */
export function earlierAbouts(draft: DeviceDraft): string[] {
  let saved = "";
  try {
    const document: unknown = JSON.parse(draft.account.saved?.contentKey ?? "null");
    const description = (document as { initiative?: { description?: unknown } } | null)?.initiative?.description;
    if (typeof description === "string") saved = description;
  } catch {
    /* A binding that cannot be read names no earlier words. */
  }
  return [draft.confirmed?.description ?? "", draft.proposal?.description ?? "", saved].filter(Boolean);
}

/**
 * Reads the four fields as typed, or throws a FieldsProblem that says what to fix. About it is
 * held to its limit, except for words a card already held before the limit was shortened.
 */
export function readFields(form: RecordForm, earlier: readonly string[] = []) {
  if (!form.name.trim()) throw new FieldsProblem(NAME_HELP, "name");
  if (form.about.length > ABOUT_LIMIT && !earlier.includes(form.about)) throw new FieldsProblem(ABOUT_HELP, "about");
  try {
    parseRecordForm({ ...form, links: "" });
  } catch {
    throw new FieldsProblem(PLACES_HELP, "where");
  }
  try {
    return parseRecordForm(form);
  } catch {
    throw new FieldsProblem(LINK_HELP, "links");
  }
}

/**
 * Continue from the describe step. The card is the four fields as they read, with the details
 * the person tapped; the suggestions they left in pencil stay suggestions and are not on the
 * card. Nothing is left to check on another page. Throws a FieldsProblem when the fields cannot
 * make a card.
 */
export function continueDescribe(draft: DeviceDraft): DeviceDraft {
  const typed = readFields(fieldsForm(draft), earlierAbouts(draft));
  const details = Object.fromEntries(
    DETAILS.map((key) => {
      const kept = keptValues(draft, key);
      return [key, key === "stage" ? (kept[0] ?? null) : kept];
    }),
  );
  return confirmDraft(
    revise(draft, {
      mode: "fields",
      publicEdits: typed,
      proposal: draft.proposal ?? { ...EMPTY_INITIATIVE, ...typed, confidence: 1 },
      proposalVersion: draft.inputVersion,
      derivedEdits: details,
      kept: [...DETAILS],
      removed: [],
      reviewEdits: {},
      confirmed: null,
      lastBuild: draft.lastBuild ?? {
        engine: "manual",
        unreadFiles: draft.attachments.length,
        sourceCharacters: typed.description.length,
        files: [],
        fallback: false,
      },
    }),
  );
}

/** "320 of 400", once the words are within a fifth of the limit. Empty before that, so the count is not noise. */
export function nearLimit(length: number, limit: number): string {
  return length >= limit * 0.8 ? `${length} of ${limit}` : "";
}

/** The four fields as their labels name them, for a line that says which were filled. */
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Name",
  where: "Where you work",
  about: "About it",
  links: "Website or main link",
};
/** "Name", "Name and About it", "Name, Where you work and About it". */
const listed = (words: readonly string[]): string =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/**
 * One line for the reserved status place after a fill (DL-123). It names the fields that were
 * filled, so the person knows where to look, and asks by name for a name or a place the words
 * did not give. The suggested details are not counted: the page no longer shows them.
 */
export function fillSummary({ fields, missing = [] }: Pick<FillResult, "fields"> & { missing?: readonly FieldKey[] }): string {
  const ask = missing.length
    ? `Add ${listed(missing.map((key) => (key === "name" ? "a name" : "where you work")))} below.`
    : "";
  if (fields.length) return `Filled ${listed(fields.map((key) => FIELD_LABELS[key]))}. ${ask || "Check and change anything."}`;
  return ask ? `Nothing new to fill in. ${ask}` : "Nothing new to fill in. You can type in the fields.";
}

/** Said in the status place while a fill reads the words, and any files, on the device. */
export function readingNote(words: boolean, files: number): string {
  const what = [words ? "your words" : "", files ? (files === 1 ? "your file" : "your files") : ""].filter(Boolean);
  return `Reading ${listed(what.length ? what : ["your words"])} on this device.`;
}
