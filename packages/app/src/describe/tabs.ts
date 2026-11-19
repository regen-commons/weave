/** What one tab tells the others after its transaction commits: which draft it wrote or removed. */
export interface DraftMessage {
  kind: "saved" | "removed";
  id: string;
}
/** Carries draft messages between the tabs of one browser. A tab never hears its own. */
export interface DraftChannel {
  post(message: DraftMessage): void;
  listen(handler: (message: DraftMessage) => void): void;
}
/** Which of the device's drafts a tab is on. It lasts as long as the tab, so a reload opens the same one. */
export interface DraftPointer {
  get(): string | null;
  set(id: string | null): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function message(value: unknown): DraftMessage | null {
  if (!value || typeof value !== "object") return null;
  const { kind, id } = value as Record<string, unknown>;
  return (kind === "saved" || kind === "removed") && typeof id === "string" && UUID.test(id) ? { kind, id } : null;
}

export function memoryPointer(): DraftPointer {
  let id: string | null = null;
  return { get: () => id, set: (next) => void (id = next) };
}

/** The tab's pointer in session storage. Where that is blocked the tab still works, and a reload opens the latest draft. */
export function sessionPointer(storage: () => Storage | undefined, key = "weave-open-draft"): DraftPointer {
  const fallback = memoryPointer();
  return {
    get() {
      try {
        const value = storage()?.getItem(key) ?? null;
        return value && UUID.test(value) ? value : fallback.get();
      } catch {
        return fallback.get();
      }
    },
    set(id) {
      fallback.set(id);
      try {
        if (id) storage()?.setItem(key, id);
        else storage()?.removeItem(key);
      } catch {
        /* The pointer stays in this tab's memory. */
      }
    },
  };
}

/**
 * The browser's own channel between tabs. A message names a draft and nothing else: every tab
 * reads the draft itself from device storage, so nothing private crosses the channel.
 */
export function broadcastChannel(name = "weave-device-drafts"): DraftChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(name);
  } catch {
    return undefined;
  }
  return {
    post(value) {
      try {
        channel.postMessage(value);
      } catch {
        /* Other tabs catch up at their next read. */
      }
    },
    listen(handler) {
      channel.addEventListener("message", (event) => {
        const heard = message(event.data);
        if (heard) handler(heard);
      });
    },
  };
}

/** Tabs of one pretend browser, for examples and tests: each gets a channel that reaches the others. */
export function memoryTabs() {
  const handlers = new Map<object, (message: DraftMessage) => void>();
  return {
    channel(): DraftChannel {
      const self = {};
      return {
        post(value) {
          for (const [tab, handler] of handlers) if (tab !== self) handler(value);
        },
        listen(handler) {
          handlers.set(self, handler);
        },
      };
    },
  };
}
