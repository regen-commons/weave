// GET /api/record-page: the app's HTML for one fund or initiative, with that record's words in its head,
// so a link to it shows the record in Telegram, WhatsApp, X and the rest (22 November 2026). Vercel
// rewrites /funding/:id and /initiatives/:id here; every other address is served as before. The page is
// the app's own index.html, so a person who follows the link gets the app as from any other address.
import { parseProjectUri } from "./project-uri.ts";
import { DESCRIPTION_MAX, previewLine, PUBLIC_ORIGIN, withPagePreview, type PagePreview, type RecordHead } from "./page-preview.ts";
import { projectPassages, projectUriOf, type PublicProjectCard } from "./public-projects-contract.ts";

/** What the build writes beside index.html for this handler: the two sections' previews and each fund's words. */
export interface RecordPreviews {
  readonly sections: { readonly funding: PagePreview; readonly initiatives: PagePreview };
  /** The public pages a sitemap lists besides the records, as full addresses. */
  readonly pages: readonly string[];
  readonly funds: Readonly<Record<string, FundWords>>;
}
export interface FundWords {
  readonly name: string;
  readonly description: string;
  /** The fund's programs in the catalog's order: a fund's address without one opens the first, as the app does. */
  readonly programs: readonly { readonly id: string; readonly name: string }[];
}

export const RECORD_PREVIEWS_FILE = "share/records.json";

const FUND_ID = /^[A-Za-z0-9_-]{1,100}$/u;
const PROGRAM_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const NAME_MAX = 300;
const TEXT_MAX = 4000;

const fail = (): never => { throw Error("invalid_record_previews"); };
const text = (value: unknown, max: number): string =>
  typeof value === "string" && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value.replace(/[\n\t]/gu, " ")) ? value : fail();
/** A full address on Weave's public site, or a refusal. */
function address(field: unknown): string {
  let url: URL;
  try { url = new URL(text(field, 2048)); } catch { return fail(); }
  return url.origin === PUBLIC_ORIGIN && !url.username && !url.password ? url.href : fail();
}
function pagePreview(value: unknown): PagePreview {
  if (!value || typeof value !== "object") return fail();
  const o = value as Record<string, unknown>;
  return {
    title: text(o.title, NAME_MAX), description: text(o.description, TEXT_MAX),
    url: address(o.url), image: address(o.image), imageAlt: text(o.imageAlt, NAME_MAX),
  };
}

/** Reads the build's file, refusing anything not exactly as the build writes it. */
export function parseRecordPreviews(value: unknown): RecordPreviews {
  if (!value || typeof value !== "object") return fail();
  const o = value as Record<string, unknown>;
  const sections = o.sections && typeof o.sections === "object" ? o.sections as Record<string, unknown> : fail();
  const funds: Record<string, FundWords> = Object.create(null);
  if (!o.funds || typeof o.funds !== "object") return fail();
  for (const [id, fund] of Object.entries(o.funds as Record<string, unknown>)) {
    if (!FUND_ID.test(id) || !fund || typeof fund !== "object") return fail();
    const f = fund as Record<string, unknown>;
    if (!Array.isArray(f.programs)) return fail();
    const programs = f.programs.map((program: unknown) => {
      const o = program && typeof program === "object" ? program as Record<string, unknown> : fail();
      return { id: typeof o.id === "string" && PROGRAM_ID.test(o.id) ? o.id : fail(), name: text(o.name, NAME_MAX) };
    });
    if (new Set(programs.map(({ id }) => id)).size !== programs.length) return fail();
    // A fund may have no description yet, but what it has must be words.
    const description = typeof f.description === "string" ? f.description.slice(0, TEXT_MAX) : fail();
    funds[id] = { name: text(f.name, NAME_MAX), description, programs };
  }
  if (!Array.isArray(o.pages)) return fail();
  const pages = o.pages.map((page: unknown) => address(page));
  return { sections: { funding: pagePreview(sections.funding), initiatives: pagePreview(sections.initiatives) }, pages, funds };
}

/** The record an address asks for, or null where the address names none the app could open. */
export type RecordAsk =
  | { kind: "funding"; id: string; program: string | null }
  | { kind: "initiative"; id: string; uri: string };

export function recordAsk(url: URL): RecordAsk | null {
  // The rewrite adds `kind` and `id` to the address's own query. One given twice could make the preview
  // show another record than the app opens, so it names none.
  if (url.searchParams.getAll("kind").length !== 1 || url.searchParams.getAll("id").length !== 1) return null;
  const kind = url.searchParams.get("kind"), id = url.searchParams.get("id") ?? "";
  if (kind === "funding" && FUND_ID.test(id)) {
    // A program the app could not open is no record, as in the app, never the fund in its place.
    const program = url.searchParams.getAll("program");
    if (program.length > 1 || (program[0] !== undefined && !PROGRAM_ID.test(program[0]))) return null;
    return { kind, id, program: program[0] ?? null };
  }
  if (kind === "initiative") {
    const uri = projectUriOf(id);
    if (uri) return { kind, id, uri: parseProjectUri(uri).uri };
  }
  return null;
}

const title = (name: string) => `${name.replace(/\s+/gu, " ").trim()} | Weave`;

/** A fund's or one program's one address on the public site. */
export const fundAddress = (fund: string, program: string | null): string =>
  `${PUBLIC_ORIGIN}/funding/${fund}${program ? `?program=${encodeURIComponent(program)}` : ""}`;

/** An initiative's one address on the public site. */
export const initiativeAddress = (slug: string): string => `${PUBLIC_ORIGIN}/initiatives/${slug}`;

/** A record's page: its preview, and what search engines read about it (its canonical address and JSON-LD). */
export interface RecordPage {
  readonly preview: PagePreview;
  readonly head: RecordHead;
}

/** The longest description the JSON-LD carries, cut at a word. */
const ABOUT_MAX = 500;
const WEBSITE = { "@type": "WebSite", name: "Weave", url: `${PUBLIC_ORIGIN}/` } as const;

/** The page that is about one thing, with its own address: the frame every record's JSON-LD shares. */
function webPage(name: string, preview: PagePreview, about: Record<string, unknown>): RecordHead {
  return {
    canonical: preview.url,
    structuredData: {
      "@context": "https://schema.org", "@type": "WebPage", url: preview.url, name, description: preview.description,
      isPartOf: WEBSITE, about,
    },
  };
}

/**
 * A fund's page, or one program's: its name, then its own words, at its public address. Its JSON-LD names
 * the fund or the program as a FundingScheme, with the fund as the program's organization, and nothing
 * about who may apply.
 */
export function fundPage(previews: RecordPreviews, ask: Extract<RecordAsk, { kind: "funding" }>): RecordPage | null {
  const fund = previews.funds[ask.id];
  if (!fund) return null;
  // As the app: a named program must be one of the fund's, and no program means the fund's first.
  const entry = ask.program ? fund.programs.find(({ id }) => id === ask.program) : fund.programs[0];
  if (ask.program && !entry) return null;
  const program = entry?.name;
  const name = (program ?? fund.name).replace(/\s+/gu, " ").trim();
  const words = fund.description.trim() || `Funding for regenerative work from ${fund.name}.`;
  const preview: PagePreview = {
    ...previews.sections.funding,
    title: title(name),
    description: previewLine(program && program !== fund.name ? `${fund.name}: ${words}` : words, DESCRIPTION_MAX),
    url: fundAddress(ask.id, entry?.id ?? null),
  };
  return {
    preview,
    head: webPage(name, preview, {
      "@type": "FundingScheme", name,
      ...(fund.description.trim() ? { description: previewLine(fund.description, ABOUT_MAX) } : {}),
      ...(program && program !== fund.name ? { parentOrganization: { "@type": "Organization", name: fund.name } } : {}),
    }),
  };
}

/** A public initiative's page: its name, its own words said once, and, where its publisher gave one, its place. */
export function initiativePage(previews: RecordPreviews, ask: Extract<RecordAsk, { kind: "initiative" }>, card: PublicProjectCard): RecordPage {
  const name = card.name.replace(/\s+/gu, " ").trim();
  const passages = projectPassages(card).join(" ");
  const preview: PagePreview = {
    ...previews.sections.initiatives,
    title: title(name),
    description: previewLine(passages || (card.publisher ? `Shared on Certified by ${card.publisher}.` : "Shared on Certified."), DESCRIPTION_MAX),
    url: initiativeAddress(ask.id),
  };
  return {
    preview,
    head: webPage(name, preview, {
      "@type": "Project", name,
      ...(passages ? { description: previewLine(passages, ABOUT_MAX) } : {}),
      ...(card.place ? { location: card.place } : {}),
    }),
  };
}

/** The CDN keeps a record's page for five minutes, and may serve it for ten more while it refreshes. */
const CACHED = { "Cache-Control": "public, max-age=0, must-revalidate", "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
const NOT_CACHED = { "Cache-Control": "no-store" };

function page(status: number, html: string, cache: Record<string, string>): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", ...cache } });
}

/** The page with a preview in its head, or as it came, uncached, when its head is not the one expected. */
function withPreview(status: number, html: string, preview: PagePreview, cache: Record<string, string>, head?: RecordHead): Response {
  try { return page(status, withPagePreview(html, preview, head), cache); }
  catch { return page(status, html, NOT_CACHED); }
}

/** How long a project's lookup may take before the page goes out with its section's preview. */
export const LOOKUP_TIMEOUT_MS = 2000;

/** A lookup that has not answered by the deadline is treated as failed; the page does not wait on it. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("lookup_timeout")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Serves one record's page, to GET and to HEAD, which some link checkers send first. A record found gets
 * its own preview. An address that names no record the app could open, a fund not in this build's
 * catalog, or a project the list does not show (withdrawn, never listed, the list off) gets its section's
 * preview with 404, and the app says it is not available. A lookup that fails or takes longer than
 * `LOOKUP_TIMEOUT_MS` gets the section's preview with 200, uncached, so the next request tries again. A
 * deployment whose index.html cannot be read sends the person to the record's list.
 */
export function createRecordPageHandler(options: {
  /** The app's built index.html. */
  template(request: Request): Promise<string>;
  /** The build's record previews. */
  previews(request: Request): Promise<RecordPreviews>;
  /** A public project's card, null when the list does not show it. Rejects when the list cannot be read. */
  project(uri: string): Promise<PublicProjectCard | null>;
  lookupTimeoutMs?: number;
}) {
  const lookupTimeoutMs = options.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  async function respond(request: Request): Promise<Response> {
    const ask = recordAsk(new URL(request.url));
    let html: string;
    try { html = await options.template(request); }
    // Without the app's page there is nothing to send, so the person goes to the record's list, a file
    // of its own that no rewrite sends back here, rather than to an error.
    catch { return new Response(null, { status: 307, headers: { Location: ask?.kind === "initiative" ? "/initiatives" : "/funding", ...NOT_CACHED } }); }
    let previews: RecordPreviews;
    try { previews = await options.previews(request); }
    catch { return page(ask ? 200 : 404, html, NOT_CACHED); }
    if (!ask) return page(404, html, CACHED);
    if (ask.kind === "funding") {
      const record = fundPage(previews, ask);
      return record ? withPreview(200, html, record.preview, CACHED, record.head) : withPreview(404, html, previews.sections.funding, CACHED);
    }
    let card: PublicProjectCard | null;
    try { card = await withDeadline(options.project(ask.uri), lookupTimeoutMs); }
    catch { return withPreview(200, html, previews.sections.initiatives, NOT_CACHED); }
    const record = card && initiativePage(previews, ask, card);
    return record
      ? withPreview(200, html, record.preview, CACHED, record.head)
      : withPreview(404, html, previews.sections.initiatives, CACHED);
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", ...NOT_CACHED } });
    const response = await respond(request);
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };
}
