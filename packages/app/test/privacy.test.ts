// The words about data are checked against what the code does. A sentence here changes only with
// the code that makes it true.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CERTIFIED_FACTS, DATA_POLICY, SIGN_IN, STORAGE_SUMMARY } from "../src/data/privacy.ts";
import { accountDocument } from "../src/account/document.ts";

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
  // The session really renews for up to 30 days and ends after 14 idle ones, as the policy says.
  assert.match(read("../api/src/account-session.ts"), /SESSION_CAP_SECONDS = 30 \* 24 \* 60 \* 60;/u);
  assert.match(read("../api/src/account-http.ts"), /RENEWAL_SECONDS = 14 \* 24 \* 60 \* 60;/u);
  assert.match(policy, /You stay signed in for up to 30 days, unless you sign out or do not open Weave for 14 days/u);
  assert.doesNotMatch(policy + " " + Object.values(SIGN_IN).join(" "), /session cookie for up to one hour|This session lasts up to one hour/u);
  // The project permission is what the server grants: reading for the session, changes to Certified for an hour.
  const grants = read("../api/src/certified-project-auth.ts");
  assert.match(grants, /const grantTtl = 3600;/u);
  assert.match(grants, /const readGrantTtl = SESSION_CAP_SECONDS;/u);
  assert.match(grants, /const readOnlyAction = "membership";/u);
  assert.match(policy, /reads your Certified projects and the groups you belong to for as long as you stay signed in/u);
  assert.match(policy, /check that you belong to a group before you save to its team workspace or manage its invitations/u);
  assert.match(policy, /keeps that permission, encrypted, for up to 30 days, and cannot use it after you sign out/u);
  assert.match(policy, /creating a project, adding a member, or publishing or withdrawing a listing, asks Certified again, and that permission lasts up to one hour/u);
  // Where the second question comes without a second press, the policy and the page both say so first.
  assert.match(policy, /Signing in on Your Initiatives goes on to that question, and the page says so first/u);
  assert.match(read("src/pages/YourInitiatives.tsx"), /Certified will ask to confirm it is you, then to let Weave read your projects for as long as you stay signed in/u);
  assert.match(read("src/describe/cloud.ts"), /throw/u);
  assert.match(policy, /No words are sent to a cloud model/u);
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
    assert.doesNotMatch(source, /session lasts up to|stay signed in on this browser for up to/u, file);
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
  // Saving sends the same things the summary lists, and the session is as long as the policy states.
  for (const kept of ["checked card", "needs", "offers", "funding details"]) assert.match(SIGN_IN.saved, new RegExp(kept, "u"), kept);
  assert.match(SIGN_IN.saved, /Conversations, files, unfinished edits and assistant records stay on this device/u);
  assert.match(SIGN_IN.session, /up to 30 days, or 14 days without opening Weave/u);
  assert.match(CERTIFIED_FACTS.map(([, answer]) => answer).join(" "), /separate permission on Certified\. It lasts for as long as you stay signed in/u);
});

test("what the copy says about talking is what the speech code does", () => {
  const talking = summary.get("Talking and the assistant")!;
  assert.match(talking, /Weave never receives your voice/u);
  assert.match(talking, /only after you agree/u);
  assert.match(policy, /Weave asks before the first time, and you can turn it off in Settings/u);
  assert.doesNotMatch(everything, /Google|Apple|Microsoft/u, "Weave cannot know whose speech service a browser uses");
  // The browser's service needs the agreement, and only the device mode asks to stay on the device.
  const speech = read("src/describe/speech.ts");
  assert.match(speech, /mode === "browser" && !consent\?\.agreed\(\)/u);
  assert.match(speech, /if \(mode === "device"\) session\.processLocally = true/u);
  assert.match(read("src/pages/Settings.tsx"), /deviceConsent\(\)\.withdraw\(\)/u);
  // Weave itself never touches audio: no capture, recording or upload anywhere in the app.
  for (const path of ["src/describe/speech.ts", "src/describe/speech-setup.ts", "src/describe/speech-consent.ts", "src/pages/Describe.tsx", "src/pages/AskStep.tsx", "src/ui/TalkItOut.tsx"])
    assert.doesNotMatch(read(path), /getUserMedia|MediaRecorder|AudioContext|AudioWorklet|fetch\(/u, path);
});
