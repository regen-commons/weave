/**
 * A note on this device that an account was signed in the last time the session was checked. It
 * names nobody and grants nothing: the server still decides every request. It only keeps the first
 * paint from offering sign-in to someone who is very likely signed in, while the check is under way.
 */
export interface AccountPresence {
  read(): boolean;
  write(present: boolean): void;
  /**
   * A mark that moves whenever a tab in this browser finishes a sign-in or ends a session. A tab
   * that comes back into view compares it with the one it last saw, so a change it never heard of
   * is not missed. Undefined where the device cannot say, and the tab then assumes a change.
   */
  mark(): string | undefined;
  /** Moves the mark. Called by the tab that signs in or ends the session. */
  move(): void;
}

export const PRESENCE_KEY = "weave-account-present";
/** A random value with no meaning of its own; only whether it changed is read. */
export const MARK_KEY = "weave-account-mark";

/** Where storage is blocked there is no note, and the page offers sign-in until the check answers. */
export function browserPresence(storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> = () => window.localStorage): AccountPresence {
  return {
    read() {
      try { return storage().getItem(PRESENCE_KEY) === "1"; } catch { return false; }
    },
    write(present) {
      try {
        if (present) storage().setItem(PRESENCE_KEY, "1");
        else storage().removeItem(PRESENCE_KEY);
      } catch { /* The check still answers; only the first paint guesses. */ }
    },
    mark() {
      try { return storage().getItem(MARK_KEY) ?? ""; } catch { return undefined; }
    },
    move() {
      try { storage().setItem(MARK_KEY, crypto.randomUUID()); } catch { /* A tab that cannot read the mark assumes a change. */ }
    },
  };
}

/** A device with nothing noted and a mark that never moves, for a session that is not on a page. */
export const noPresence: AccountPresence = { read: () => false, write: () => {}, mark: () => "", move: () => {} };
