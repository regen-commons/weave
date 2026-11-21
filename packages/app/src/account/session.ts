import { accountRequest, accountState, AccountFailure, invalidateAccountRequests, type AccountState } from "./client.ts";
import type { SessionEnding } from "./session-end.ts";

export type SessionChange = "ended" | "changed";
export interface SessionConnection {
  publish(change: SessionChange): void;
  close(): void;
}
export type ConnectSession = (receive: (change: SessionChange) => void, resume: () => void) => SessionConnection;
export interface SessionTimers {
  set(run: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
const browserTimers: SessionTimers = {
  set: (run, milliseconds) => setTimeout(run, milliseconds),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
/** After a check that failed for a reason other than an ended session, such as being offline. */
const RETRY_SECONDS = 60;

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
  private confirming: Promise<AccountState> | null = null;
  constructor(request = accountRequest, timers = browserTimers, spread = () => Math.random() * 20000) {
    this.request = request;
    this.timers = timers;
    this.spread = spread;
  }
  getSnapshot = () => this.state;
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
    if (state?.user) {
      this.holder = state.user.id;
      this.ending = null;
    } else if (state && this.holder !== null) {
      this.holder = null;
      // An account service that cannot answer has not signed anyone out.
      this.ending = state.available ? ending : null;
    }
    this.state = state;
    this.notify();
  }
  connect(connect: ConnectSession) {
    const connection = connect(change => {
      if (change === "ended") this.end(false, "ended");
      else this.reconcile();
    }, () => this.reconcile());
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
      void this.refresh().catch(() => {});
    }, seconds * 1000 + this.spread());
  }
  private invalidate() {
    this.schedule(undefined);
    this.revision++;
    this.pending?.abort();
    this.pending = null;
    invalidateAccountRequests();
  }
  private end(publish: boolean, ending: SessionEnding) {
    this.invalidate();
    this.update({ available: true, fixture: false, ...this.state, user: null, items: [] }, ending);
    if (publish) this.connection?.publish("ended");
  }
  /** The session ended without this tab's Sign Out. The screen says so. */
  clear = () => this.end(true, "ended");
  /** This tab's Sign Out was confirmed, or found the session already ended. Its own message says so. */
  signedOut = () => this.end(true, "signed_out");
  /**
   * Another endpoint refused a request for want of a session. Asks `/api/account`, which renews it,
   * and shares one check among every refusal that arrives meanwhile, so they do not cancel each other.
   */
  confirm = (): Promise<AccountState> => {
    // A check started meanwhile, by the schedule or a change in another tab, supersedes this one; its answer is the one to read.
    this.confirming ??= this.refresh()
      .catch((error: unknown) => error instanceof AccountFailure && error.code === "account_changed" ? this.refresh() : Promise.reject(error))
      .finally(() => { this.confirming = null; });
    return this.confirming;
  };
  /** The callback has established a new cookie. Other tabs must check it themselves. */
  changed() {
    this.invalidate();
    this.update(null);
    this.connection?.publish("changed");
  }
  private reconcile() {
    this.invalidate();
    this.update(null);
    void this.refresh().catch(() => {});
  }
  refresh = async (): Promise<AccountState> => {
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
      this.update(next);
      this.schedule(next.user ? next.renewIn : undefined);
      return next;
    } catch (error) {
      check();
      if (error instanceof AccountFailure && error.code === "sign_in_required") this.clear();
      else if (this.state?.user) this.schedule(RETRY_SECONDS);
      throw error;
    } finally {
      if (this.pending === task) this.pending = null;
    }
  };
}
