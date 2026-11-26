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
  // What rides on the long permission is every Weave command that checks current membership, said in the person's terms.
  assert.match(policy, /check that you still belong to a group whenever you open or change its team workspace, its sharing, its invitations or who has access/u);
  assert.match(policy, /If Certified says you have left the group, Weave stops your access to that workspace/u);
  for (const file of ["workspace-content.ts", "workspace-invites.ts", "project-commands.ts"])
    assert.match(read(`../api/src/${file}`), /getMembership/u, `${file} still checks membership`);
  assert.match(read("../api/src/workspace-content.ts"), /if \(!role\) \{\s*await projects\.execute\(actor, "suspend_access"/u);
  assert.match(policy, /stores that permission encrypted on its server and can use it for up to 30 days\. Signing out ends it: Weave can no longer use it and deletes its stored copy\. If that deletion fails, the copy stays encrypted and unusable until it expires/u);
  // Exactly one action is long-lived, and it only reads the person's own memberships. Reading who else
  // is in a group is its own action, and so is every change to Certified, each under the hour.
  assert.match(grants, /\n  membership: \[membership\],/u);
  assert.match(grants, /"workspace-members": \[membership, memberList\],/u);
  for (const action of ["create-project", "add-member", "publish-support", "withdraw-support"])
    assert.match(grants, new RegExp(`"${action}": \\[membership, `, "u"), action);
  assert.match(grants, /return action === readOnlyAction \? readGrantTtl : grantTtl;/u);
  assert.match(policy, /Two things ask Certified again, for up to one hour each time: reading who else belongs to your group, and changing Certified itself/u);
  assert.match(policy, /with two cookies/u);
  assert.match(read("../api/src/sign-in.ts"), /cookies\.session\(session\.token, session\.expiresIn\),\s*cookies\.renewal\(/u);
  // Sign-out really does delete it: the account handler runs the project grants' removal before it revokes the session.
  assert.match(read("../api/src/account.ts"), /onSignOut: forgetProjectGrants/u);
  assert.match(grants, /async forget\(request: Request/u);
  assert.match(policy, /such as creating a project, adding a member, or publishing or withdrawing a listing/u);
  // Every sign-in but one to save goes on to that question (DL-137). The policy says so, and the pages
  // with room for a line say it before the press, in one shared sentence.
  assert.match(policy, /Signing in goes on to that question, except a sign-in to save a card/u);
  assert.match(SIGN_IN.projectsNext, /Certified will ask to confirm it is you, then to let Weave read your projects for as long as you stay signed in/u);
  assert.match(SIGN_IN.withProjects, /Certified then asks to let Weave read your projects for as long as you stay signed in/u);
  for (const file of ["src/pages/YourInitiatives.tsx", "src/pages/Settings.tsx"]) assert.match(read(file), /SIGN_IN\.projectsNext/u, file);
  assert.match(read("src/account/SignInButton.tsx"), /expectProjectAccess\(tab, window\.location\.pathname\)/u);
  // A sign-in to save returns to its card and says only that signing in identifies the person.
  const door = read("src/account/AccountSection.tsx");
  assert.match(door, /if \(forSaving\) forgetProjectAccess/u);
  assert.match(door, /forSaving \? SIGN_IN\.effect : SIGN_IN\.withProjects/u);
  assert.match(read("src/account/door.tsx"), /forSaving=\{intent === "keep"\}/u);
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
  assert.match(SIGN_IN.session, /up to 30 days\. If you do not open Weave for 14 days, you are signed out sooner/u);
  assert.match(CERTIFIED_FACTS.map(([, answer]) => answer).join(" "), /separate permission on Certified\. It lasts for as long as you stay signed in/u);
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
  assert.match(cloud, /if \(!consent\.agreed\(\)\) fail\(phase === "sending" \? "withdrawn-sending" : "withdrawn"\)/u);
  // One request asks whether it is on, one sends the recording, and neither carries a cookie.
  assert.equal((cloud.match(/await send\(/gu) ?? []).length, 2, "sent once: there is no second try");
  assert.equal((cloud.match(/credentials: "omit"/gu) ?? []).length, 2);
  // Only the person's Stop and the limit send. A recorder that stops by itself drops the recording.
  assert.match(cloud, /if \(phase === "recording"\) fail\("cloud-interrupted"\)/u);
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
    // The time limit sends it too, and both places say so before the person agrees.
    assert.match(line, /when you press Stop or the recording reaches its limit of (3|three) minutes at most/u);
  }
  assert.equal(CLOUD_SPEECH.maxSeconds, 180);
  assert.equal(CLOUD_SPEECH.provider, "Cloudflare Workers AI");
  assert.doesNotMatch(said, /Europe|EU\b|United States|never leaves/u, "no region is promised");
  assert.match(policy, /Where Weave offers cloud speech there, and only if you agree/u, "it is not offered everywhere");
  // Withdrawing is one press in Settings, and the two agreements are kept apart.
  assert.match(read("src/pages/Settings.tsx"), /deviceCloudConsent\(\)\.withdraw\(\)/u);
  assert.notEqual(CLOUD_SPEECH_KEY, BROWSER_SPEECH_KEY);
});

test("what the copy says about a connected assistant is what the MCP endpoint does", () => {
  const section = DATA_POLICY.find(({ title }) => title === "An AI Assistant You Connect")!.body.join(" ");
  // Everything the tool takes is named, not only the description.
  assert.match(section, /sends Weave your description and any topics, countries and kind of applicant it adds/u);
  assert.match(section, /on its server for that one answer, and does not store or log them/u);
  assert.match(section, /What your assistant keeps is up to that assistant, not Weave/u);
  assert.match(section, /This is separate from Weave's own assistant/u);
  // Weave's own assistant is a different thing, and what is said of it still holds.
  assert.match(policy, /The assistant sends no words to a cloud model/u);
  // The endpoint offers the tool the copy describes, and tells the assistant the same thing.
  const contract = read("../api/src/agent-tools-contract.ts");
  assert.match(contract, /name: "find_funds_for_initiative"/u);
  assert.match(contract, /it is not stored, logged or shared/u);
  // Its log line carries a tool's name, how the call ended and how long it took: no arguments, so no description.
  const http = read("../api/src/mcp-http.ts");
  assert.match(http, /export type McpLog = \(entry: \{ tool: string; outcome: [^;]+; ms: number \}\) => void;/u);
  assert.match(read("../api/src/mcp.ts"), /log: \(entry\) => console\.log\(JSON\.stringify\(\{ event: "mcp_tool", \.\.\.entry \}\)\),/u);
  // "countries" is another name for work_countries, which the copy's "countries" covers.
  for (const argument of ["description", "themes", "work_countries", "countries", "benefit_countries", "applicant_base_country", "registration_country", "applicant_type", "limit"])
    assert.match(contract, new RegExp(`"${argument}"`, "u"), argument);
  assert.match(contract, /fields\(input, \["description", "themes", "work_countries", "countries", "benefit_countries", "applicant_base_country", "registration_country", "applicant_type", "limit"\]\)/u,
    "the tool takes these and nothing else, which is what the copy lists");
  // The count the copy mentions is kept in memory, by address.
  assert.match(section, /counts requests by network address in its memory\. It does not save those counts/u);
  assert.match(read("../api/src/mcp-limit.ts"), /const callers = new Map<string, Count>\(\);/u);
  // This reads the source for the obvious ways to keep something. The behaviour itself, that a description never
  // reaches the answer or the log, is tested where the code runs, in @weave/api's mcp.test.ts.
  assert.match(read("../api/src/mcp.test.ts"), /a description never reaches the log or the console through the configured handler/u);
  // Nothing in the code that ranks, or that calls it, writes anywhere: no database, no file, no outbound request.
  assert.doesNotMatch(http, /console\.|writeFile|postgres|\bfetch\(/u);
  const tools = read("../api/src/agent-tools.ts");
  assert.doesNotMatch(tools, /\bfetch\(|writeFile|postgres|console\.|localStorage|\bsql`/u);
  // The other tools only read what is already public, as the copy says.
  assert.match(section, /search the fund list and the public initiatives, which anyone can read/u);
});

test("what the copy says about feedback is what the sheet and the server do", () => {
  const section = DATA_POLICY.find(({ title }) => title === "Feedback")!.body.join(" ");
  assert.match(section, /sends what you write, the kinds of feedback you pick and the address of the page you are on, without its search or filters/u);
  assert.match(section, /passes it to the Regen Commons website, which keeps it privately for the Regen Commons stewards/u);
  assert.match(section, /Your network address is not passed on\. Weave does not keep your feedback\. When the website does not confirm it, Weave logs the website's answer code and nothing else/u);
  assert.match(section, /counts feedback by network address in its memory\. It does not save those counts/u);
  // The sheet sends the three fields and the hidden one, and the page's path, which has no query.
  const send = read("src/feedback/send.ts");
  assert.match(send, /JSON\.stringify\(\{ message: draft\.message, categories, page_path: draft\.pathname, \[FEEDBACK\.honeypot\]: draft\.honeypot \}\)/u);
  assert.match(read("src/App.tsx"), /const \{ pathname, search \} = splitRoute\(location\);/u);
  // The server sends the website the feedback alone, with two headers of its own and no cookie, to one address.
  const server = read("../api/src/feedback.ts");
  assert.match(server, /headers: \{ "Content-Type": "application\/json", "Idempotency-Key": requestId \},\s*body: JSON\.stringify\(feedback\),\s*redirect: "error",\s*credentials: "omit",/u);
  assert.match(read("../api/src/feedback-contract.ts"), /upstream: "https:\/\/regencommons\.com\/api\/feedback",/u);
  assert.match(read("../api/src/feedback-contract.ts"), /return \{ message: text, categories: \[\.\.\.new Set\(categories\)\], page_path: page \};/u);
  // Its one log line is the website's status, and it writes nowhere.
  assert.match(server, /log = \(status\) => console\.warn\(JSON\.stringify\(\{ event: "feedback_upstream", status \}\)\)/u);
  assert.equal((server.match(/console\./gu) ?? []).length, 1);
  assert.doesNotMatch(server, /writeFile|postgres|localStorage|\bsql`/u);
  // The count is kept in memory, by address.
  assert.match(server, /limiter\.caller\(`feedback \$\{callerAddress\(request\)\}`/u);
  assert.match(read("../api/src/mcp-limit.ts"), /const callers = new Map<string, Count>\(\);/u);
  assert.match(read("../api/src/feedback.test.ts"), /only the feedback leaves: no cookie, no header of the person's, no redirect followed, one fixed address/u);
});
