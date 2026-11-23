// A record's page sent from a link carries its first view as HTML: the record's heading and summary,
// drawn by GET /api/record-page before the app's script has arrived, so the page has its words at once.
// The server also writes the same words as JSON beside that view. The app reads them here before it
// draws, and a record still loading shows them under the same heading, so the heading and summary stay
// as they were when the app replaces the view (src/first-view.ts), and nothing reads them twice.
import {
  FIRST_VIEW_SUMMARY_MAX,
  FIRST_VIEW_TITLE_MAX,
  RECORD_FIRST_VIEW_ID,
  RECORD_FIRST_VIEW_PATH,
  type RecordFirstViewWords,
} from "@weave/api/record-first-view";

/** The words GET /api/record-page drew for one record's page. */
export type RecordFirstView = RecordFirstViewWords;

const words = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.length <= max ? value : undefined;

/** The server's JSON as the record's words, or nothing where it is not exactly what the server writes. */
export function parseRecordFirstView(text: string | null | undefined): RecordFirstView | undefined {
  if (!text) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  const title = words(o.title, FIRST_VIEW_TITLE_MAX)?.trim(),
    summary = words(o.summary, FIRST_VIEW_SUMMARY_MAX);
  if (typeof o.path !== "string" || !RECORD_FIRST_VIEW_PATH.test(o.path) || !title || summary === undefined) return undefined;
  if (o.program !== null && (typeof o.program !== "string" || !o.program)) return undefined;
  return { path: o.path, program: o.program, title, summary: summary.trim() };
}

/** The element the app's root may hold the JSON in. */
export interface RecordFirstViewRoot {
  querySelector(selectors: string): { readonly textContent: string | null } | null;
}

let drawn: RecordFirstView | undefined;

/** Keeps the words the server drew into the root, before the app's first draw replaces them. */
export function keepRecordFirstView(root: RecordFirstViewRoot): void {
  drawn = parseRecordFirstView(root.querySelector(`#${RECORD_FIRST_VIEW_ID}`)?.textContent);
}

/**
 * The words drawn for the record at this path and program, while that record loads. Another record,
 * or the same fund's other program, has none.
 */
export function recordFirstView(path: string, program: string | null = null): RecordFirstView | undefined {
  return drawn && drawn.path === path && drawn.program === program ? drawn : undefined;
}
