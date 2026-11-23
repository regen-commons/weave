/**
 * A note on this device that an account was signed in the last time the session was checked. It
 * names nobody and grants nothing: the server still decides every request. It only keeps the first
 * paint from offering sign-in to someone who is very likely signed in, while the check is under way.
 */
export interface AccountPresence {
  read(): boolean;
  write(present: boolean): void;
}

export const PRESENCE_KEY = "weave-account-present";

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
  };
}

export const noPresence: AccountPresence = { read: () => false, write: () => {} };
