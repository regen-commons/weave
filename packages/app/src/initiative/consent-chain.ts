/**
 * Sign-in and project access are two permissions at Certified, held by two clients, so they cannot
 * be one Certified screen. Weave goes straight on from the first to the second after every sign-in
 * but one that began at Save, which returns to its card instead (the user's choice, 25 November 2026,
 * DL-137; until then only Your Initiatives did). This is the note that carries that intent across the
 * trip to Certified.
 *
 * It is kept for the tab only, names nobody and grants nothing: it holds when it stops counting and
 * the page the sign-in left from. Certified still decides: it asks, or approves a read the person
 * already allowed, and a no there leaves the person signed in with no project access, as before.
 */
const KEY = "weave-sign-in-then-projects";
/** Long enough for a sign-in at Certified; a note older than this is not acted on. */
const KEPT_MS = 10 * 60_000;
/** A page's own path: one leading slash, no query, fragment, space or backslash. */
const PAGE = /^\/(?!\/)[^?#\s\\]{0,200}$/u;
export const isPagePath = (value: unknown): value is string => typeof value === "string" && PAGE.test(value);

type Kept = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The person pressed a Sign In on `page`, and project access comes next. */
export function expectProjectAccess(storage: () => Kept, page: string, now: () => number = Date.now): void {
  if (!isPagePath(page)) return forgetProjectAccess(storage);
  try { storage().setItem(KEY, JSON.stringify({ until: now() + KEPT_MS, page })); }
  catch { /* Without it the person presses Allow themselves. */ }
}

/** The sign-in did not start, or began at Save, so nothing follows it. */
export function forgetProjectAccess(storage: () => Kept): void {
  try { storage().removeItem(KEY); } catch { /* Nothing was kept. */ }
}

/**
 * Whether this page load is the return from such a sign-in, and it finished. The note is used once:
 * reading it removes it, so a reload or a later sign-in never repeats the trip. A sign-in that was
 * cancelled, failed or expired removes it too, and so does a return to any page but the one it left
 * from (`here`).
 */
export function takeProjectAccess(storage: () => Kept, signInResult: string | null, here: string, now: () => number = Date.now): boolean {
  let note: unknown;
  try {
    const kept = storage();
    const raw = kept.getItem(KEY);
    kept.removeItem(KEY);
    note = raw === null ? null : JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof note !== "object" || note === null) return false;
  const { until, page } = note as { until?: unknown; page?: unknown };
  return signInResult === "signed-in" && isPagePath(page) && page === here &&
    typeof until === "number" && Number.isSafeInteger(until) && until > now() && until <= now() + KEPT_MS;
}

/**
 * The trip itself, once the person is signed in and the device's drafts are read: wait for device
 * writes to finish, refuse to leave while the latest words are not stored, then ask the server for
 * Certified's address for the read-only permission. The same order as a pressed Allow. It returns
 * the address to go to, or throws, and the page then shows the Allow button as before.
 */
export async function projectAccessAddress(device: {
  settled(): Promise<void>;
  /** The device store's state once writes have settled. */
  storage(): string;
  /** Starts the read-only permission and returns Certified's checked address. */
  start(): Promise<string>;
}): Promise<string> {
  await device.settled();
  if (!["saved", "none"].includes(device.storage())) throw new Error("device_storage_unsettled");
  return device.start();
}

interface TripTimers {
  set(run: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
/** Longer than the session check's own limit. A trip that cannot begin by then is given up. */
const TRIP_LIMIT_MS = 20_000;

/**
 * One trip to Certified's project permission for one page load, and never a second. It waits until
 * the page knows who is signed in and the device's drafts are read, starts once, and is over as soon
 * as the start settles, whichever way. It is also over when nobody turns out to be signed in, and
 * when it could not begin in time, so a session check that fails or a store that never opens cannot
 * hold the page in its loading shape. The address is used only if the page is still on screen when
 * it arrives: a person who has moved on is not taken to Certified, and the address is dropped.
 * While the browser is leaving for Certified the page keeps its loading shape, so the Allow button
 * cannot be pressed beside a trip already under way. That ends when the person comes back to the
 * page with the browser's Back, or after the same limit if the browser never left.
 */
export class ProjectAccessTrip {
  private phase: "wanted" | "under-way" | "leaving" | "over";
  private listeners = new Set<() => void>();
  private pages = 0;
  private deadline: unknown = null;
  private go: (address: string) => void;
  private timers: TripTimers;
  private stillHere: () => boolean;
  constructor(
    wanted: boolean,
    go: (address: string) => void,
    timers: TripTimers = { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
    /** Whether the person is still on the page the sign-in returned to. */
    stillHere: () => boolean = () => true,
  ) {
    this.phase = wanted ? "wanted" : "over";
    this.go = go;
    this.timers = timers;
    this.stillHere = stillHere;
  }
  /** True while the page should hold its loading shape for the trip. */
  pending = (): boolean => this.phase !== "over";
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  /** The page that shows the trip is on screen. Returns what to call when it leaves. */
  attend = (): (() => void) => {
    this.pages++;
    if (this.phase === "wanted" && this.deadline === null)
      this.deadline = this.timers.set(() => { if (this.phase === "wanted") this.end(); }, TRIP_LIMIT_MS);
    return () => { this.pages--; };
  };
  /** What the page knows now. The trip starts the first time all of it is known, and only then. */
  update(known: { answered: boolean; signedIn: boolean; ready: boolean }, start: () => Promise<string>): void {
    if (this.phase !== "wanted" || !known.answered) return;
    if (!known.signedIn) return this.end();
    if (!known.ready) return;
    this.phase = "under-way";
    start().then(
      (address) => {
        if (this.pages === 0 || !this.stillHere()) return this.end();
        this.phase = "leaving";
        if (this.deadline !== null) this.timers.clear(this.deadline);
        this.deadline = this.timers.set(() => this.end(), TRIP_LIMIT_MS);
        this.go(address);
      },
      () => this.end(),
    );
  }
  /** The page is shown again from the browser's back-forward cache, after the trip left for Certified. */
  returned = (): void => {
    if (this.phase === "leaving") this.end();
  };
  private end(): void {
    if (this.phase === "over") return;
    this.phase = "over";
    if (this.deadline !== null) this.timers.clear(this.deadline);
    this.deadline = null;
    for (const listener of this.listeners) listener();
  }
}
