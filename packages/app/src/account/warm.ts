import { accountRequest } from "./client.ts";

/** A function instance and the bridge stay warm for some minutes. Asking more often only adds requests. */
const WARM_EVERY_MS = 4 * 60_000;

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
  return (): void => {
    if (now() - last < WARM_EVERY_MS) return;
    last = now();
    void request({ warm: true }).catch(() => {
      // Nothing was readied, so the next sight of Sign In may ask again.
      last = Number.NEGATIVE_INFINITY;
    });
  };
}

/** One for the page, shared by every Sign In button on it. */
export const warmSignIn = createSignInWarmer();
