// Writes synthetic clips of the prompts with macOS voices, and a manifest that labels every clip
// synthetic. They prove the speech harness end to end; they are never an accuracy result, because a
// generated voice is cleaner than any person's. macOS only (`say` and `afconvert`).
// Usage: node evaluation/speech/synthetic.mjs --out <folder outside the repository> [--languages en,pt-BR,es]
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const at = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const out = at("--out");
if (!out) {
  console.error("Usage: node evaluation/speech/synthetic.mjs --out <folder> [--languages en,pt-BR,es]");
  process.exit(2);
}
if (process.platform !== "darwin") {
  console.error("Synthetic clips need macOS's say and afconvert.");
  process.exit(2);
}
const languages = (at("--languages") ?? "en,pt-BR,es").split(",");
// One voice for each language, from those every Mac has. Swahili has none, so it is never synthetic.
const VOICES = { en: "Flo (English (US))", "pt-BR": "Flo (Portuguese (Brazil))", es: "Flo (Spanish (Mexico))" };
const { prompts } = JSON.parse(await readFile(new URL("./prompts.json", import.meta.url), "utf8"));
const folder = resolve(out);
await mkdir(folder, { recursive: true });

const clips = [];
for (const prompt of prompts.filter((p) => languages.includes(p.language))) {
  const voice = VOICES[prompt.language];
  if (!voice) continue;
  const aiff = join(folder, `${prompt.id}.aiff`), m4a = join(folder, `${prompt.id}.m4a`);
  // execFile passes each argument as it is, so the prompt text is never read by a shell.
  await run("say", ["-v", voice, "-o", aiff, prompt.text]);
  // AAC in MP4, as Safari records it, and small enough to send many.
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "32000", aiff, m4a]);
  await rm(aiff);
  const { stdout } = await run("afinfo", [m4a]);
  const seconds = Number(/estimated duration: ([\d.]+)/u.exec(stdout)?.[1]);
  clips.push({ id: prompt.id, file: `${prompt.id}.m4a`, language: prompt.language, reference: prompt.text, kind: "synthetic", voice: `macOS say: ${voice}`, conditions: "generated, no room", seconds: Math.round(seconds * 10) / 10 });
}
const manifest = {
  version: 1,
  // A set is its kind and a date, never free text: it reaches a public run's log.
  set: `synthetic-${new Date().toLocaleDateString("sv-SE")}`,
  recordedOn: new Date().toLocaleDateString("sv-SE"),
  consent: "None needed: generated voices, no person recorded. Not an accuracy result.",
  clips,
};
await writeFile(join(folder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${clips.length} synthetic clips and manifest.json to ${folder}.`);
