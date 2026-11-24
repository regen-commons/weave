// The speech evaluation: a word error rate scorer, a clip manifest and a runner that sends each clip to
// /api/transcribe the way the app does. Every call reaches the speech provider, so nothing here runs in
// CI on a push: it runs by hand or from the manual Speech evaluation workflow. Synthetic clips prove the
// harness only; their numbers are never an accuracy result.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLOUD_SPEECH, parseSpeechFailure, parseTranscript } from "../../src/transcribe-contract.ts";

// Scoring -------------------------------------------------------------------------------------------------

/**
 * Words as they are compared: lower case, without punctuation, with every run of spaces as one. Accents
 * stay, since "é" and "e" are different words in Portuguese. Numbers are not spelled out, so "20" against
 * "twenty" counts as an error: write the reference the way a person would type it in the box.
 */
export function words(text: string): string[] {
  return text
    // Apostrophe look-alikes first: NFKC would split an acute accent used as one ("d´água") into a space and a mark.
    .replace(/[’‘ʼ´`]/gu, "'")
    .normalize("NFKC")
    // Not toLocaleLowerCase: a reference must read the same on every machine.
    .toLowerCase()
    // Apostrophes inside a word stay ("we're", "d'água"); every other mark is a gap.
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{M}\p{N}']+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export type Edits = { substitutions: number; deletions: number; insertions: number; reference: number };

/** The fewest substitutions, deletions and insertions that turn `reference` into `hypothesis`. */
export function align<T>(reference: readonly T[], hypothesis: readonly T[]): Edits {
  // One row of the edit distance table at a time, each cell carrying its counts so ties stay explainable.
  type Cell = { cost: number; s: number; d: number; i: number };
  let row: Cell[] = hypothesis.map((_, j) => ({ cost: j + 1, s: 0, d: 0, i: j + 1 }));
  row.unshift({ cost: 0, s: 0, d: 0, i: 0 });
  for (let r = 1; r <= reference.length; r++) {
    const next: Cell[] = [{ cost: r, s: 0, d: r, i: 0 }];
    for (let h = 1; h <= hypothesis.length; h++) {
      const same = reference[r - 1] === hypothesis[h - 1];
      const diagonal = row[h - 1]!, up = row[h]!, left = next[h - 1]!;
      const options: Cell[] = [
        { ...diagonal, cost: diagonal.cost + (same ? 0 : 1), s: diagonal.s + (same ? 0 : 1) },
        { ...up, cost: up.cost + 1, d: up.d + 1 },
        { ...left, cost: left.cost + 1, i: left.i + 1 },
      ];
      next.push(options.reduce((best, option) => (option.cost < best.cost ? option : best)));
    }
    row = next;
  }
  const end = row[hypothesis.length]!;
  return { substitutions: end.s, deletions: end.d, insertions: end.i, reference: reference.length };
}

/** Word error rate: edits over reference words. Above 1 when the hypothesis adds more than it keeps. */
export function wordErrorRate(reference: string, hypothesis: string): Edits & { rate: number } {
  const edits = align(words(reference), words(hypothesis));
  return { ...edits, rate: edits.reference ? (edits.substitutions + edits.deletions + edits.insertions) / edits.reference : 0 };
}

/** Character edits over the words joined by single spaces, which reads languages without spaces fairly. */
export function characterEdits(reference: string, hypothesis: string): Edits {
  return align([...words(reference).join(" ")], [...words(hypothesis).join(" ")]);
}
export function characterErrorRate(reference: string, hypothesis: string): number {
  const edits = characterEdits(reference, hypothesis);
  return edits.reference ? (edits.substitutions + edits.deletions + edits.insertions) / edits.reference : 0;
}

// The manifest ---------------------------------------------------------------------------------------------

export const LANGUAGES = ["en", "pt-BR", "es", "sw"] as const;
export type ClipLanguage = (typeof LANGUAGES)[number];
const TYPES: Record<string, (typeof CLOUD_SPEECH.audioTypes)[number]> = { ".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp4": "audio/mp4" };

export type Clip = {
  id: string;
  /** Relative to the manifest, or absolute. */
  file: string;
  language: ClipLanguage;
  /** What was said, word for word, as a person would type it. */
  reference: string;
  /** "recorded" for a consenting person's voice, "synthetic" for a generated one. */
  kind: "recorded" | "synthetic";
  /** For a recorded clip: who recorded it, by an opaque code from the consent notes such as "s02", never a name or initials. */
  speaker?: string;
  /** For a synthetic clip: the voice that read it, such as "macOS say: Flo (Portuguese (Brazil))". */
  voice?: string;
  /** Free words for the conditions: "quiet room", "street noise", "phone at arm's length". */
  conditions?: string;
  seconds: number;
};
export type Manifest = { version: 1; set: string; recordedOn: string; consent: string; clips: Clip[] };

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * What may name a set and a clip. Both reach a run's log and its report, which a public repository's
 * workflow lets anyone read, so neither is free text: a set is its kind and a date, and a clip is its
 * language, its shape and a number.
 */
const SET = /^(recorded|synthetic)-\d{4}-\d{2}-\d{2}$/u;
const CLIP = /^(en|pt|es|sw)-(describe|needs|offers|own)-\d{1,3}$/u;
const SPEAKER = /^s\d{1,3}$/u;

/** Rejects a manifest that would mislabel a voice or name a person: a synthetic clip with a speaker, or free text where a code belongs. */
export function validateManifest(data: unknown): Manifest {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("invalid_manifest");
  const manifest = data as Manifest;
  if (manifest.version !== 1 || !SET.test(manifest.set ?? "") || !/^\d{4}-\d{2}-\d{2}$/u.test(manifest.recordedOn ?? "")
    || !isText(manifest.consent) || !Array.isArray(manifest.clips) || !manifest.clips.length) throw Error("invalid_manifest");
  const ids = new Set<string>();
  for (const clip of manifest.clips) {
    if (!clip || typeof clip !== "object" || !CLIP.test(clip.id ?? "") || ids.has(clip.id)) throw Error("invalid_clip_id");
    if (!isText(clip.file) || !TYPES[clip.file.slice(clip.file.lastIndexOf(".")).toLowerCase()]) throw Error(`invalid_clip_file: ${clip.id}`);
    if (!(LANGUAGES as readonly string[]).includes(clip.language) || !isText(clip.reference) || !words(clip.reference).length)
      throw Error(`invalid_clip: ${clip.id}`);
    if (typeof clip.seconds !== "number" || !(clip.seconds > 0) || clip.seconds > CLOUD_SPEECH.maxSeconds) throw Error(`invalid_clip_seconds: ${clip.id}`);
    if (clip.kind === "synthetic") {
      if (clip.speaker !== undefined || !isText(clip.voice)) throw Error(`invalid_synthetic_clip: ${clip.id}`);
    } else if (clip.kind === "recorded") {
      // A speaker is a code from the consent notes, so a name, initials or an email never reach a report.
      if (!SPEAKER.test(clip.speaker ?? "")) throw Error(`invalid_speaker_code: ${clip.id}`);
    } else throw Error(`invalid_clip_kind: ${clip.id}`);
    ids.add(clip.id);
  }
  return manifest;
}

// The runner ------------------------------------------------------------------------------------------------

export type Send = (request: Request) => Promise<Response>;
export type ClipResult = {
  id: string; language: ClipLanguage; kind: Clip["kind"]; seconds: number;
  status: "transcribed" | "failed" | "not_sent"; failure?: string; latencyMs: number;
  wer?: number; cer?: number; edits?: Edits; characters?: Edits;
  /** Only with --include-text: what was said and what came back. */
  reference?: string; hypothesis?: string;
};

/** The longest one clip may take: the app's own wait for a recording is a minute. */
export const CLIP_TIMEOUT_MS = 90_000;

/** Sends one clip as the app does: the recording as the body, its type, the agreement header and its language. */
export async function transcribeClip(send: Send, base: URL, clip: Clip, audio: Uint8Array, now = () => performance.now()): Promise<{ text?: string; failure?: string; latencyMs: number }> {
  const url = new URL(CLOUD_SPEECH.path, base);
  const type = TYPES[clip.file.slice(clip.file.lastIndexOf(".")).toLowerCase()]!;
  const started = now();
  let response: Response;
  try {
    response = await send(new Request(url, {
      method: "POST",
      body: audio,
      headers: { origin: url.origin, "content-type": type, [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement, [CLOUD_SPEECH.languageHeader]: clip.language },
      signal: AbortSignal.timeout(CLIP_TIMEOUT_MS),
    }));
  } catch (error) {
    // A lost connection or a clip that takes too long fails that clip; the run goes on and its report is kept.
    return { failure: (error as Error)?.name === "TimeoutError" ? "client_timeout" : "network_error", latencyMs: Math.round(now() - started) };
  }
  const latencyMs = Math.round(now() - started);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { failure: parseSpeechFailure(body), latencyMs };
  try {
    return { text: parseTranscript(body).text, latencyMs };
  } catch {
    return { failure: "speech_failed", latencyMs };
  }
}

type Totals = { clips: number; transcribed: number; wer: number | null; cer: number | null; seconds: number };
/** Edits over reference units, pooled across clips, so a long clip counts for more, as the words a person loses do. */
function pooled(all: Edits[]): number | null {
  const reference = all.reduce((sum, e) => sum + e.reference, 0);
  return reference ? Math.round((all.reduce((sum, e) => sum + e.substitutions + e.deletions + e.insertions, 0) / reference) * 1000) / 1000 : null;
}
/** Totals over the clips that came back as words. A clip that failed or was not sent is counted, not scored. */
function totals(rows: ClipResult[]): Totals {
  const done = rows.filter((row) => row.edits && row.characters);
  return {
    clips: rows.length, transcribed: done.length,
    wer: pooled(done.map((row) => row.edits!)),
    cer: pooled(done.map((row) => row.characters!)),
    seconds: Math.round(rows.reduce((sum, row) => sum + row.seconds, 0)),
  };
}
/** Answers after which no later clip can succeed today, so the run stops spending the allowance. */
const STOPS = new Set(["speech_limit_reached", "speech_unavailable", "origin_required", "agreement_required"]);

export type SpeechReport = {
  set: string; ranAt: string; base: string;
  /** The deployment's own cloud speech, which the app's notice names as this provider. */
  provider: string;
  /** Present whenever a synthetic clip ran: its numbers prove the harness and say nothing about accuracy. */
  warning?: string;
  recorded: Record<string, Totals> | null;
  synthetic: Record<string, Totals> | null;
  clips: ClipResult[];
};

/**
 * Runs every clip, one at a time, and keeps recorded and synthetic clips apart in every total. Every file
 * is read before the first is sent, so a missing file costs no allowance; after an answer that no later
 * clip can get past, such as the day's limit, the rest are marked not sent.
 */
export async function runManifest(manifest: Manifest, options: { send: Send; base: URL; read(clip: Clip): Promise<Uint8Array>; includeText?: boolean; ranAt?: string }): Promise<SpeechReport> {
  const audio = new Map<string, Uint8Array>();
  for (const clip of manifest.clips) {
    const bytes = await options.read(clip).catch(() => null);
    if (!bytes?.byteLength) throw Error(`clip_unreadable: ${clip.id}`);
    if (bytes.byteLength > CLOUD_SPEECH.maxBytes) throw Error(`clip_too_large: ${clip.id}`);
    audio.set(clip.id, bytes);
  }
  const clips: ClipResult[] = [];
  let stopped: string | undefined;
  for (const clip of manifest.clips) {
    const base = { id: clip.id, language: clip.language, kind: clip.kind, seconds: clip.seconds };
    if (stopped) {
      clips.push({ ...base, status: "not_sent", failure: `after ${stopped}`, latencyMs: 0 });
      continue;
    }
    const { text, failure, latencyMs } = await transcribeClip(options.send, options.base, clip, audio.get(clip.id)!);
    if (text === undefined) {
      clips.push({ ...base, latencyMs, status: "failed", failure });
      if (failure && STOPS.has(failure)) stopped = failure;
      continue;
    }
    const { rate, ...edits } = wordErrorRate(clip.reference, text);
    const characters = characterEdits(clip.reference, text);
    clips.push({
      ...base, latencyMs, status: "transcribed", wer: Math.round(rate * 1000) / 1000, edits, characters,
      cer: characters.reference ? Math.round(((characters.substitutions + characters.deletions + characters.insertions) / characters.reference) * 1000) / 1000 : 0,
      ...(options.includeText ? { reference: clip.reference, hypothesis: text } : {}),
    });
  }
  const group = (kind: Clip["kind"]) => {
    const rows = clips.filter((row) => row.kind === kind);
    if (!rows.length) return null;
    return Object.fromEntries([["all", totals(rows)], ...[...new Set(rows.map((row) => row.language))].sort().map((language) => [language, totals(rows.filter((row) => row.language === language))])]);
  };
  const synthetic = group("synthetic");
  return {
    set: manifest.set, ranAt: options.ranAt ?? new Date().toISOString(), base: options.base.origin,
    provider: `${CLOUD_SPEECH.provider} (${CLOUD_SPEECH.model}), as configured on ${options.base.origin}`,
    ...(synthetic ? { warning: "Synthetic clips: these numbers prove the harness only. They are not an accuracy result and must not be quoted as one." } : {}),
    recorded: group("recorded"), synthetic, clips,
  };
}

export function reportTable(report: SpeechReport): string {
  const lines = [`${report.set} against ${report.base} (${report.provider}), ${report.ranAt}`];
  if (report.warning) lines.push(`WARNING: ${report.warning}`);
  for (const [kind, groups] of [["recorded", report.recorded], ["synthetic", report.synthetic]] as const) {
    if (!groups) continue;
    lines.push(`${kind}:`);
    for (const [language, t] of Object.entries(groups))
      lines.push(`  ${language.padEnd(6)} WER ${t.wer ?? "none"}  CER ${t.cer ?? "none"}  ${t.transcribed}/${t.clips} clips transcribed, ${t.seconds} s`);
  }
  const failed = report.clips.filter((clip) => clip.status !== "transcribed");
  if (failed.length) lines.push(`Not transcribed: ${failed.map((clip) => `${clip.id} (${clip.status === "not_sent" ? "not sent, " : ""}${clip.failure})`).join(", ")}`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name: string) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const manifestPath = option("--manifest");
  const base = option("--base");
  if (!manifestPath || !base) {
    console.error("Usage: eval:speech -- --manifest <clips/manifest.json> --base <https://weave.example> [--output report.json] [--include-text]");
    process.exit(2);
  }
  let manifest: Manifest;
  try {
    manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    // The parser's message quotes the file, and a run's log is public: name only the problem.
    console.error(error instanceof SyntaxError ? "The manifest is not valid JSON." : `The manifest was refused: ${(error as Error).message}.`);
    process.exit(2);
  }
  const folder = dirname(resolve(manifestPath));
  const status: unknown = await fetch(new URL(CLOUD_SPEECH.path, base)).then((r) => r.json()).catch(() => null);
  if (!(status && typeof status === "object" && (status as { enabled?: unknown }).enabled === true)) {
    console.error(`${base} has cloud speech switched off, so no clip was sent.`);
    process.exit(1);
  }
  let report: SpeechReport;
  try {
    report = await runManifest(manifest, {
    send: (request) => fetch(request),
    base: new URL(base),
    read: async (clip) => new Uint8Array(await readFile(isAbsolute(clip.file) ? clip.file : resolve(folder, clip.file))),
    includeText: process.argv.includes("--include-text"),
    });
  } catch (error) {
    // A clip that cannot be read stops the run before anything is sent; its ID is a code, never a name.
    console.error(`No clip was sent: ${(error as Error).message}.`);
    process.exit(1);
  }
  console.log(reportTable(report));
  const output = option("--output");
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
