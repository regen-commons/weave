// The public finish to the intake (QA notes, 25 November 2026): the plan survives sign-in and Certified's
// screens, the preview is the server's exact review, one confirmation publishes each reviewed listing once,
// and every retry sends the same request, so a listing is never published twice or from an unreviewed revision.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record } from "@weave/api/account-contract";
import { parseMatchingState } from "@weave/api/matching-contract";
import { AccountFailure } from "../src/account/client.ts";
import { loadedDraft } from "../src/account/document.ts";
import { revise } from "../src/describe/contracts.ts";
import {
  adoptPlan, clearPlan, matchesPreview, needsPermission, newPlan, nextStep, PLAN_LIFETIME_MS, projectFromDraft, projectNameFits, publishCommand,
  publishPreview, readPlan, resultLine, resultsSummary, writePlan, type PreviewListing, type PublishPlan,
} from "../src/initiative/publish-plan.ts";
import { newTid, TID } from "../src/initiative/tid.ts";
import { possibleDuplicate } from "../src/initiative/possible-duplicate.ts";
import { checkListings, createProject, prepareListings, PreviewProblem, publishListings, type PublishRequests } from "../src/initiative/publish-run.ts";
import { accountFixture, fixtureSession } from "../dev/account-fixture.ts";
import { matchingFixture, projectEvidenceFixture, refreshFixturePublicList, setFixturePublishPermission } from "../dev/matching-fixture.ts";
import { publicInitiativeFixture } from "../dev/public-fixture.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const origin = "http://localhost:5176";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const needId = document.needs[0]!.id, offerId = document.offers[0]!.id;
const projectUri = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mfixturegard";
/** The account example's need and offer as the preview shows them. */
const preview: PreviewListing[] = [
  { kind: "need", entryId: needId, title: "Seedlings and tools", description: null, capitalForms: [...document.needs[0]!.value.capitalForms as string[]] },
  { kind: "offer", entryId: offerId, title: "Water mapping workshop", description: null, capitalForms: [...document.offers[0]!.value.capitalForms as string[]] },
];
const plain = (plan: PublishPlan): PublishPlan => ({ ...plan, confirmed: true });

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key) };
}

/** The dev handlers behind the two endpoints the runner uses, for one synthetic account. */
function fixtureRequests(token: string, lose?: { afterSending: (body: Record<string, unknown>) => boolean }) {
  const call = async (handler: (request: Request) => Promise<Response>, endpoint: string, body: unknown) => {
    const response = await handler(new Request(`${origin}${endpoint}`, { method: "POST", body: JSON.stringify(body),
      headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` } }));
    const result = record(await response.json());
    if (!response.ok) throw new AccountFailure(String(result.error));
    return result;
  };
  const project = projectEvidenceFixture(origin) as unknown as (request: Request) => Promise<Response>;
  const requests: PublishRequests = {
    async project(body) {
      const result = await call(project, "/api/projects", body);
      // The server did the work; the answer is lost on the way back.
      if (lose?.afterSending(body)) throw new AccountFailure("connection_failed");
      return result;
    },
    matchingState: async (workspaceId) => parseMatchingState(await call(matchingFixture, "/api/matching", { action: "state", initiativeId: workspaceId })),
  };
  return { requests, call, project };
}

/** A saved card linked to the personal fixture project, as Prepare The Public Preview leaves it. */
async function linkedCard(account: string = crypto.randomUUID()) {
  const token = fixtureSession(account), id = crypto.randomUUID();
  const response = await accountFixture.POST(new Request(`${origin}/api/account`, { method: "POST",
    headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` },
    body: JSON.stringify({ action: "save", accountId: account, id, expectedRevision: 0, requestId: crypto.randomUUID(), document }) }));
  assert.equal(response.status, 200);
  const { requests, call, project } = fixtureRequests(token);
  const linked = await call(project, "/api/projects", { action: "link", projectUri, initiativeId: id, expectedRevision: 1 });
  assert.equal(linked.status, "linked");
  assert.equal(linked.workspaceId, id, "the card is the project's workspace");
  return { token, id, account, requests, call, project, saved: { revision: 1 } };
}

test("the preview is the card's kept needs and offers as their listings read, and the project comes from the card", () => {
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, updatedAt: "2026-11-25T00:00:00Z", document }, owner);
  const bare = revise(draft, { offers: { ...draft.offers, items: draft.offers.items.map((item) => ({ ...item, value: { ...item.value, capitalForms: [] } })) } });
  const { listings, withoutKind } = publishPreview(bare);
  assert.deepEqual(listings.map(({ kind, entryId, title, description }) => [kind, entryId, title, description]), [["need", needId, "Seedlings and tools", null]]);
  assert.deepEqual(withoutKind, [{ kind: "offer", entryId: offerId }], "an entry with no kind of support is left out, and said");
  let n = 0;
  const keys = () => newTid(1_795_000_000_000 + n++);
  const creation = projectFromDraft(draft, keys, "71000000-0000-4000-8000-000000000001")!;
  assert.deepEqual({ ...creation, projectRkey: TID.test(creation.projectRkey), locationRkey: TID.test(creation.locationRkey ?? "") }, {
    requestId: "71000000-0000-4000-8000-000000000001", projectRkey: true, locationRkey: true,
    title: "Synthetic river circle", description: "Restoring water and sharing skills", place: "Upper valley" });
  assert.notEqual(creation.projectRkey, creation.locationRkey);
  const nowhere = revise(draft, { confirmed: { ...draft.confirmed!, locations: [] } });
  assert.deepEqual([projectFromDraft(nowhere, keys)!.place, projectFromDraft(nowhere, keys)!.locationRkey], [null, null], "no place, no place record");
  assert.equal(projectFromDraft(revise(draft, { confirmed: null }), keys), null);
  // Certified takes a project name of up to 80 characters; a card holds 200, so the card is changed first.
  assert.equal(projectNameFits("a".repeat(80)), true);
  assert.equal(projectNameFits("e\u0301".repeat(80)), true, "characters are counted as a reader sees them");
  assert.equal(projectNameFits("👩🏽‍🌾".repeat(80)), false, "and the name stays within Certified's 800 bytes");
  assert.equal(projectNameFits("a".repeat(81)), false);
  assert.equal(projectNameFits("  "), false);
  assert.equal(projectFromDraft(revise(draft, { confirmed: { ...draft.confirmed!, name: "a".repeat(81) } }), keys), null);
  // Places become one line of whole places, up to 120 characters.
  const many = revise(draft, { confirmed: { ...draft.confirmed!, locations: ["North  ridge", "a".repeat(100), "South bank"] } });
  assert.equal(projectFromDraft(many, keys)!.place, "North ridge, " + "a".repeat(100), "a place that would not fit whole is left off");
});

test("the project made from the draft is created once, at keys chosen before sending, with Certified's permission", async () => {
  const token = fixtureSession(crypto.randomUUID()), signal = new AbortController().signal;
  let lost = 0;
  const { requests, call, project } = fixtureRequests(token, { afterSending: (body) => body.action === "create_personal_project" && lost++ === 0 });
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, updatedAt: "2026-11-25T00:00:00Z", document }, owner);
  const creation = projectFromDraft(draft, () => newTid())!;
  const plan = newPlan(draft.id, owner, preview, creation);
  setFixturePublishPermission("missing");
  await assert.rejects(createProject(plan, requests, signal), (error) => error instanceof AccountFailure && error.code === "project_consent_required",
    "without Certified's permission nothing is created, and the caller asks for it");
  setFixturePublishPermission("granted");
  await assert.rejects(createProject(plan, requests, signal), PreviewProblem, "the answer was lost after the project was made");
  const created = await createProject(plan, requests, signal);
  assert.match(created.projectUri ?? "", new RegExp(`^at://did:plc:[a-z2-7]{24}/org\\.hypercerts\\.collection/${creation.projectRkey}$`));
  assert.equal(await createProject(created, requests, signal), created, "a plan that has its project sends nothing");
  const own = record(await call(project, "/api/projects", { action: "list_projects", target: { kind: "personal" } }));
  const mine = (own.projects as { uri: string; title: string }[]).filter((item) => item.uri === created.projectUri);
  assert.deepEqual(mine.map((item) => item.title), ["Synthetic river circle"], "the retry made no second project");
  await assert.rejects(createProject({ ...plan, creation: { ...creation, title: "Another initiative" } }, requests, signal),
    (error) => error instanceof PreviewProblem && /different record/.test(error.message), "another draft at the same key is refused");
  // Weave's public pages come from its list of public projects, which takes in a new project at its daily update.
  const page = () => publicInitiativeFixture(new Request(`${origin}/api/public-initiative?uri=${encodeURIComponent(created.projectUri!)}`));
  assert.equal((await page()).status, 404, "no page before the list's update");
  refreshFixturePublicList();
  const shown = record(await (await page()).json());
  assert.equal(record(shown.project).name, "Synthetic river circle");
  assert.equal(record(shown.project).place, "Upper valley");
});

test("timestamp keys are valid, distinct and sort by time", () => {
  const first = newTid(1_795_000_000_000, () => 0.1), later = newTid(1_795_000_000_001, () => 0.1);
  assert.match(first, TID);
  assert.ok(first < later, "a later key sorts after an earlier one");
  assert.notEqual(newTid(), newTid());
});

test("a plan is kept through sign-in in the tab's storage, becomes the account's, and is never another account's", () => {
  const storage = memoryStorage(), draftId = crypto.randomUUID(), now = 1_800_000_000_000;
  const creation = { requestId: crypto.randomUUID(), projectRkey: newTid(), locationRkey: null, title: "Synthetic", description: "", place: null };
  const plan = newPlan(draftId, null, preview, creation, null, now);
  assert.equal(writePlan(storage, plan), true);
  assert.deepEqual(readPlan(storage, draftId, now + 1000), plan);
  assert.equal(nextStep(plan, { signedIn: false, linked: null, workspace: false }), "sign-in", "a press while signed out waits for sign-in");
  assert.equal(nextStep(plan, { signedIn: true, linked: null, workspace: false }), "preview", "after sign-in the preview is shown again, unconfirmed");
  const adopted = adoptPlan(plain(plan), owner)!;
  assert.equal(adopted.owner, owner);
  assert.equal(adoptPlan(adopted, crypto.randomUUID()), null, "another account never sees it");
  assert.equal(adoptPlan(adopted, null), null, "signed out, an account's plan is not shown");
  // After the confirmation the steps follow one another by themselves.
  assert.equal(nextStep(adopted, { signedIn: true, linked: null, workspace: false }), "create");
  const created = { ...adopted, projectUri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/" + creation.projectRkey };
  assert.equal(nextStep(created, { signedIn: true, linked: null, workspace: false }), "link");
  assert.equal(nextStep(created, { signedIn: true, linked: created.projectUri, workspace: false }), "save");
  assert.equal(nextStep(created, { signedIn: true, linked: created.projectUri, workspace: true }), "review");
  assert.equal(nextStep(null, { signedIn: true, linked: null, workspace: false }), "preview");
  // An old plan, one from the earlier version, or one that does not read as a plan, is removed rather than shown.
  assert.equal(readPlan(storage, draftId, now + PLAN_LIFETIME_MS + 1), null);
  assert.equal(storage.values.size, 0);
  storage.setItem(`weave-publish-plan/${draftId}`, JSON.stringify({ ...plan, version: 1 }));
  assert.equal(readPlan(storage, draftId, now), null);
  storage.setItem(`weave-publish-plan/${draftId}`, JSON.stringify({ ...plan, creation: { ...creation, projectRkey: "not-a-key" } }));
  assert.equal(readPlan(storage, draftId, now), null);
  assert.equal(storage.values.size, 0);
  assert.equal(writePlan(undefined, plan), false, "no storage says so, so a sign-in is not offered as if it would keep the place");
  clearPlan(storage, draftId);
});

test("a possible duplicate is found among the account's own projects first, then in the public list, including Ma Earth's", async () => {
  const signal = new AbortController().signal;
  const own = [{ uri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mown", name: "River Circle", links: [], group: "Valley keepers" }];
  const none = async () => [];
  assert.deepEqual(await possibleDuplicate({ name: "The River Circle", links: [] }, own, signal, none),
    { uri: own[0]!.uri, name: "River Circle", where: "yours", byline: "A project of Valley keepers on Certified.", path: null });
  const listed = [{ uri: "at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mfixturegard", name: "Seed Library of the Valley", passages: [],
    sharedAt: "2026-11-01T00:00:00.000Z", checkedAt: "2026-11-25T00:00:00.000Z", sourceUrl: "https://api.hypercerts.dev/x", publisher: "Ma Earth valley group" }];
  assert.deepEqual(await possibleDuplicate({ name: "Valley Seed Library", links: [] }, [], signal, async () => listed),
    { uri: listed[0]!.uri, name: "Seed Library of the Valley", where: "public", byline: "Shared by Ma Earth valley group.",
      path: "/initiatives/bbbbbbbbbbbbbbbbbbbbbbbb-3mfixturegard" });
  assert.equal(await possibleDuplicate({ name: "Coastal Kelp Watch", links: [] }, own, signal, async () => listed), null, "different names are no warning");
  assert.equal(await possibleDuplicate({ name: "Valley Seed Library", links: [] }, [], signal, async () => { throw Error("offline"); }), null,
    "a public list that cannot be read finds nothing there");
});

test("the preview is the server's exact review, and one confirmation publishes each listing once and reads it back", async () => {
  setFixturePublishPermission("granted");
  const { id, account, requests, call, project, saved } = await linkedCard();
  const storage = memoryStorage();
  let plan: PublishPlan = plain(newPlan(id, account, preview, null, projectUri));
  const signal = new AbortController().signal;
  plan = await prepareListings(plan, id, saved, requests, signal);
  assert.equal(nextStep(plan, { signedIn: true, linked: projectUri, workspace: true }), "publish");
  assert.deepEqual(plan.prepared.map((item) => [item.kind, item.review.record.title, item.review.record.projectUri, item.review.destination]), [
    ["need", "Seedlings and tools", projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["offer", "Water mapping workshop", projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
  ]);
  assert.equal(new Set(plan.prepared.map((item) => item.requestId)).size, 2, "each listing has its own request");
  assert.ok(plan.prepared.every((item) => matchesPreview(item, preview)), "each review is exactly what the preview showed");
  assert.equal(matchesPreview(plan.prepared[0]!, [{ ...preview[0]!, capitalForms: ["living"] }]), false, "a different kind of support is a different listing");
  // The plan round-trips through storage with its reviews, checked again on the way back.
  writePlan(storage, plan);
  assert.deepEqual(readPlan(storage, id), plan);

  const kept: PublishPlan[] = [];
  plan = await publishListings(plan, id, requests, signal, (next) => kept.push(next));
  assert.equal(kept[0]!.confirmed, true, "the confirmation is stored before anything is sent");
  assert.equal(kept.length, 3, "and each result as it arrives");
  assert.deepEqual(plan.results.map((result) => [result.kind, result.state]), [["need", "published"], ["offer", "published"]]);
  assert.equal(resultsSummary(plan.results), "All 2 listings are public, and Weave read each one back from your project's repository.");
  assert.equal(resultLine(plan.results[0]!), "Public. Weave read it back from your project's repository.");
  // While the second is still on its way, the summary never calls the work done.
  assert.equal(resultsSummary(plan.results.slice(0, 1), 2), "1 of 2 listings are confirmed public. 1 still is being sent.");
  // Sending the same confirmation again returns the same listing; nothing is published twice.
  const first = await call(project, "/api/projects", publishCommand(id, plan.prepared[0]!));
  const again = await call(project, "/api/projects", publishCommand(id, plan.prepared[0]!));
  assert.equal(first.rkey, again.rkey);
  assert.equal(((await call(project, "/api/projects", { action: "support_state", workspaceId: id })).listings as unknown[]).length, 2);
  assert.equal((await publishListings(plan, id, requests, signal, () => {})).results.length, 2, "a listing with a result is not sent again");
  assert.equal(nextStep(plan, { signedIn: true, linked: projectUri, workspace: true }), "done");
});

test("a lost answer is followed up with the same request, and a listing held for Certified's permission goes on once it is given", async () => {
  setFixturePublishPermission("missing");
  const { id, token, account, saved } = await linkedCard();
  const signal = new AbortController().signal;
  let lost = 0;
  const { requests, call, project } = fixtureRequests(token, { afterSending: (body) => body.action === "support_publish" && body.kind === undefined && lost++ === 0 });
  let plan = await prepareListings(plain(newPlan(id, account, preview, null, projectUri)), id, saved, requests, signal);
  plan = await publishListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => [result.state, result.problem]), [["unconfirmed", "connection_failed"], ["publish_pending", "authorization_required"]]);
  assert.equal(needsPermission(plan.results), true);
  assert.equal(resultLine(plan.results[0]!), "Weave could not confirm this one. Try again: the same request is sent, so it is never published twice.");
  assert.equal(resultLine(plan.results[1]!), "Waiting for Certified's permission to publish. Nothing is public yet.");
  setFixturePublishPermission("granted");
  plan = await checkListings(plan, id, requests, signal, () => {});
  // The lost request was the server's first and only one for the need, still held for permission; the check finds the offer published.
  assert.deepEqual(plan.results.map((result) => result.state), ["publish_pending", "published"]);
  plan = await checkListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => result.state), ["published", "published"]);
  const listings = (await call(project, "/api/projects", { action: "support_state", workspaceId: id })).listings as { status: string }[];
  assert.deepEqual(listings.map((listing) => listing.status), ["published", "published"], "two listings, never a duplicate");
});

test("a review the server no longer holds publishes nothing, and asks for a new preview of that entry only", async () => {
  setFixturePublishPermission("granted");
  const { id, account, requests, call, project, saved } = await linkedCard();
  const signal = new AbortController().signal;
  let plan = await prepareListings(plain(newPlan(id, account, preview, null, projectUri)), id, saved, requests, signal);
  // The need's review lapsed on the server before the confirmation reached it.
  plan = { ...plan, prepared: plan.prepared.map((item) => item.kind === "need" ? { ...item, review: { ...item.review, reviewId: crypto.randomUUID() } } : item) };
  plan = await publishListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => [result.kind, result.state]), [["need", "review_lapsed"], ["offer", "published"]]);
  assert.match(resultLine(plan.results[0]!), /nothing was published/u);
  assert.equal(((await call(project, "/api/projects", { action: "support_state", workspaceId: id })).listings as unknown[]).length, 1);
  plan = await prepareListings(plan, id, saved, requests, signal, plan.results.filter((result) => result.state === "review_lapsed"));
  assert.equal(plan.confirmed, true, "preparing again is part of the same confirmation");
  assert.deepEqual(plan.results.map((result) => result.kind), ["offer"], "the published offer keeps its result");
  plan = await publishListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => result.state).sort(), ["published", "published"]);
});

test("a preview is refused, with nothing published, for a changed card, a missing entry or an entry already public", async () => {
  setFixturePublishPermission("granted");
  const { id, account, requests, saved } = await linkedCard();
  const signal = new AbortController().signal;
  const plan = plain(newPlan(id, account, preview.slice(0, 1), null, projectUri));
  await assert.rejects(prepareListings(plan, id, { revision: 2 }, requests, signal), PreviewProblem);
  await assert.rejects(prepareListings(plain(newPlan(id, account, [{ ...preview[0]!, entryId: crypto.randomUUID() }], null, projectUri)), id, saved, requests, signal), PreviewProblem);
  // A card that changed since the preview: the server's review no longer matches, so nothing is published.
  await assert.rejects(prepareListings(plain(newPlan(id, account, [{ ...preview[0]!, title: "Something else" }], null, projectUri)), id, saved, requests, signal),
    (error) => { assert.ok(error instanceof PreviewProblem); assert.match(error.message, /differs from what you saw/u); return true; });
  const published = await publishListings(await prepareListings(plan, id, saved, requests, signal), id, requests, signal, () => {});
  assert.equal(published.results[0]!.state, "published");
  await assert.rejects(prepareListings(plan, id, saved, requests, signal), (error) => {
    assert.ok(error instanceof PreviewProblem);
    assert.match(error.message, /already public and must be withdrawn before it is published again\. Nothing was published\.$/u);
    return true;
  });
});
