// What the feedback sheet and the server agree on. Weave's feedback goes to the same place as the
// Regen Commons website's: the website's own /api/feedback, which keeps it private for the stewards'
// desk (the owner's request of 24 November 2026). So the categories and limits here are the website's
// (`feedback-contract.js` in regen-commons/website), and a change there needs the same change here.

export const FEEDBACK = {
  path: "/api/feedback",
  /** The website endpoint Weave's server posts to. Fixed: no request or setting can point it elsewhere. */
  upstream: "https://regencommons.com/api/feedback",
  /** The website form, for when Weave cannot pass feedback on. */
  websiteForm: "https://regencommons.com/feedback",
  /** Where a Weave page's address starts in the stewards' desk, so they can tell it from the website's pages. */
  pathPrefix: "/weave",
  minLength: 3,
  maxLength: 5000,
  /** The largest body the server reads, as the website's limit. */
  maxBytes: 32_768,
  /** The longest page address the website keeps. */
  maxPathLength: 500,
  /** Empty in a person's browser. A form filler that fills every field fills it, and its post goes nowhere. */
  honeypot: "website_confirm",
} as const;

export const FEEDBACK_CATEGORIES = [
  "Bug",
  "Idea",
  "Technical suggestion",
  "Feature request",
  "Security consideration",
  "Other",
  "Fine Tuning",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** What the website stores: the message, its categories and the page it was sent from. */
export interface Feedback {
  readonly message: string;
  readonly categories: readonly FeedbackCategory[];
  readonly page_path: string;
}

/** Why feedback was not passed on. Stable codes: the sheet chooses its words from them. */
export type FeedbackFailure =
  | "method_not_allowed"
  | "origin_required"
  | "json_required"
  | "body_too_large"
  | "request_timeout"
  | "invalid_feedback"
  | "invalid_request_id"
  /** Too many from this connection, here or at the website. */
  | "rate_limited"
  /** The website did not confirm it kept the feedback. */
  | "feedback_unavailable";

/** The website's rule for a page address: one leading slash, then no space, query, fragment or backslash. */
const PAGE_PATH = /^\/(?!\/)[^\s?#\\]*$/u;
/**
 * What the website's database cannot store in JSON: a NUL character, or half of a surrogate pair. With the
 * `u` flag a whole pair is one character outside this range, so only a broken one matches.
 */
const UNSTORABLE = /[\u0000\uD800-\uDFFF]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const isRequestId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** A Weave page's address as the stewards' desk keeps it: `/weave` and the page's own path. */
export function weavePagePath(pathname: string): string | null {
  if (!PAGE_PATH.test(pathname)) return null;
  const path = `${FEEDBACK.pathPrefix}${pathname === "/" ? "" : pathname}`;
  return path.length <= FEEDBACK.maxPathLength ? path : null;
}

/**
 * The feedback a body holds, ready for the website, or null when the website would refuse it. The page
 * address is the Weave page's own (`/funding`), and this adds `/weave`, so a post through Weave can
 * only ever name a Weave page. The message is trimmed and the categories lose repeats, as the website does.
 */
export function feedbackFrom(input: unknown): Feedback | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { message, categories, page_path: pathname } = input as Record<string, unknown>;
  if (typeof message !== "string" || UNSTORABLE.test(message)) return null;
  const text = message.trim();
  if (text.length < FEEDBACK.minLength || text.length > FEEDBACK.maxLength) return null;
  if (!Array.isArray(categories) || categories.length > FEEDBACK_CATEGORIES.length) return null;
  if (!categories.every((value): value is FeedbackCategory => (FEEDBACK_CATEGORIES as readonly unknown[]).includes(value))) return null;
  if (typeof pathname !== "string") return null;
  const page = weavePagePath(pathname);
  if (!page) return null;
  return { message: text, categories: [...new Set(categories)], page_path: page };
}

/** The server's answer, read from outside. Anything unexpected counts as not kept. */
export function parseFeedbackAnswer(status: number, body: unknown): { ok: true } | { ok: false; error: FeedbackFailure } {
  if (status === 200 && body && typeof body === "object" && (body as { ok?: unknown }).ok === true) return { ok: true };
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  const known: readonly FeedbackFailure[] = [
    "method_not_allowed", "origin_required", "json_required", "body_too_large", "request_timeout",
    "invalid_feedback", "invalid_request_id", "rate_limited", "feedback_unavailable",
  ];
  return { ok: false, error: known.includes(error as FeedbackFailure) ? (error as FeedbackFailure) : "feedback_unavailable" };
}
