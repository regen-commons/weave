import { accountRequest, accountState, AccountFailure, invalidateAccountRequests, type AccountState } from "./client.ts";
import type { SessionEnding } from "./session-end.ts";
import { noPresence, type AccountPresence } from "./presence.ts";

export type SessionChange = "ended" | "changed";
export interface SessionConnection {
  publish(change: SessionChange): void;
  close(): void;
}
export type ConnectSession = (receive: (change: SessionChange) => void, resume: () => void) => SessionConnection;
export interface SessionTimers {
  set(run: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
  /** Milliseconds, for telling one return to the tab from the next. Defaults to the clock. */
  now?(): number;
}
const browserTimers: SessionTimers = {
  set: (run, milliseconds) => setTimeout(run, milliseconds),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
/** After a check that failed for a reason other than an ended session, such as being offline. */
const RETRY_SECONDS = 60;
/** A browser reports one return to a tab as focus and as visibility, a moment apart. */
const SAME_RETURN_MS = 1000;
/** The longest wait between tries while an account is hidden because it could not be checked. */
const RETRY_LIMIT_SECONDS = 900;

/** Account state belongs to the current browser session, never to device drafts or backups. */
export class AccountSession {
  private state: AccountState | null = null;
  private listeners = new Set<() => void>();
  private request: typeof accountRequest;
  private connection: SessionConnection | null = null;
  private revision = 0;
  private pending: AbortController | null = null;
  private timers: SessionTimers;
  private timer: unknown = null;
  /** Up to this many milliseconds are added to each check, so several tabs do not renew at the same instant. */
  private spread: () => number;
  /** The account last shown as signed in, so a state without one reads as an ending, not as a first check. */
  private holder: string | null = null;
  private ending: SessionEnding | null = null;
  /** The `/api/account` check under way, which a scheduled renewal or a confirmation joins rather than aborts. */
  private inflight: Promise<AccountState> | null = null;
  /** When the check under way started. */
  private inflightSince = 0;
  private now: () => number;
  /** The device's mark as this tab last saw it. */
  private mark: string | undefined;
  /** An account was hidden because its session could not be checked, and is tried again until a check answers. */
  private unverified = false;
  /** Seconds until the next of those tries. Each failure doubles it, up to the limit. */
  private retryIn = RETRY_SECONDS;
  private presence: AccountPresence;
  /** An account is expected, and the check that will say so has not answered yet. */
  private awaited: boolean;
  private initialCheck = true;
  constructor(request = accountRequest, timers = browserTimers, spread = () => Math.random() * 20000, presence = noPresence) {
    this.request = request;
    this.timers = timers;
    this.spread = spread;
    this.presence = presence;
    this.awaited = presence.read();
    this.now = timers.now ?? Date.now;
    this.mark = presence.mark();
  }
  getSnapshot = () => this.state;
  /**
   * True while the session is unknown and this device last saw an account signed in, or another tab
   * has just signed in. A page then holds its shape instead of offering sign-in. It ends with the
   * first answer, and with a check that fails, so sign-in is never withheld for want of a connection.
   */
  getExpected = () => this.state === null && this.awaited;
  /** The header holds its place until the initial or expected check has settled. */
  getChecking = () => this.state === null && (this.initialCheck || this.awaited);
  /** Why the last session ended, until the person signs in again or the note is acknowledged. */
  getEnding = () => this.ending;
  acknowledgeEnding = () => {
    if (this.ending === null) return;
    this.ending = null;
    this.notify();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify() {
    for (const listener of this.listeners) listener();
  }
  /** `ending` says why, when this state takes a signed-in account off the screen. Unknown (null) states keep the holder. */
  private update(state: AccountState | null, ending: SessionEnding = "ended") {
    if (state !== null) this.initialCheck = false;
    if (state?.user) {
      this.holder = state.user.id;
      this.ending = null;
      this.presence.write(true);
    } else if (state && this.holder !== null) {
      this.holder = null;
      // An account service that cannot answer has not signed anyone out.
      this.ending = state.available ? ending : null;
    }
    // Only an answer that nobody is signed in removes the note. An unknown state keeps it.
    if (state?.available && !state.user) this.presence.write(false);
    this.state = state;
    this.notify();
  }
  connect(connect: ConnectSession) {
    const connection = connect(change => {
      // This tab heard the change, so the mark it moved is no surprise on the next return.
      this.mark = this.presence.mark();
      if (change === "ended") this.end(false, "ended");
      else this.reconcile();
    }, () => this.resume());
    this.connection = connection;
    return () => {
      connection.close();
      if (this.connection === connection) {
        this.connection = null;
        this.invalidate();
      }
    };
  }
  /**
   * While a tab is connected, it checks the session again when the server asks, which lets the server renew
   * it before the hour runs out. A suspended tab misses the moment and reconciles on focus instead.
   */
  private schedule(seconds: number | undefined) {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
    if (!seconds || !this.connection) return;
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.join().catch(() => {});
    }, seconds * 1000 + this.spread());
  }
  private invalidate() {
    this.schedule(undefined);
    this.revision++;
    this.pending?.abort();
    this.pending = null;
    invalidateAccountRequests();
  }
  /** For the tabs a message will not reach, such as one that is suspended: they read the mark when they return. */
  private announce(change: SessionChange) {
    this.presence.move();
    this.mark = this.presence.mark();
    this.connection?.publish(change);
  }
  private end(publish: boolean, ending: SessionEnding) {
    this.invalidate();
    this.unverified = false;
    this.retryIn = RETRY_SECONDS;
    this.update({ available: true, fixture: false, ...this.state, user: null, items: [] }, ending);
    if (publish) this.announce("ended");
  }
  /** The session ended without this tab's Sign Out. The screen says so. */
  clear = () => this.end(true, "ended");
  /** This tab's Sign Out was confirmed, or found the session already ended. Its own message says so. */
  signedOut = () => this.end(true, "signed_out");
  /**
   * Joins the check under way, or starts one. Aborting a check can lose a renewal: once Supabase has
   * rotated the refresh token, a response that never arrives leaves the browser holding the spent one.
   */
  private join = () => this.inflight ?? this.refresh();
  /**
   * Another endpoint refused a request for want of a session. Asks `/api/account`, which renews it,
   * joining any check already under way, so refusals that arrive together share one and abort none.
   */
  confirm = (): Promise<AccountState> =>
    // A check superseded by a change in another tab is not an answer; the one that replaced it is.
    this.join().catch((error: unknown) =>
      error instanceof AccountFailure && error.code === "account_changed" ? this.join() : Promise.reject(error));
  /** The callback has established a new cookie. Other tabs must check it themselves. */
  changed() {
    this.invalidate();
    this.awaited = true;
    this.update(null);
    this.announce("changed");
  }
  /** Another tab finished a sign-in, so the account here may be someone else's: hide it, then check. */
  private reconcile() {
    this.invalidate();
    this.awaited = true;
    this.hide();
    void this.refresh().catch(() => {});
  }
  /**
   * Takes the account off the screen until a check answers. If one was on screen, the check is
   * tried again by itself, less often each time; a tab that showed nobody has nothing to bring back.
   */
  private hide() {
    this.unverified = this.holder !== null;
    this.update(null);
  }
  /**
   * The tab is back in view, or restored from the back-forward cache, and may have missed another
   * tab's change. The device's mark says whether any tab signed in or ended a session meanwhile.
   * If it moved, or cannot be read, the account is hidden first and then checked, as when the
   * change is heard directly. If it did not move, the session is checked and what is on screen
   * stays until the answer: a person who is still signed in sees nothing change, and requests
   * under way are not cancelled.
   */
  private resume() {
    const mark = this.presence.mark();
    if (mark === undefined || mark !== this.mark) {
      this.mark = mark;
      this.reconcile();
      return;
    }
    void this.verifyReturn();
  }
  /**
   * Only a check that started after the return can vouch for the account, so one that was already
   * under way is waited for, never aborted, and then asked again. A check an explicit one replaced
   * is followed to its replacement. An answer that the account changed or the session ended takes
   * effect as it does anywhere. A check that cannot be made fails closed: the account leaves the
   * screen until one succeeds, because nothing here can vouch for it after time away.
   */
  private async verifyReturn() {
    const connection = this.connection;
    const earlier = this.inflight;
    if (earlier && this.now() - this.inflightSince > SAME_RETURN_MS) await earlier.catch(() => {});
    for (;;) {
      // The page has gone. A change heard meanwhile rejects the check, and the next one answers for it.
      if (this.connection !== connection) return;
      try {
        await this.join();
        return;
      } catch (error) {
        if (error instanceof AccountFailure && error.code === "sign_in_required") return;
        // Replaced by another check: that one is under way or has answered, and the next turn asks it.
        if (!(error instanceof AccountFailure && error.code === "account_changed")) break;
      }
    }
    if (this.connection !== connection) return;
    // One return is reported twice and both reports share the failed check: hide and count it once.
    if (this.state === null && this.unverified) return;
    // Nothing is under way here, so nothing is aborted: the check has just failed.
    this.schedule(undefined);
    invalidateAccountRequests();
    this.hide();
    this.retryLater();
  }
  private retryLater() {
    if (!this.unverified) return;
    this.schedule(this.retryIn);
    this.retryIn = Math.min(this.retryIn * 2, RETRY_LIMIT_SECONDS);
  }
  /** Checks the session now, superseding any check under way. A change of account needs that; a renewal joins instead. */
  refresh = (): Promise<AccountState> => {
    const run = this.ask();
    this.inflight = run;
    this.inflightSince = this.now();
    const settle = () => { if (this.inflight === run) this.inflight = null; };
    run.then(settle, settle);
    return run;
  };
  private ask = async (): Promise<AccountState> => {
    const revision = ++this.revision;
    this.pending?.abort();
    const task = new AbortController();
    this.pending = task;
    const check = () => {
      if (revision !== this.revision || task.signal.aborted) throw new AccountFailure("account_changed");
    };
    try {
      const result = await this.request("", undefined, "/api/account", task.signal);
      check();
      const next = accountState(result);
      if (this.state?.user?.id !== next.user?.id) invalidateAccountRequests();
      this.awaited = false;
      this.unverified = false;
      this.retryIn = RETRY_SECONDS;
      this.update(next);
      this.schedule(next.user ? next.renewIn : undefined);
      return next;
    } catch (error) {
      check();
      // Without an answer, sign-in is offered again; the note on the device stays for the next visit.
      const checking = this.getChecking();
      this.initialCheck = false;
      this.awaited = false;
      if (error instanceof AccountFailure && error.code === "sign_in_required") this.clear();
      else if (this.state?.user) this.schedule(RETRY_SECONDS);
      // An account hidden for want of a check is tried again until one answers, less often each time.
      else this.retryLater();
      if (checking && this.state === null) this.notify();
      throw error;
    } finally {
      if (this.pending === task) this.pending = null;
    }
  };
}
