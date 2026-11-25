import { createHmac } from "node:crypto";
import postgres from "postgres";
import { callerAddress } from "./mcp-limit.ts";

type Reservation = { allowed: true } | { allowed: false; limit: "caller" | "daily"; retryAt: number };
export type SpeechQuota = (request: Request) => Promise<Reservation>;

export function createSpeechQuota(
  secret: string,
  reserve: (callerKey: string) => Promise<{ decision: unknown; retry_at: unknown } | undefined>,
): SpeechQuota {
  return async (request) => {
    // Use Vercel's connection address, normalized to a /64 for IPv6. The database never sees the address.
    const key = createHmac("sha256", secret).update(callerAddress(request)).digest("hex");
    const row = await reserve(key);
    if (row?.decision === "allowed" && row.retry_at === null) return { allowed: true };
    if (row?.decision === "caller" || row?.decision === "daily") {
      const retryAt = row.retry_at instanceof Date ? row.retry_at.getTime() : NaN;
      if (Number.isFinite(retryAt)) return { allowed: false, limit: row.decision, retryAt };
    }
    throw new Error("Invalid speech quota response");
  };
}

export function configuredSpeechQuota(env: NodeJS.ProcessEnv = process.env): SpeechQuota | null {
  const secret = env.WEAVE_SPEECH_QUOTA_SECRET;
  if (!env.WEAVE_SPEECH_QUOTA_DATABASE_URL || !secret || !/^[0-9a-f]{64}$/u.test(secret)) return null;
  try {
    const url = new URL(env.WEAVE_SPEECH_QUOTA_DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.search) return null;
    const database = postgres(String(url), {
      ssl: { rejectUnauthorized: true, ca: env.WEAVE_SPEECH_QUOTA_DATABASE_CA_PEM, servername: url.hostname },
      max: 1, prepare: false, connect_timeout: 2, idle_timeout: 15, onnotice: () => {},
    });
    return createSpeechQuota(secret, async (key) => {
      const query = database<{ decision: string; retry_at: Date | null }[]>
        `select decision, retry_at from weave_speech_quota_private.reserve(${key})`;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Speech quota timed out"));
            void query.cancel().catch(() => {});
          }, 3000);
        });
        const [row] = await Promise.race([query, deadline]);
        return row;
      } finally {
        clearTimeout(timer);
      }
    });
  } catch {
    return null;
  }
}
