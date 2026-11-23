// The words about data are checked against what the code does. A sentence here changes only with
// the code that makes it true.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CERTIFIED_FACTS, DATA_POLICY, SIGN_IN, STORAGE_SUMMARY } from "../src/data/privacy.ts";
import { accountDocument } from "../src/account/document.ts";
import { CLOUD_SPEECH } from "@weave/api/transcribe-contract";
import { BROWSER_SPEECH_KEY, CLOUD_SPEECH_KEY } from "../src/describe/speech-consent.ts";
import { CLOUD_SPEECH_NOTICE, SPEECH_SETTING } from "../src/describe/speech-setup.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const summary = new Map(STORAGE_SUMMARY);
const policy = DATA_POLICY.flatMap((section) => section.body).join(" ");
const everything = `${[...summary.values()].join(" ")} ${policy}`;

test("What we store and the data policy are two things: a short answer and the whole of it", () => {
  assert.ok(STORAGE_SUMMARY.length <= 6, "the summary stays short");
  for (const [, answer] of STORAGE_SUMMARY) assert.ok(answer.length <= 220, `one or two sentences: ${answer}`);
  assert.ok(DATA_POLICY.length > STORAGE_SUMMARY.length, "the policy says more");
  assert.equal(new Set(DATA_POLICY.map((section) => section.title)).size, DATA_POLICY.length);
});

test("who can read a saved copy is one statement, with the database's operators in it", () => {
  const who = summary.get("Who can read a saved copy")!;
  assert.match(who, /only you/u);
  assert.match(who, /teammates you give access/u);
  assert.match(who, /not encrypted/u);
  assert.match(who, /could read them/u);
  // The old copy said "private" in one sentence and "administrators can access" in the next.
  assert.doesNotMatch(everything, /Saved copies are private\./u);
  assert.doesNotMatch(everything, /private to you in the product/u);
});

test("the copy never says sign-in sends an email to Regen Commons, or that sharing is not connected", () => {
  assert.doesNotMatch(everything, /sends your email and code to Regen Commons/u);
  assert.doesNotMatch(everything, /not connected/u);
  assert.match(policy, /Certified handles your email address and the code/u);
  assert.match(policy, /Weave does not keep your email address/u);
  assert.match(policy, /Sharing for matching shows the needs and offers you pick/u);
  assert.match(policy, /Publishing on Certified creates a public record/u);
  // The session really is an hour at most, and the app really sends nothing to a cloud model.
  assert.match(read("../api/src/account-provider.ts") + read("../api/src/account-http.ts"), /3600/u);
  assert.match(policy, /session cookie for up to one hour/u);
  assert.match(read("src/describe/cloud.ts"), /throw/u);
  assert.match(policy, /The assistant sends no words to a cloud model/u);
});

test("what the copy says is saved is what a save sends", () => {
  assert.equal(typeof accountDocument, "function");
  const builder = read("src/account/document.ts");
  // Conversations, files and assistant records are not in the saved document.
  for (const kept of ["turns", "attachments", "runs", "composer"]) assert.doesNotMatch(builder.match(/export function accountDocument[\s\S]*?\n\}/u)?.[0] ?? "", new RegExp(`\\b${kept}\\b`, "u"), kept);
  assert.match(summary.get("When you save")!, /Conversations and files are not sent/u);
});

test("deletion is promised only as far as it exists", () => {
  assert.match(summary.get("Leaving")!, /Deleting a whole account is not available yet/u);
  assert.match(policy, /Deleting a whole account and downloading the copies saved in it are not available in Weave yet/u);
  assert.match(read("src/account/delete-card.ts"), /deletableCards/u, "one saved card can be deleted");
  assert.match(read("src/describe/device-removal.ts"), /backupDeleteWarning/u, "one device backup can be deleted");
});

test("the Certified explanation says what Weave learns, and that reading projects takes a separate permission", () => {
  const facts = new Map(CERTIFIED_FACTS);
  assert.match(facts.get("What Weave learns")!, /does not keep an email address/u);
  assert.doesNotMatch([...facts.values()].join(" "), /and nothing else/u, "with a project linked, Weave reads more than identity");
  assert.match(facts.get("Your projects")!, /separate permission/u);
});

test("what sign-in and saving do is written once and agrees with the policy", () => {
  // The sentences live in one place, and no page keeps a copy of its own that could drift.
  for (const file of ["src/account/AccountSection.tsx", "src/social/Door.tsx", "src/pages/YourInitiatives.tsx", "src/pages/Settings.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /only says who you are/u, file);
    assert.doesNotMatch(source, /stays private in Weave/u, file);
    assert.doesNotMatch(source, /lasts up to one hour/u, file);
  }
  for (const file of ["src/account/AccountSection.tsx", "src/social/Door.tsx", "src/pages/YourInitiatives.tsx"])
    assert.match(read(file), /SIGN_IN\./u, file);
  // The same reader the policy names, in the same words, with no bare "private".
  assert.match(SIGN_IN.offer, /only you can open what you save/u);
  assert.match(policy, /only you can open a saved copy/u);
  assert.doesNotMatch(Object.values(SIGN_IN).join(" "), /\bprivate\b/u);
  // Signing in moves nothing: the step that starts it saves no card and sends no document.
  assert.doesNotMatch(read("src/account/sign-in.ts"), /accountDocument|saveAccountCard/u);
  assert.match(SIGN_IN.effect, /Nothing is saved, loaded or shared until you choose it/u);
  // Saving sends the same things the summary lists, and the session is the same hour the policy states.
  for (const kept of ["checked card", "needs", "offers", "funding details"]) assert.match(SIGN_IN.saved, new RegExp(kept, "u"), kept);
  assert.match(SIGN_IN.saved, /Conversations, files, unfinished edits and assistant records stay on this device/u);
  assert.match(SIGN_IN.session, /up to one hour/u);
});

test("what the copy says about talking is what the speech code does", () => {
  const talking = summary.get("Talking and the assistant")!;
  assert.match(talking, /its own speech service only after you agree/u);
  assert.match(talking, /Weave receives a recording only if you agree to cloud speech, and does not keep it/u);
  assert.doesNotMatch(everything, /never receives your voice|does not record, keep or send your voice/u, "no longer true where a person agrees to cloud speech");
  assert.match(policy, /Weave asks before the first time, and you can turn it off in Settings/u);
  assert.doesNotMatch(everything, /Google|Apple|Microsoft/u, "Weave cannot know whose speech service a browser uses");
  // The browser's service needs the agreement, and only the device mode asks to stay on the device.
  const speech = read("src/describe/speech.ts");
  assert.match(speech, /mode === "browser" && !consent\?\.agreed\(\)/u);
  assert.match(speech, /if \(mode === "device"\) session\.processLocally = true/u);
  assert.match(read("src/pages/Settings.tsx"), /deviceConsent\(\)\.withdraw\(\)/u);
  // Outside cloud speech, Weave never touches audio: no capture, recording or upload.
  for (const path of ["src/describe/speech.ts", "src/describe/speech-setup.ts", "src/describe/speech-consent.ts", "src/pages/Describe.tsx", "src/pages/AskStep.tsx", "src/ui/TalkItOut.tsx"])
    assert.doesNotMatch(read(path), /getUserMedia|MediaRecorder|AudioContext|AudioWorklet|fetch\(/u, path);
});

test("what the copy says about cloud speech is what the recorder and the server do", () => {
  // The one module that records is the cloud speech session, and nothing else in the app does.
  const sources = readdirSync(fileURLToPath(new URL("../src", import.meta.url)), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/u.test(name))
    .map((name) => `src/${name}`);
  const recording = sources.filter((path) => /getUserMedia|new recorder\(|MediaRecorder\b/u.test(read(path)));
  assert.deepEqual(recording, ["src/describe/speech-cloud.ts"]);
  const cloud = read("src/describe/speech-cloud.ts");
  // Nothing records before the agreement, and the recording is kept nowhere on the device.
  assert.match(cloud, /if \(!consent\?\.agreed\(\)\) throw/u);
  assert.match(cloud, /if \(!consent\.agreed\(\)\) fail\("withdrawn"\)/u);
  assert.doesNotMatch(cloud, /localStorage|sessionStorage|indexedDB|caches\.|createObjectURL|download/u);
  // It goes to Weave's own server and nowhere else, as the content security policy also holds.
  assert.equal(CLOUD_SPEECH.path, "/api/transcribe");
  assert.doesNotMatch(cloud, /https?:\/\//u);
  assert.match(read("vercel.json"), /connect-src 'self'/u);
  // The server passes it to the one named provider and writes nothing down.
  const server = read("../api/src/transcribe.ts") + read("../api/src/transcribe-provider.ts");
  assert.match(server, /api\.cloudflare\.com\/client\/v4\/accounts/u);
  assert.equal((server.match(/https?:\/\/[^\s"`]+/gu) ?? []).length, 1, "one outbound address");
  assert.doesNotMatch(server, /console\.|writeFile|appendFile|insert into|\.query\(|supabase/iu);
  // The copy names that provider, says what Weave can vouch for and what only the provider can, and no place.
  const said = [...CLOUD_SPEECH_NOTICE.body, SPEECH_SETTING.cloudAgreed, policy].join(" ");
  for (const line of [CLOUD_SPEECH_NOTICE.body.join(" "), policy]) {
    assert.match(line, /Cloudflare Workers AI/u);
    assert.match(line, /Weave does not keep the recording/u);
    assert.match(line, /Cloudflare says it does not keep (it|them) or use (it|them) to train models/u);
    assert.match(line, /may be processed outside your country/u);
    assert.match(line, /turn (this|it) off in Settings/u);
  }
  assert.equal(CLOUD_SPEECH.provider, "Cloudflare Workers AI");
  assert.doesNotMatch(said, /Europe|EU\b|United States|never leaves/u, "no region is promised");
  assert.match(policy, /Where Weave offers cloud speech there, and only if you agree/u, "it is not offered everywhere");
  // Withdrawing is one press in Settings, and the two agreements are kept apart.
  assert.match(read("src/pages/Settings.tsx"), /deviceCloudConsent\(\)\.withdraw\(\)/u);
  assert.notEqual(CLOUD_SPEECH_KEY, BROWSER_SPEECH_KEY);
});
