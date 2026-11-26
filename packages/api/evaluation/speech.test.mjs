// The speech harness, proven without the provider: the scorer's arithmetic, the manifest's rules, and
// the runner end to end against the real /api/transcribe handler with a stand-in provider. Nothing here
// reaches Cloudflare; real runs go through `eval:speech` by hand or the manual Speech evaluation workflow.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTranscribeHandlers } from "../src/transcribe.ts";
import { SpeechError } from "../src/transcribe-provider.ts";
import { characterErrorRate, reportTable, runManifest, validateManifest, wordErrorRate, words } from "./speech/speech.ts";

const BASE = new URL("https://weave.example");

test("words are compared without case or punctuation, keeping accents and inner apostrophes", () => {
  assert.deepEqual(words("We're River Keepers, based in Nairobi!"), ["we're", "river", "keepers", "based", "in", "nairobi"]);
  assert.deepEqual(words("Somos a Horta — em Recife."), ["somos", "a", "horta", "em", "recife"]);
  assert.deepEqual(words("‘Pão’ e café"), ["pão", "e", "café"]);
  assert.notDeepEqual(words("é"), words("e"), "an accent changes a Portuguese word");
  // Apostrophe look-alikes, including an acute accent typed as one, join a word as an apostrophe does.
  assert.deepEqual(words("d´água ng’ombe weʼre"), ["d'água", "ng'ombe", "we're"]);
  assert.deepEqual(words("İstanbul"), words("i̇stanbul"), "the same on every machine, whatever its locale");
});

test("word error rate counts substitutions, deletions and insertions over the reference's words", () => {
  assert.deepEqual(wordErrorRate("we need seedlings", "We need seedlings."), { substitutions: 0, deletions: 0, insertions: 0, reference: 3, rate: 0 });
  assert.deepEqual(wordErrorRate("we need native seedlings", "we need naive seedlings"), { substitutions: 1, deletions: 0, insertions: 0, reference: 4, rate: 0.25 });
  assert.deepEqual(wordErrorRate("we need a water pump", "we need pump"), { substitutions: 0, deletions: 2, insertions: 0, reference: 5, rate: 0.4 });
  assert.deepEqual(wordErrorRate("the river", "the big river today"), { substitutions: 0, deletions: 0, insertions: 2, reference: 2, rate: 1 });
  assert.equal(wordErrorRate("one two three", "").rate, 1);
  // Numbers are not spelled out: write the reference as a person would type it.
  assert.equal(wordErrorRate("twenty trees", "20 trees").substitutions, 1);
  assert.equal(characterErrorRate("recife", "recife"), 0);
  assert.ok(Math.abs(characterErrorRate("recife", "recifi") - 1 / 6) < 1e-12);
});

const clip = (over = {}) => ({ id: "en-needs-1", file: "en-needs-1.webm", language: "en", reference: "We need seedlings and a water pump.", kind: "recorded", speaker: "s01", seconds: 6, ...over });
const manifest = (clips) => ({ version: 1, set: "recorded-2026-11-23", recordedOn: "2026-11-23", consent: "Consent notes kept with the clips.", clips });

test("a manifest names no person and never passes a synthetic voice off as a recorded one", () => {
  assert.equal(validateManifest(manifest([clip()])).clips.length, 1);
  const reject = (clips, message, set) => assert.throws(() => validateManifest({ ...manifest(clips), ...(set ? { set } : {}) }), { message });
  // A speaker is a code, never a name, initials or an email.
  for (const speaker of ["Ana Souza", "ana@example.org", "Ana-1", "eva2"]) reject([clip({ speaker })], "invalid_speaker_code: en-needs-1");
  // A clip's ID and the set's name reach a public run's log, so neither is free text.
  reject([clip({ id: "maria-souza" })], "invalid_clip_id");
  reject([clip({ id: "en-maria-1" })], "invalid_clip_id");
  reject([clip()], "invalid_manifest", "marias-voice");
  reject([clip({ kind: "synthetic", voice: "macOS say: Flo" })], "invalid_synthetic_clip: en-needs-1");
  reject([clip({ kind: "synthetic", speaker: undefined })], "invalid_synthetic_clip: en-needs-1");
  reject([clip(), clip()], "invalid_clip_id");
  reject([clip({ file: "en-needs-1.wav" })], "invalid_clip_file: en-needs-1");
  reject([clip({ seconds: 181 })], "invalid_clip_seconds: en-needs-1");
  reject([clip({ language: "fr" })], "invalid_clip: en-needs-1");
  reject([clip({ reference: "..." })], "invalid_clip: en-needs-1");
});

test("the guide's prompts are valid references in each language, and Swahili is left to a Swahili speaker", async () => {
  const { prompts } = JSON.parse(await readFile(new URL("./speech/prompts.json", import.meta.url), "utf8"));
  for (const language of ["en", "pt-BR", "es"]) assert.ok(prompts.filter((p) => p.language === language).length >= 5, language);
  assert.equal(prompts.some((p) => p.language === "sw"), false);
  assert.equal(new Set(prompts.map((p) => p.id)).size, prompts.length);
});

test("the runner sends each clip as the app does, scores it, and keeps synthetic numbers apart and labelled", async () => {
  const seen = [];
  // A stand-in for Cloudflare: the "audio" is the words, so each clip says what it should come back as.
  const provider = {
    async transcribe(audio, { language }) {
      const said = new TextDecoder().decode(audio);
      seen.push(language);
      if (said === "busy") throw new SpeechError(503, "speech_busy");
      return { text: said };
    },
  };
  const { POST } = createTranscribeHandlers({ provider, quota: async () => ({ allowed: true }) });
  const audio = {
    "en-needs-1": "We need seedlings and a water pump.",
    "pt-needs-1": "Precisamos de mudas e uma estufa",
    "en-offers-1": "We can lend tools on weekend",
    "es-needs-1": "busy",
  };
  const report = await runManifest(manifest([
    clip(),
    clip({ id: "pt-needs-1", file: "pt-needs-1.m4a", language: "pt-BR", reference: "Precisamos de mudas e de uma estufa.", speaker: "s02" }),
    clip({ id: "en-offers-1", file: "en-offers-1.m4a", kind: "synthetic", speaker: undefined, voice: "macOS say: Flo (English (US))", reference: "We can lend tools on weekends." }),
    clip({ id: "es-needs-1", file: "es-needs-1.ogg", language: "es", speaker: "s03", reference: "Necesitamos semillas." }),
  ]), { send: POST, base: BASE, read: async ({ id }) => new TextEncoder().encode(audio[id]), ranAt: "2026-11-23T00:00:00Z" });

  // The handler refuses a request without the same origin, the agreement or an audio type, so reaching the provider proves the headers.
  assert.deepEqual(seen, ["en", "pt", "en", "es"], "each clip's language reached the provider as Whisper reads it");
  const byId = Object.fromEntries(report.clips.map((row) => [row.id, row]));
  assert.equal(byId["en-needs-1"].wer, 0);
  assert.equal(byId["pt-needs-1"].wer, 0.143, "one of seven words dropped");
  assert.deepEqual([byId["es-needs-1"].status, byId["es-needs-1"].failure], ["failed", "speech_busy"]);
  assert.equal(byId["en-needs-1"].reference, undefined, "no words in a report unless asked for");
  // Both rates are pooled over the transcribed clips: 1 word of 14, and 3 characters of 69.
  assert.deepEqual(report.recorded.all, { clips: 3, transcribed: 2, wer: 0.071, cer: 0.043, seconds: 18 });
  assert.equal(report.synthetic.all.wer, 0.167);
  assert.match(report.warning, /prove the harness only/u);
  assert.match(reportTable(report), /^WARNING: Synthetic clips/mu);
  assert.match(reportTable(report), /Not transcribed: es-needs-1 \(speech_busy\)/u);
});

test("a lost connection fails one clip, the day's limit stops the rest, and a missing file stops the run before anything is sent", async () => {
  const sent = [];
  const answers = [() => { throw new TypeError("fetch failed"); }, () => Response.json({ error: "speech_limit_reached" }, { status: 429 })];
  const send = async (request) => { sent.push(request.headers.get("x-weave-speech-language")); return answers[sent.length - 1](); };
  const clips = [clip(), clip({ id: "en-needs-2" }), clip({ id: "en-needs-3" })];
  const report = await runManifest(manifest(clips), { send, base: BASE, read: async () => new Uint8Array([1]) });
  assert.equal(sent.length, 2, "nothing is sent after the day's limit");
  assert.deepEqual(report.clips.map((row) => [row.id, row.status, row.failure]), [
    ["en-needs-1", "failed", "network_error"], ["en-needs-2", "failed", "speech_limit_reached"], ["en-needs-3", "not_sent", "after speech_limit_reached"]]);
  assert.match(reportTable(report), /en-needs-3 \(not sent, after speech_limit_reached\)/u);
  let calls = 0;
  await assert.rejects(runManifest(manifest(clips), { send: async () => { calls++; return Response.json({ text: "x" }); }, base: BASE,
    read: async ({ id }) => { if (id === "en-needs-3") throw Error("ENOENT"); return new Uint8Array([1]); } }), { message: "clip_unreadable: en-needs-3" });
  assert.equal(calls, 0);
});
