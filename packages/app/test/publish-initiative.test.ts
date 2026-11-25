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
  adoptPlan, clearPlan, needsPermission, newPlan, PLAN_LIFETIME_MS, publishCandidates, publishCommand, publishStep, readPlan,
  resultLine, resultsSummary, reviewsCurrent, writePlan, type PublishPlan,
} from "../src/initiative/publish-plan.ts";
import { checkListings, prepareListings, PreviewProblem, publishListings, type PublishRequests } from "../src/initiative/publish-run.ts";
import { accountFixture, fixtureSession } from "../dev/account-fixture.ts";
import { matchingFixture, projectEvidenceFixture, setFixturePublishPermission } from "../dev/matching-fixture.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const origin = "http://localhost:5176";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const needId = document.needs[0]!.id, offerId = document.offers[0]!.id;
const projectUri = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mfixturegard";

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

test("the choice lists the card's kept needs and offers, and only those with a kind of support can be published", () => {
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, updatedAt: "2026-11-25T00:00:00Z", document }, owner);
  const bare = revise(draft, { offers: { ...draft.offers, items: draft.offers.items.map((item) => ({ ...item, value: { ...item.value, capitalForms: [] } })) } });
  assert.deepEqual(publishCandidates(bare).map(({ kind, entryId, title, publishable }) => [kind, entryId, title, publishable]), [
    ["need", needId, "Seedlings and tools", true],
    ["offer", offerId, "Water mapping workshop", false],
  ]);
});

test("a plan is kept through sign-in in the tab's storage, becomes the account's, and is never another account's", () => {
  const storage = memoryStorage(), draftId = crypto.randomUUID(), now = 1_800_000_000_000;
  const plan = newPlan(draftId, null, [{ kind: "need", entryId: needId }], now);
  assert.equal(writePlan(storage, plan), true);
  assert.deepEqual(readPlan(storage, draftId, now + 1000), plan);
  assert.equal(publishStep(plan, { signedIn: false, project: null }), "sign-in");
  const adopted = adoptPlan(plan, owner)!;
  assert.equal(adopted.owner, owner);
  assert.equal(adoptPlan(adopted, crypto.randomUUID()), null, "another account never sees it");
  assert.equal(adoptPlan(adopted, null), null, "signed out, an account's plan is not shown");
  assert.equal(publishStep(adopted, { signedIn: true, project: null }), "project");
  assert.equal(publishStep(adopted, { signedIn: true, project: { uri: projectUri, group: "A group" } }), "group");
  assert.equal(publishStep(adopted, { signedIn: true, project: { uri: projectUri, group: null } }), "prepare");
  assert.equal(publishStep(null, { signedIn: true, project: null }), "choose");
  // An old plan, or one that does not read as a plan, is removed rather than shown.
  assert.equal(readPlan(storage, draftId, now + PLAN_LIFETIME_MS + 1), null);
  assert.equal(storage.values.size, 0);
  storage.setItem(`weave-publish-plan/${draftId}`, JSON.stringify({ ...plan, selected: [{ kind: "need", entryId: "not-an-id" }] }));
  assert.equal(readPlan(storage, draftId, now), null);
  assert.equal(storage.values.size, 0);
  assert.equal(writePlan(undefined, plan), false, "no storage says so, so a sign-in is not offered as if it would keep the choice");
  clearPlan(storage, draftId);
});

test("the preview is the server's exact review, and one confirmation publishes each listing once and reads it back", async () => {
  setFixturePublishPermission("granted");
  const { id, account, requests, call, project, saved } = await linkedCard();
  const storage = memoryStorage();
  let plan: PublishPlan = newPlan(id, account, [{ kind: "need", entryId: needId }, { kind: "offer", entryId: offerId }]);
  const signal = new AbortController().signal;
  plan = await prepareListings(plan, id, saved, requests, signal);
  assert.equal(publishStep(plan, { signedIn: true, project: { uri: projectUri, group: null } }), "review");
  assert.deepEqual(plan.prepared.map((item) => [item.kind, item.review.record.title, item.review.record.projectUri, item.review.destination]), [
    ["need", "Seedlings and tools", projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["offer", "Water mapping workshop", projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
  ]);
  assert.equal(new Set(plan.prepared.map((item) => item.requestId)).size, 2, "each listing has its own request");
  assert.equal(reviewsCurrent(plan, saved, projectUri), true);
  assert.equal(reviewsCurrent(plan, { revision: 2 }, projectUri), false, "a saved card that changed needs a new preview");
  assert.equal(reviewsCurrent(plan, saved, `${projectUri}x`), false, "so does another project");
  assert.equal(reviewsCurrent(plan, saved, projectUri, Date.parse(plan.prepared[0]!.reviewExpiresAt)), false, "and a lapsed review");
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
});

test("a lost answer is followed up with the same request, and a listing held for Certified's permission goes on once it is given", async () => {
  setFixturePublishPermission("missing");
  const { id, token, account, saved } = await linkedCard();
  const signal = new AbortController().signal;
  let lost = 0;
  const { requests, call, project } = fixtureRequests(token, { afterSending: (body) => body.action === "support_publish" && body.kind === undefined && lost++ === 0 });
  let plan = await prepareListings(newPlan(id, account, [{ kind: "need", entryId: needId }, { kind: "offer", entryId: offerId }]), id, saved, requests, signal);
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
  let plan = await prepareListings(newPlan(id, account, [{ kind: "need", entryId: needId }, { kind: "offer", entryId: offerId }]), id, saved, requests, signal);
  // The need's review lapsed on the server before the confirmation reached it.
  plan = { ...plan, prepared: plan.prepared.map((item) => item.kind === "need" ? { ...item, review: { ...item.review, reviewId: crypto.randomUUID() } } : item) };
  plan = await publishListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => [result.kind, result.state]), [["need", "review_lapsed"], ["offer", "published"]]);
  assert.match(resultLine(plan.results[0]!), /nothing was published/u);
  assert.equal(((await call(project, "/api/projects", { action: "support_state", workspaceId: id })).listings as unknown[]).length, 1);
  plan = await prepareListings(plan, id, saved, requests, signal, plan.results.filter((result) => result.state === "review_lapsed"));
  assert.equal(plan.confirmed, false);
  assert.deepEqual(plan.results.map((result) => result.kind), ["offer"], "the published offer keeps its result");
  plan = await publishListings(plan, id, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => result.state).sort(), ["published", "published"]);
});

test("a preview is refused, with nothing published, for a changed card, a missing entry or an entry already public", async () => {
  setFixturePublishPermission("granted");
  const { id, account, requests, saved } = await linkedCard();
  const signal = new AbortController().signal;
  const plan = newPlan(id, account, [{ kind: "need", entryId: needId }]);
  await assert.rejects(prepareListings(plan, id, { revision: 2 }, requests, signal), PreviewProblem);
  await assert.rejects(prepareListings(newPlan(id, account, [{ kind: "need", entryId: crypto.randomUUID() }]), id, saved, requests, signal), PreviewProblem);
  const published = await publishListings(await prepareListings(plan, id, saved, requests, signal), id, requests, signal, () => {});
  assert.equal(published.results[0]!.state, "published");
  await assert.rejects(prepareListings(plan, id, saved, requests, signal), (error) => {
    assert.ok(error instanceof PreviewProblem);
    assert.match(error.message, /already public and must be withdrawn before it is published again\. Nothing was published\.$/u);
    return true;
  });
});
