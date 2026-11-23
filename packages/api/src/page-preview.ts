// What a shared Weave link shows before anyone opens it (DL-068): a title, a sentence and a picture,
// written into the head of the app's own HTML. The services that draw link previews (Telegram, WhatsApp,
// Slack, X, LinkedIn) read the HTML they are sent and run none of the app, so each address that has a
// preview of its own gets a copy of the page with its words in the head. The build writes one for each
// section, and GET /api/record-page writes one for each fund and initiative (22 November 2026).
// Shared by the app's build and the API, so both write the same tags.

/** Weave's public address. A preview gives its page and its picture as full addresses on it. */
export const PUBLIC_ORIGIN = "https://weave.regencommons.com";

/** One page's preview, with full addresses for the page and its picture. */
export interface PagePreview {
  readonly title: string;
  readonly description: string;
  /** The page's own address, as people share it. */
  readonly url: string;
  /** A 1200 x 630 PNG, the size every preview service draws large. */
  readonly image: string;
  /** What the picture shows, for people who cannot see it. */
  readonly imageAlt: string;
}

export const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * The head tags a preview is read from. Open Graph first, which Telegram, WhatsApp, Slack and Facebook
 * read; then the same words and picture as Twitter cards, which X reads and which Telegram's reader (it
 * names itself "like TwitterBot") falls back to. The picture's type and size are given, so a reader can
 * draw the large card before it has fetched the picture.
 */
export function previewTags(preview: PagePreview): string[] {
  const meta = (key: "property" | "name", name: string, content: string) =>
    `<meta ${key}="${name}" content="${escapeHtml(content)}">`;
  return [
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "Weave"),
    meta("property", "og:title", preview.title),
    meta("property", "og:description", preview.description),
    meta("property", "og:url", preview.url),
    meta("property", "og:image", preview.image),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", preview.imageAlt),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", preview.title),
    meta("name", "twitter:description", preview.description),
    meta("name", "twitter:image", preview.image),
    meta("name", "twitter:image:alt", preview.imageAlt),
  ];
}

/** The tags `previewTags` writes, by their attribute and name, and nothing else a page might carry. */
const WRITTEN = previewTags({ title: "", description: "", url: "", image: "", imageAlt: "" })
  .map((tag) => /^<meta ((?:property|name)="[^"]+")/u.exec(tag)![1]!);
/** A line of the head that is one of those tags, whichever page's preview it carries. */
const PREVIEW_LINE = new RegExp(`^[ \\t]*<meta (?:${WRITTEN.join("|")}) content="[^"]*">[ \\t]*\\r?\\n`, "gmu");

/**
 * The app's HTML with one page's words in its head: the title and description a browser tab and a search
 * result show, and the preview tags straight after the description, ahead of the scripts, styles and
 * fonts, so a reader that stops early still finds them. Any preview the page already had is taken out
 * first, each tag on its own line as this writes them, so a section's or a record's copy can be made from
 * the built page with Home's preview in it. The page must have exactly one title and one description,
 * or it is not the page this was written for, and it is refused rather than half changed.
 */
export function withPagePreview(html: string, preview: PagePreview): string {
  const page = html.replace(PREVIEW_LINE, "");
  const titled = replaceOnce(page, /<title>[^<]*<\/title>/g, () => `<title>${escapeHtml(preview.title)}</title>`);
  return replaceOnce(titled, /^([ \t]*)<meta name="description" content="[^"]*">$/gm, (indent) =>
    [`<meta name="description" content="${escapeHtml(preview.description)}">`, ...previewTags(preview)]
      .map((tag) => indent + tag)
      .join("\n"));
}

/** Replaces the one match of `pattern`, given its first group, or refuses a page with none or several. */
function replaceOnce(page: string, pattern: RegExp, replacement: (first: string) => string): string {
  const found = page.match(pattern)?.length ?? 0;
  if (found !== 1) throw new Error(`Expected one match for ${pattern} in index.html, found ${found}.`);
  return page.replace(pattern, (_match, first: unknown) => replacement(typeof first === "string" ? first : ""));
}

/** The longest description a preview carries before it is cut at a word. */
export const DESCRIPTION_MAX = 160;

/** Words in one short line for a preview: spaces made single and cut at a word where they run long. */
export function previewLine(text: string, max = DESCRIPTION_MAX): string {
  const words = text.replace(/\s+/gu, " ").trim();
  if (words.length <= max) return words;
  const cut = words.slice(0, max - 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > max / 2 ? cut.slice(0, end) : cut).replace(/[\s,.;:]+$/u, "")}…`;
}
