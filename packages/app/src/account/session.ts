import { accountRequest, accountState, AccountFailure, invalidateAccountRequests, type AccountState } from "./client.ts";

export type SessionChange = "ended" | "changed";
export interface SessionConnection {
  publish(change: SessionChange): void;
  close(): void;
}
export type ConnectSession = (receive: (change: SessionChange) => void, resume: () => void) => SessionConnection;

/** Account state belongs to the current browser session, never to device drafts or backups. */
export class AccountSession {
  private state: AccountState | null = null;
  private listeners = new Set<() => void>();
  private request: typeof accountRequest;
  private connection: SessionConnection | null = null;
  private revision = 0;
  private pending: AbortController | null = null;
  constructor(request = accountRequest) { this.request = request; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(state: AccountState | null) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  connect(connect: ConnectSession) {
    const connection = connect(change => {
      if (change === "ended") this.end(false);
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
  private invalidate() {
    this.revision++;
    this.pending?.abort();
    this.pending = null;
    invalidateAccountRequests();
  }
  private end(publish: boolean) {
    this.invalidate();
    this.update({ available: true, fixture: false, ...this.state, user: null, items: [] });
    if (publish) this.connection?.publish("ended");
  }
  clear = () => this.end(true);
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
      return next;
    } catch (error) {
      check();
      if (error instanceof AccountFailure && error.code === "sign_in_required") this.clear();
      throw error;
    } finally {
      if (this.pending === task) this.pending = null;
    }
  };
}
