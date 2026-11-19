import { STORED_SAID_LIMIT, type AiRun, type DeviceDraft, type Initiative } from "./contracts.ts";
import { availableBrowser, browserExtract } from "./engines.ts";
import { saidText } from "./fill.ts";
import type { KeywordResult } from "./keywords.ts";

/**
 * One way of turning a person's words into a card, beyond the keyword rules every fill starts
 * with. Today the only one is the browser's built-in model, which runs on this device. Consented
 * cloud structuring (D35) is not built: when it is, it is one more engine in the list a page
 * passes in, behind its own consent, and nothing here changes.
 */
export interface StructureEngine {
  readonly engine: Exclude<AiRun["engine"], "keywords" | "fixture">;
  /** The name the AI ledger records for it. */
  readonly model: string;
  /** Reads the same words and returns a fuller card, or throws. A failure keeps the keyword card. */
  refine(text: string, signal: AbortSignal): Promise<Initiative>;
}

/** The browser's own model, already on this device. It is never downloaded from here. */
export const browserEngine: StructureEngine = {
  engine: "browser",
  model: "Browser-managed model",
  refine: (text, signal) => browserExtract(text, signal),
};

/** The engines this device can use now, in the order to try them. No engine sends words anywhere. */
export async function deviceEngines(): Promise<StructureEngine[]> {
  return (await availableBrowser()) ? [browserEngine] : [];
}

export interface StructureAttempt {
  readonly engine: AiRun["engine"];
  readonly model: string;
  readonly status: AiRun["status"];
  readonly latencyMs: number;
}
export interface Structured {
  readonly suggestion: Initiative;
  /** How many words were read, for the AI ledger. No words leave the device. */
  readonly words: number;
  readonly attempts: readonly StructureAttempt[];
  readonly lastBuild: NonNullable<DeviceDraft["lastBuild"]>;
}

/**
 * Structures the words in the box, and any readable files, into a suggested card. The keyword
 * rules always run first and always give an answer. Each engine after them may improve it; the
 * first that succeeds wins, and one that fails leaves the keyword card in place.
 */
export async function structureWords(
  draft: DeviceDraft,
  signal: AbortSignal,
  {
    keywords,
    engines = [],
    now = () => performance.now(),
  }: {
    /** The keyword rules, which the page runs in a worker so a long text never freezes it. */
    keywords(source: DeviceDraft, signal: AbortSignal): Promise<KeywordResult>;
    engines?: readonly StructureEngine[];
    now?(): number;
  },
): Promise<Structured> {
  // The box is the one source of words. Earlier conversation answers are read as its text, which
  // can be longer than the box takes. Length alone never stops a fill: the rules read as much as
  // a draft's words field holds.
  const source: DeviceDraft = { ...draft, composer: saidText(draft).slice(0, STORED_SAID_LIMIT), turns: [], answerEdits: {}, pendingLink: "" };
  const started = now();
  const result = await keywords(source, signal);
  signal.throwIfAborted();
  const attempts: StructureAttempt[] = [
    { engine: "keywords", model: "Keyword draft", status: "complete", latencyMs: Math.max(0, Math.round(now() - started)) },
  ];
  let suggestion = result.suggestion;
  let engine: NonNullable<DeviceDraft["lastBuild"]>["engine"] = "keywords";
  let fallback = false;
  for (const candidate of engines) {
    const from = now();
    try {
      const refined = await candidate.refine(result.text, signal);
      signal.throwIfAborted();
      // A place is proposed only where the person's words state one, so the keyword rules keep it.
      suggestion = { ...refined, locations: result.suggestion.locations, isGlobal: result.suggestion.isGlobal };
      engine = candidate.engine;
      fallback = false;
      attempts.push({ engine: candidate.engine, model: candidate.model, status: "complete", latencyMs: Math.max(0, Math.round(now() - from)) });
      break;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      fallback = true;
      attempts.push({ engine: candidate.engine, model: candidate.model, status: "failed", latencyMs: Math.max(0, Math.round(now() - from)) });
    }
  }
  return {
    suggestion,
    words: result.words,
    attempts,
    lastBuild: { engine, unreadFiles: result.unreadFiles, sourceCharacters: result.text.length, files: result.files, fallback },
  };
}

/** The AI ledger rows for one fill. Every row records zero cloud words. */
export function ledgerRows(step: AiRun["step"], attempts: readonly StructureAttempt[], words: number): AiRun[] {
  return attempts.map((attempt) => ({
    id: crypto.randomUUID(),
    step,
    engine: attempt.engine,
    model: attempt.model,
    at: new Date().toISOString(),
    words,
    cloudWords: 0,
    status: attempt.status,
    latencyMs: attempt.latencyMs,
  }));
}
