import { accountRequest } from "./client.ts";

/** A function instance and the bridge stay warm for some minutes. Asking more often only adds requests. */
const WARM_EVERY_MS = 4 * 60_000;
/**
 * What the warm-up readies at Certified, a DPoP nonce, is kept for a minute. A pointer or keyboard that
 * reaches Sign In asks again once this long has passed, so the press that follows finds it fresh.
 */
const INTENT_EVERY_MS = 45_000;

/**
 * Readies sign-in before it is pressed. The first press after a quiet spell used to wait several
 * seconds while the sign-in function and the identity bridge started up. A page that shows Sign In
 * to someone signed out asks the server to start both, so the press goes straight to Certified.
 * The request names no one and starts no sign-in, and its failure is silent: pressing Sign In works
 * the same without it. A tab asks at most once in four minutes.
 */
export function createSignInWarmer(
  request: (body: unknown) => Promise<unknown> = (body) => accountRequest("", body, "/api/sign-in"),
  now: () => number = Date.now,
) {
  let last = Number.NEGATIVE_INFINITY;
  const after = (every: number) => (): void => {
    if (now() - last < every) return;
    last = now();
    void request({ warm: true }).catch(() => {
      // Nothing was readied, so the next sight of Sign In may ask again.
      last = Number.NEGATIVE_INFINITY;
    });
  };
  /** `sight` for Sign In coming into view; `intent` for a pointer or keyboard reaching it. */
  return { sight: after(WARM_EVERY_MS), intent: after(INTENT_EVERY_MS) };
}

/** One for the page, shared by every Sign In button on it. */
const signInWarmer = createSignInWarmer();
export const warmSignIn = signInWarmer.sight;
export const warmSignInOnIntent = signInWarmer.intent;

/**
 * Readies project access the same way. Signing in goes straight on to Certified's permission screen
 * for the account's projects, and that start waited over a second for its own function after a quiet
 * spell, before the page could leave for Certified. A Sign In on screen asks this function to start
 * too, so by the time the person is back from signing in it is ready. The request starts no consent.
 */
export const warmProjectConsent = createSignInWarmer((body) => accountRequest("", body, "/api/certified-project-consent")).sight;
