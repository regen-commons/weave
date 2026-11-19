import {
  ABOUT_LIMIT,
  EMPTY_INITIATIVE,
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

/** A problem with what the person typed, said in a sentence the page can show as it is. */
export class FieldsProblem extends Error {}

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

/**
 * What the box holds: the words the person said or typed. A draft from the earlier guided
 * conversation shows its answers there, so nothing it held is lost.
 */
export function saidText(draft: DeviceDraft): string {
  return draft.composer || draft.turns.map((turn) => turn.text).join("\n\n");
}

/** The person changed the box. Earlier conversation answers become its text, so they are kept once. */
export function changeSaid(draft: DeviceDraft, text: string): DeviceDraft {
  return revise(draft, { composer: text, turns: [], answerEdits: {} }, true);
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

/** What a fill did, so the page can say it in one line. */
export interface FillResult {
  readonly draft: DeviceDraft;
  readonly fields: readonly FieldKey[];
  readonly details: number;
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
    about: clip(suggestion.description, ABOUT_LIMIT),
    links: linkIn(said),
  };
  const form = { ...before };
  const filled = new Set(draft.filled);
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
  return { draft: next, fields, details: detailChips(next).filter((chip) => !chip.kept).length };
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
  if (!form.name.trim()) throw new FieldsProblem(NAME_HELP);
  if (form.about.length > ABOUT_LIMIT && !earlier.includes(form.about)) throw new FieldsProblem(ABOUT_HELP);
  try {
    parseRecordForm({ ...form, links: "" });
  } catch {
    throw new FieldsProblem(PLACES_HELP);
  }
  try {
    return parseRecordForm(form);
  } catch {
    throw new FieldsProblem(LINK_HELP);
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

/** One line for the reserved status place after a fill. */
export function fillSummary({ fields, details }: Pick<FillResult, "fields" | "details">): string {
  const filled = fields.length ? `Filled ${fields.length} ${fields.length === 1 ? "field" : "fields"}` : "";
  const suggested = details ? `suggested ${details} ${details === 1 ? "detail" : "details"}` : "";
  if (filled && suggested) return `${filled} and ${suggested}. Check them and change anything.`;
  if (filled) return `${filled}. Check ${fields.length === 1 ? "it" : "them"} and change anything.`;
  if (suggested) return `S${suggested.slice(1)}. Your own words in the fields were not changed.`;
  return "Nothing new to fill in. You can type in the fields.";
}
