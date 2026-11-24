// A small rate limit for /api/mcp, held in the function's own memory. It is a second layer behind the
// Vercel Firewall rule, not a replacement for it: each function instance counts on its own, so the real
// ceiling is this limit times the number of instances running, and a count is lost when an instance
// stops. What it does bound is the tool work one instance does in a minute, whoever is asking: the
// ceilings across all callers are held apart from the per-caller counts and are never forgotten.

export type RateWindow = { readonly limit: number; readonly windowMs: number };

/**
 * The limits, per function instance. One caller is one client address (one /64 network for IPv6). An
 * assistant service calls from a few shared addresses for all its users, so the per-caller limits are
 * loose enough for that; the ceilings across callers are what bound the work. The ranking tool reads
 * every program for each call, so it is the tightest.
 */
export const MCP_LIMITS = {
  /** Any request from one caller, whatever it asks. */
  caller: { limit: 120, windowMs: 60_000 },
  /** find_funds_for_initiative from one caller. */
  ranking: { limit: 10, windowMs: 60_000 },
  /** find_funds_for_initiative that runs, from everyone, on one instance. */
  rankingAll: { limit: 30, windowMs: 60_000 },
  /** Every tool call that runs, from everyone, on one instance. */
  toolsAll: { limit: 300, windowMs: 60_000 },
} as const satisfies Record<string, RateWindow>;

/**
 * The most callers one instance remembers at once. Past it, the caller whose window began first is
 * forgotten, which hands that caller a fresh count: someone with thousands of addresses can do that, and
 * the ceilings across callers still hold.
 */
export const MCP_LIMIT_KEYS_MAX = 5_000;

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };
type Count = { start: number; count: number };

/** One use against a fixed window. A refused use is not counted, so the count reopens when the window ends. */
function use(counts: Map<string, Count>, key: string, window: RateWindow, at: number): RateDecision {
  const current = counts.get(key);
  // A clock that stepped back starts a new window instead of holding the old one open.
  if (!current || at - current.start >= window.windowMs || at < current.start) {
    // Re-inserting keeps the map in the order the windows began.
    counts.delete(key);
    counts.set(key, { start: at, count: 1 });
    return { ok: true };
  }
  if (current.count >= window.limit)
    return { ok: false, retryAfterSeconds: Math.min(Math.ceil(window.windowMs / 1000), Math.max(1, Math.ceil((current.start + window.windowMs - at) / 1000))) };
  current.count += 1;
  return { ok: true };
}

export function createRateLimiter(options: { now?: () => number; maxKeys?: number } = {}) {
  const now = options.now ?? Date.now;
  const maxKeys = Math.max(1, options.maxKeys ?? MCP_LIMIT_KEYS_MAX);
  const callers = new Map<string, Count>();
  const ceilings = new Map<string, Count>();
  return {
    /** Counts one use by one caller. Only these counts can be forgotten when the instance holds too many. */
    caller(key: string, window: RateWindow): RateDecision {
      const decision = use(callers, key, window, now());
      // The first key is the one whose window began first. One is removed for each one added past the bound.
      while (callers.size > maxKeys) callers.delete(callers.keys().next().value!);
      return decision;
    },
    /** Counts one use against a ceiling shared by every caller. The names are a fixed few, and they are kept. */
    ceiling(name: string, window: RateWindow): RateDecision { return use(ceilings, name, window, now()); },
    /** How many callers are held, for tests of the bound. */
    size: () => callers.size,
  };
}
export type RateLimiter = ReturnType<typeof createRateLimiter>;

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u;
const IPV6 = /^[0-9a-f:.]{2,45}(?:%[0-9a-z]{1,15})?$/u;
/**
 * The key for an IPv6 address: its first four groups, the network one subscriber is given, whose hosts all
 * count as one caller. An IPv4 address carried inside an IPv6 one (`::ffff:a.b.c.d`, or the `64:ff9b::`
 * translation prefix) is that IPv4 address, so those callers are not all counted as one.
 */
function ipv6Key(address: string): string | null {
  let text = address.split("%")[0]!;
  const dotted = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/u.exec(text);
  if (dotted) {
    if (!IPV4.test(dotted[2]!)) return null;
    const [a, b, c, d] = dotted[2]!.split(".").map(Number) as [number, number, number, number];
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  } else if (text.includes(".")) return null;
  const [head = "", tail, ...rest] = text.split("::");
  if (rest.length) return null;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  if (tail === undefined ? left.length !== 8 : left.length + right.length > 7) return null;
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group))) return null;
  const values = groups.map((group) => parseInt(group, 16)) as [number, number, number, number, number, number, number, number];
  const mapped = values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff;
  const translated = values[0] === 0x64 && values[1] === 0xff9b && values.slice(2, 6).every((value) => value === 0);
  if (mapped || translated) return [values[6] >> 8, values[6] & 255, values[7] >> 8, values[7] & 255].join(".");
  return values.slice(0, 4).map((value) => value.toString(16)).join(":");
}

/**
 * Who a request is from, for counting: the client address Vercel reports, an IPv6 one cut to its /64.
 * Vercel overwrites `x-forwarded-for` with the client's public address and forwards no value a client
 * sent, so a caller cannot choose it there; `x-real-ip` carries the same address and is read only when
 * the first is absent. Anywhere else (a dev server, a test) there may be neither, and every such caller,
 * like one whose address cannot be read, shares one count, which is the safe side.
 */
export function callerAddress(request: Request): string {
  for (const value of [request.headers.get("x-forwarded-for")?.split(",")[0], request.headers.get("x-real-ip")]) {
    const address = value?.trim().toLowerCase();
    if (!address) continue;
    if (IPV4.test(address)) return address;
    const key = IPV6.test(address) ? ipv6Key(address) : null;
    if (key) return key;
  }
  return "unknown";
}
