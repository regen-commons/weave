/**
 * A person's shortlist of one kind of record, kept in this browser only (DL-152, DL-153). Funds and
 * initiatives each have one. It is not an account record and nothing about it leaves the device. Each
 * item keeps the name it had when it was marked, so one that later leaves its list can still be named.
 */
export interface ShortlistEntry {
  /** The record's identity in its own list: a catalog entry's ID, or a public project's address. */
  readonly id: string;
  readonly name: string;
  /** When it was marked, as an ISO instant. */
  readonly addedAt: string;
}

/** One kind of shortlist: where this browser keeps it, and how a stored item is read back. */
export interface ShortlistKind<T extends ShortlistEntry> {
  readonly key: string;
  /** The item, or null where storage holds something this kind cannot read. */
  parse(value: unknown): T | null;
}

/** More than anyone tracks by hand, and few enough that the stored list stays small. */
export const SHORTLIST_LIMIT = 500;

/**
 * The shortlist this browser stored. What it cannot read is dropped item by item, never guessed at,
 * so one damaged entry does not cost the rest.
 */
export function readShortlist<T extends ShortlistEntry>(raw: string | null, kind: ShortlistKind<T>): T[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1 ||
    !("items" in parsed) || !Array.isArray(parsed.items)) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const value of parsed.items as unknown[]) {
    const item = kind.parse(value);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length === SHORTLIST_LIMIT) break;
  }
  return items;
}

export function writeShortlist(items: readonly ShortlistEntry[]): string {
  return JSON.stringify({ version: 1, items });
}

/**
 * The shortlist with this item added, newest first, or taken off when it was already there. A full
 * shortlist refuses an addition rather than dropping an older item unseen.
 */
export function toggledShortlist<T extends ShortlistEntry>(
  items: readonly T[],
  item: T,
): { items: readonly T[]; added: boolean } | { full: true } {
  if (items.some((each) => each.id === item.id))
    return { items: items.filter((each) => each.id !== item.id), added: false };
  if (items.length >= SHORTLIST_LIMIT) return { full: true };
  return { items: [item, ...items], added: true };
}

/** The part of `Storage` the shortlist uses, so tests and a refusing browser can stand in for it. */
export interface ShortlistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ShortlistState<T extends ShortlistEntry> {
  readonly items: readonly T[];
  /** False once this browser refused to keep the latest change; the shortlist then lasts this visit. */
  readonly kept: boolean;
}

export type ShortlistChange = "added" | "removed" | "full";

/**
 * One kind of shortlist as one source for every page in this tab. It reads storage once, writes each
 * change through, and keeps the change in memory when the browser refuses it, saying so through
 * `kept`. Another tab's change arrives through `reload`.
 */
export function createShortlistStore<T extends ShortlistEntry>(
  storage: () => ShortlistStorage | null,
  kind: ShortlistKind<T>,
) {
  let state: ShortlistState<T> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function load(): ShortlistState<T> {
    try {
      const place = storage();
      return { items: readShortlist(place?.getItem(kind.key) ?? null, kind), kept: place !== null };
    } catch {
      return { items: [], kept: false };
    }
  }
  function current(): ShortlistState<T> {
    state ??= load();
    return state;
  }
  function set(items: readonly T[]) {
    let kept = false;
    try {
      const place = storage();
      if (place) {
        place.setItem(kind.key, writeShortlist(items));
        kept = true;
      }
    } catch {
      kept = false;
    }
    state = { items, kept };
    notify();
  }
  return {
    key: kind.key,
    current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Adds the item, or takes it off. Says which, or that the shortlist is full. */
    toggle(item: T): ShortlistChange {
      const next = toggledShortlist(current().items, item);
      if ("full" in next) return "full";
      set(next.items);
      return next.added ? "added" : "removed";
    },
    remove(id: string) {
      const items = current().items;
      if (items.some((item) => item.id === id)) set(items.filter((item) => item.id !== id));
    },
    /** Reads storage again, after another tab changed it. A refused change made here stays. */
    reload() {
      if (state && !state.kept) return;
      state = load();
      notify();
    },
  };
}

export type ShortlistStore<T extends ShortlistEntry> = ReturnType<typeof createShortlistStore<T>>;
