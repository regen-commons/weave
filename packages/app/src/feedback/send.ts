// Sending feedback from the feedback sheet. It goes to Weave's own /api/feedback, which passes it to the
// Regen Commons website's, so it reaches the stewards' desk with the website's feedback. What it sends is
// the message, the kinds of feedback picked and the page's own address, never its query: a query can hold
// a search a person typed.
import {
  FEEDBACK,
  FEEDBACK_CATEGORIES,
  parseFeedbackAnswer,
  weavePagePath,
  type FeedbackCategory,
  type FeedbackFailure,
} from "@weave/api/feedback-contract";

export { FEEDBACK, FEEDBACK_CATEGORIES, weavePagePath, type FeedbackCategory };

/** How each kind reads on its chip: in sentence case, as chips are. The value sent is the website's own. */
export const CATEGORY_LABELS: Readonly<Record<FeedbackCategory, string>> = {
  Bug: "Bug",
  Idea: "Idea",
  "Technical suggestion": "Technical suggestion",
  "Feature request": "Feature request",
  "Security consideration": "Security consideration",
  Other: "Other",
  "Fine Tuning": "Fine tuning",
};

/** What a person writes, checked as the server checks it. */
export function messageProblem(message: string): string | null {
  const length = message.trim().length;
  if (length < FEEDBACK.minLength) return "Write at least 3 characters.";
  if (length > FEEDBACK.maxLength) return `Shorten it to 5,000 characters. It is ${length.toLocaleString("en")} now.`;
  return null;
}

export interface FeedbackDraft {
  readonly message: string;
  readonly categories: readonly FeedbackCategory[];
  /** The page's own path, such as `/funding`. */
  readonly pathname: string;
  /** The hidden field a person never sees. Sent as it is, so the server can drop a form filler's post. */
  readonly honeypot: string;
}

export type SendOutcome = { ok: true } | { ok: false; reason: FeedbackFailure | "offline" };

/** The body the sheet posts: in the website's order, with the categories in the sheet's order. */
export function feedbackBody(draft: FeedbackDraft): string {
  const categories = FEEDBACK_CATEGORIES.filter((category) => draft.categories.includes(category));
  return JSON.stringify({ message: draft.message, categories, page_path: draft.pathname, [FEEDBACK.honeypot]: draft.honeypot });
}

/**
 * Posts feedback once. The request key stays the same for a retry of the same words, so the website keeps
 * one copy however many times a person presses Send while an answer is lost.
 */
export async function sendFeedback(
  body: string,
  requestId: string,
  { fetcher = fetch, timeoutMs = 20_000 }: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetcher(FEEDBACK.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
      body,
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }
  let answer: unknown = null;
  try {
    answer = await response.json();
  } catch {
    answer = null;
  }
  const parsed = parseFeedbackAnswer(response.status, answer);
  return parsed.ok ? { ok: true } : { ok: false, reason: parsed.error };
}

/** What the sheet says when feedback did not go: what happened, that the words are still there, and what to do. */
export function failureText(reason: FeedbackFailure | "offline"): string {
  if (reason === "rate_limited")
    return "Too much feedback has come from this connection in the last hour. Your words are still here. Send them later, or use the form on the Regen Commons website.";
  if (reason === "invalid_feedback")
    return "This could not be sent as it is. Check it has 3 to 5,000 characters, with no unusual symbols, and send again.";
  if (reason === "offline")
    return "Weave could not be reached. Your words are still here. Check your connection and send again.";
  return "We could not confirm your feedback was sent. Your words are still here. Send again in a minute, or use the form on the Regen Commons website.";
}

/** The website's own feedback form, with this page named, for when Weave cannot pass feedback on. */
export function websiteFormHref(pathname: string): string {
  const page = weavePagePath(pathname) ?? FEEDBACK.pathPrefix;
  return `${FEEDBACK.websiteForm}?from=${encodeURIComponent(page)}`;
}
