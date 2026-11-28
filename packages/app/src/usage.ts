type SearchArea = "funding" | "initiative";
type SearchOutcome = "results" | "empty" | "unavailable";
export type UsageAttempt = { id: string; expiresAt: number; lastEventAt: number };

const attemptLifetime = 30 * 60_000;
const signInAttemptKey = "weave.usage.sign-in";

function usageEnabled(): boolean {
  return typeof window !== "undefined" && typeof import.meta.env !== "undefined" &&
    import.meta.env.MODE !== "prototype" && import.meta.env.VITE_WEAVE_USAGE_ENABLED === "true" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl !== true;
}

export function reportUsage(attempt: UsageAttempt | undefined, event: string): void {
  if (!usageEnabled() || !attempt || Date.now() >= attempt.expiresAt) return;
  // A request may arrive out of order, especially when leaving the page to sign in.
  attempt.lastEventAt = Math.max(Date.now(), attempt.lastEventAt + 1);
  void fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([event, attempt.id, attempt.lastEventAt]),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

export function beginUsage(event: string): UsageAttempt | undefined {
  if (!usageEnabled() || typeof globalThis.crypto?.randomUUID !== "function") return;
  const attempt = { id: crypto.randomUUID(), expiresAt: Date.now() + attemptLifetime, lastEventAt: 0 };
  reportUsage(attempt, event);
  return attempt;
}

/** Remember only the random ID and its expiry so the same tab can report the return from Certified. */
export function rememberSignInUsage(attempt: UsageAttempt | undefined): void {
  if (!attempt) return;
  try { window.sessionStorage.setItem(signInAttemptKey, JSON.stringify(attempt)); }
  catch { /* Sign-in works when tab storage is unavailable. */ }
}

export function takeSignInUsage(expectedId?: string): UsageAttempt | undefined {
  try {
    const stored = window.sessionStorage.getItem(signInAttemptKey);
    if (!stored) return;
    const value = JSON.parse(stored) as Partial<UsageAttempt> | null;
    if (expectedId && value?.id !== expectedId) return;
    window.sessionStorage.removeItem(signInAttemptKey);
    if (!usageEnabled()) return;
    if (value && typeof value.id === "string" && /^[0-9a-f-]{36}$/u.test(value.id) &&
        typeof value.expiresAt === "number" && typeof value.lastEventAt === "number")
      return { id: value.id, expiresAt: value.expiresAt, lastEventAt: value.lastEventAt };
  } catch { /* Missing or invalid storage leaves the return unmeasured. */ }
}

export function beginSearchUsage(area: SearchArea) {
  const attempt = beginUsage(`${area}-search-started`);
  return (outcome: SearchOutcome) => reportUsage(attempt, `${area}-search-${outcome}`);
}
