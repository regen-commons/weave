// The public finish to the intake (QA notes, 25 November 2026; DL-155): the plan survives sign-in and Certified's
// screens, the preview is the server's exact review of what the draft holds, one confirmation publishes each
// reviewed listing once, nothing is saved privately on the way, and every retry sends the same request, so a
// listing is never published twice or from fields the person did not see.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record } from "@weave/api/account-contract";
import { AccountFailure } from "../src/account/client.ts";
import { loadedDraft } from "../src/account/document.ts";
import { revise } from "../src/describe/contracts.ts";
import {
  adoptPlan, clearPlan, DRAFT_REVISION, matchesPreview, needsPermission, newPlan, nextStep, PLAN_LIFETIME_MS, projectFromDraft, projectNameFits,
  publishCommand, publishPreview, readPlan, resultLine, resultsSummary, reviewCommand, settledResults, writePlan, type PreviewListing, type PublishPlan,
} from "../src/initiative/publish-plan.ts";
import { newTid, TID } from "../src/initiative/tid.ts";
import { projectListings } from "../src/initiative/project-listings.ts";
import { possibleDuplicate } from "../src/initiative/possible-duplicate.ts";
import {
  checkListings, createProject, linkForPublishing, prepareListings, PreviewProblem, publishListings, type PublishRequests,
} from "../src/initiative/publish-run.ts";
import { fixtureInitiative, fixtureSession } from "../dev/account-fixture.ts";
import { projectEvidenceFixture, refreshFixturePublicList, setFixturePublishPermission } from "../dev/matching-fixture.ts";
import { publicInitiativeFixture } from "../dev/public-fixture.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const origin = "http://localhost:5176";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const needId = document.needs[0]!.id, offerId = document.offers[0]!.id;
const projectUri = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mfixturegard";
const groupProjectUri = "at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/watershed";
/** A personal fixture project no account here has linked in Weave. */
const grouplessUnlinked = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/water-notes";
/** The account example's need and offer as the preview shows them, from a card whose type of work is place-based. */
const preview: PreviewListing[] = [
  { kind: "need", entryId: needId, title: "Seedlings and tools", description: null,
    capitalForms: [...document.needs[0]!.value.capitalForms as string[]], lenses: ["place_based"] },
  { kind: "offer", entryId: offerId, title: "Water mapping workshop", description: "Monthly, for local growers.",
    capitalForms: [...document.offers[0]!.value.capitalForms as string[]], lenses: ["place_based"] },
];
const plain = (plan: PublishPlan): PublishPlan => ({ ...plan, confirmed: true });

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key) };
}

/**
 * The dev handler behind the one endpoint the runner uses, for one synthetic account, with every body it was
 * sent. `change` alters an answer on its way back, and `lose` drops one after the server did the work.
 */
function fixtureRequests(token: string, options: {
  lose?: (body: Record<string, unknown>) => boolean;
  change?: (body: Record<string, unknown>, answer: Record<string, unknown>) => Record<string, unknown>;
} = {}) {
  const sent: Record<string, unknown>[] = [];
  const call = async (endpoint: string, body: unknown) => {
    const response = await project(new Request(`${origin}${endpoint}`, { method: "POST", body: JSON.stringify(body),
      headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` } }));
    const result = record(await response.json());
    if (!response.ok) throw new AccountFailure(String(result.error));
    return result;
  };
  const project = projectEvidenceFixture(origin) as unknown as (request: Request) => Promise<Response>;
  const requests: PublishRequests = {
    async project(body) {
      sent.push(body);
      const result = await call("/api/projects", body);
      // The server did the work; the answer is lost on the way back.
      if (options.lose?.(body)) throw new AccountFailure("connection_failed");
      return options.change ? options.change(body, result) : result;
    },
  };
  return { requests, call, sent };
}

/** A confirmed plan for a draft no one saved, linked in Weave to the personal fixture project, as the link step leaves it. */
async function linkedDraft(account: string = crypto.randomUUID(), options: Parameters<typeof fixtureRequests>[1] = {}) {
  const token = fixtureSession(account), signal = new AbortController().signal;
  const { requests, call, sent } = fixtureRequests(token, options);
  const plan = await linkForPublishing(plain(newPlan(crypto.randomUUID(), account, preview, null, projectUri)), requests, signal);
  assert.ok(plan.workspaceId);
  return { token, account, requests, call, sent, signal, plan, workspaceId: plan.workspaceId };
}

test("the preview is the card's kept needs and offers as their listings read, and the project comes from the card", () => {
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, updatedAt: "2026-11-25T00:00:00Z", document }, owner);
  const bare = revise(draft, { offers: { ...draft.offers, items: draft.offers.items.map((item) => ({ ...item, value: { ...item.value, capitalForms: [] } })) } });
  const { listings, withoutKind } = publishPreview(bare);
  assert.deepEqual(listings.map(({ kind, entryId, title, description, lenses }) => [kind, entryId, title, description, lenses]),
    [["need", needId, "Seedlings and tools", null, []]]);
  assert.deepEqual(withoutKind, [{ kind: "offer", entryId: offerId }], "an entry with no kind of support is left out, and said");
  // Each listing carries the card's types of work, which the preview shows.
  const placed = revise(draft, { confirmed: { ...draft.confirmed!, lenses: ["place_based", "research"] } });
  assert.deepEqual(publishPreview(placed).listings.map((item) => item.lenses), [["place_based", "research"], ["place_based", "research"]]);
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
  assert.equal(projectNameFits("é".repeat(80)), true, "characters are counted as a reader sees them");
  assert.equal(projectNameFits("👩🏽‍🌾".repeat(80)), false, "and the name stays within Certified's 800 bytes");
  assert.equal(projectNameFits("a".repeat(81)), false);
  assert.equal(projectNameFits("  "), false);
  assert.equal(projectFromDraft(revise(draft, { confirmed: { ...draft.confirmed!, name: "a".repeat(81) } }), keys), null);
  // Places become one line of whole places, up to 120 characters.
  const many = revise(draft, { confirmed: { ...draft.confirmed!, locations: ["North  ridge", "a".repeat(100), "South bank"] } });
  assert.equal(projectFromDraft(many, keys)!.place, "North ridge, " + "a".repeat(100), "a place that would not fit whole is left off");
});

test("a review sends the need or offer exactly as the preview showed it, and only its public fields", () => {
  const workspaceId = crypto.randomUUID();
  assert.deepEqual(reviewCommand(workspaceId, preview[0]!), { action: "support_review", workspaceId, kind: "need", entryId: needId, expiresAt: null,
    entry: { title: "Seedlings and tools", capitalForms: preview[0]!.capitalForms, lenses: ["place_based"] } }, "no description is sent empty");
  assert.deepEqual(reviewCommand(workspaceId, { ...preview[1]!, lenses: [] }).entry,
    { title: "Water mapping workshop", description: "Monthly, for local growers.", capitalForms: ["experiential", "intellectual"] },
    "and no types of work when the card names none");
});

test("the project made from the draft is created once, at keys chosen before sending, with Certified's permission", async () => {
  const token = fixtureSession(crypto.randomUUID()), signal = new AbortController().signal;
  let lost = 0;
  const { requests, call } = fixtureRequests(token, { lose: (body) => body.action === "create_personal_project" && lost++ === 0 });
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
  const own = record(await call("/api/projects", { action: "list_projects", target: { kind: "personal" } }));
  const mine = (own.projects as { uri: string; title: string }[]).filter((item) => item.uri === created.projectUri);
  assert.deepEqual(mine.map((item) => item.title), ["Synthetic river circle"], "the retry made no second project");
  await assert.rejects(createProject({ ...plan, creation: { ...creation, title: "Another initiative" } }, requests, signal),
    (error) => error instanceof PreviewProblem && /different record/.test(error.message), "another draft at the same key is refused");
  // The project Weave just made links in Weave with no saved card, and is not listed as a saved workspace.
  const linked = await linkForPublishing(plain(created), requests, signal);
  assert.ok(linked.workspaceId);
  assert.throws(() => fixtureInitiative(token, linked.workspaceId!), "no saved card stands behind the link");
  const workspaces = record(await call("/api/projects", { action: "list_workspaces" })).workspaces as { projectUri: string }[];
  assert.equal(workspaces.some((item) => item.projectUri === created.projectUri), false);
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
  assert.equal(nextStep(plan, { signedIn: false, linked: null }), "sign-in", "a press while signed out waits for sign-in");
  assert.equal(nextStep(plan, { signedIn: true, linked: null }), "preview", "after sign-in the preview is shown again, unconfirmed");
  const adopted = adoptPlan(plain(plan), owner)!;
  assert.equal(adopted.owner, owner);
  assert.equal(adoptPlan(adopted, crypto.randomUUID()), null, "another account never sees it");
  assert.equal(adoptPlan(adopted, null), null, "signed out, an account's plan is not shown");
  // After the confirmation the steps follow one another by themselves, with no private save among them.
  assert.equal(nextStep(adopted, { signedIn: true, linked: null }), "create");
  const created = { ...adopted, projectUri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/" + creation.projectRkey };
  assert.equal(nextStep(created, { signedIn: true, linked: null }), "link");
  assert.equal(nextStep(created, { signedIn: true, linked: created.projectUri }), "link", "the card is linked, and Weave not yet");
  const linked = { ...created, workspaceId: crypto.randomUUID() };
  assert.equal(nextStep(linked, { signedIn: true, linked: null }), "link", "Weave is linked, and the card on this device not yet");
  assert.equal(nextStep(linked, { signedIn: true, linked: created.projectUri }), "review");
  assert.equal(nextStep(null, { signedIn: true, linked: null }), "preview");
  writePlan(storage, linked);
  assert.deepEqual(readPlan(storage, draftId, now), linked, "the link is kept with the plan");
  // An old plan, one from an earlier version, or one that does not read as a plan, is removed rather than shown.
  assert.equal(readPlan(storage, draftId, now + PLAN_LIFETIME_MS + 1), null);
  assert.equal(storage.values.size, 0);
  for (const old of [{ ...plan, version: 2 }, { ...plan, creation: { ...creation, projectRkey: "not-a-key" } },
    { ...linked, workspaceId: "not-a-workspace" }, { ...linked, projectUri: null }, { ...plan, preview: [{ ...preview[0]!, lenses: undefined }] }]) {
    storage.setItem(`weave-publish-plan/${draftId}`, JSON.stringify(old));
    assert.equal(readPlan(storage, draftId, now), null);
    assert.equal(storage.values.size, 0);
  }
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

test("the project is linked in Weave once, for its own person, and a group project is not linked this way", async () => {
  const token = fixtureSession(crypto.randomUUID()), signal = new AbortController().signal;
  let lost = 0;
  const { requests } = fixtureRequests(token, { lose: (body) => body.action === "link" && lost++ === 0 });
  const plan = plain(newPlan(crypto.randomUUID(), owner, preview, null, projectUri));
  await assert.rejects(linkForPublishing(plan, requests, signal), PreviewProblem, "the answer was lost after the link was made");
  const linked = await linkForPublishing(plan, requests, signal);
  assert.equal((await linkForPublishing({ ...plan, workspaceId: null }, requests, signal)).workspaceId, linked.workspaceId,
    "a retry finds the same link, never a second one");
  assert.equal(await linkForPublishing(linked, requests, signal), linked, "a plan with its link sends nothing");
  await assert.rejects(linkForPublishing({ ...plan, projectUri: groupProjectUri }, requests, signal), PreviewProblem);
  await assert.rejects(linkForPublishing({ ...plan, projectUri: null }, requests, signal), /lost track of the project/u);
  // An answer for another project, or one that does not grant publishing, links nothing.
  for (const changed of [{ projectUri: groupProjectUri }, { accessRole: "editor" }, { status: "access_required" }, { workspaceId: "w" }]) {
    const { requests: odd } = fixtureRequests(token, { change: (_body, answer) => ({ ...answer, ...changed }) });
    await assert.rejects(linkForPublishing(plan, odd, signal), PreviewProblem);
  }
});

test("a draft no one saved publishes: the preview is the server's exact review, and one confirmation publishes each listing once", async () => {
  setFixturePublishPermission("granted");
  let { plan, requests, call, sent, signal, workspaceId, token } = await linkedDraft();
  const storage = memoryStorage();
  plan = await prepareListings(plan, requests, signal);
  assert.equal(nextStep(plan, { signedIn: true, linked: projectUri }), "publish");
  assert.deepEqual(plan.prepared.map((item) => [item.kind, item.review.record.title, item.review.record.description ?? null,
    item.review.record.lenses, item.review.record.projectUri, item.review.destination]), [
    ["need", "Seedlings and tools", null, ["place_based"], projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["offer", "Water mapping workshop", "Monthly, for local growers.", ["place_based"], projectUri, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
  ]);
  assert.equal(new Set(plan.prepared.map((item) => item.requestId)).size, 2, "each listing has its own request");
  assert.ok(plan.prepared.every((item) => matchesPreview(item, preview)), "each review is exactly what the preview showed");
  assert.equal(matchesPreview(plan.prepared[0]!, [{ ...preview[0]!, capitalForms: ["living"] }]), false, "a different kind of support is a different listing");
  assert.equal(matchesPreview(plan.prepared[0]!, [{ ...preview[0]!, lenses: [] }]), false, "and so are different types of work");
  // The plan round-trips through storage with its reviews, checked again on the way back.
  writePlan(storage, plan);
  assert.deepEqual(readPlan(storage, plan.draftId), plan);

  const kept: PublishPlan[] = [];
  plan = await publishListings(plan, requests, signal, (next) => kept.push(next));
  assert.equal(kept[0]!.confirmed, true, "the confirmation is stored before anything is sent");
  assert.equal(kept.length, 3, "and each result as it arrives");
  assert.deepEqual(plan.results.map((result) => [result.kind, result.state]), [["need", "published"], ["offer", "published"]]);
  assert.equal(resultsSummary(plan.results), "All 2 listings are public, and Weave read each one back from your project's repository.");
  assert.equal(resultLine(plan.results[0]!), "Public. Weave read it back from your project's repository.");
  // While the second is still on its way, the summary never calls the work done.
  assert.equal(resultsSummary(plan.results.slice(0, 1), 2), "1 of 2 listings are confirmed public. 1 still is being sent.");
  // Sending the same confirmation again returns the same listing; nothing is published twice.
  const first = await call("/api/projects", publishCommand(workspaceId, plan.prepared[0]!));
  const again = await call("/api/projects", publishCommand(workspaceId, plan.prepared[0]!));
  assert.equal(first.rkey, again.rkey);
  assert.equal(((await call("/api/projects", { action: "support_state", workspaceId })).listings as unknown[]).length, 2);
  assert.equal((await publishListings(plan, requests, signal, () => {})).results.length, 2, "a listing with a result is not sent again");
  assert.equal(nextStep(plan, { signedIn: true, linked: projectUri }), "done");
  // Nothing was saved privately on the way: only the project link, the reviews and the publications were sent.
  assert.deepEqual(sent.map((body) => body.action),
    ["link", "support_state", "support_review", "support_review", "support_publish", "support_publish"]);
  assert.ok(sent.filter((body) => body.action === "support_review").every((body) => !("expectedRevision" in body) && "entry" in body));
  assert.throws(() => fixtureInitiative(token, workspaceId), "no saved card stands behind the published listings");
});

test("a lost answer is followed up with the same request, and a listing held for Certified's permission goes on once it is given", async () => {
  setFixturePublishPermission("missing");
  let lost = 0;
  let { plan, requests, call, signal, workspaceId } = await linkedDraft(undefined,
    { lose: (body) => body.action === "support_publish" && body.reviewId !== undefined && lost++ === 0 });
  plan = await prepareListings(plan, requests, signal);
  plan = await publishListings(plan, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => [result.state, result.problem]), [["unconfirmed", "connection_failed"], ["publish_pending", "authorization_required"]]);
  assert.equal(needsPermission(plan.results), true);
  assert.equal(resultLine(plan.results[0]!), "Weave could not confirm this one. Try again: the same request is sent, so it is never published twice.");
  assert.equal(resultLine(plan.results[1]!), "Waiting for Certified's permission to publish. Nothing is public yet.");
  setFixturePublishPermission("granted");
  plan = await checkListings(plan, requests, signal, () => {});
  // The lost request was the server's first and only one for the need, still held for permission; the check finds the offer published.
  assert.deepEqual(plan.results.map((result) => result.state), ["publish_pending", "published"]);
  plan = await checkListings(plan, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => result.state), ["published", "published"]);
  const listings = (await call("/api/projects", { action: "support_state", workspaceId })).listings as { status: string }[];
  assert.deepEqual(listings.map((listing) => listing.status), ["published", "published"], "two listings, never a duplicate");
});

test("a review the server no longer holds publishes nothing, and asks for a new preview of that entry only", async () => {
  setFixturePublishPermission("granted");
  let { plan, requests, call, signal, workspaceId } = await linkedDraft();
  plan = await prepareListings(plan, requests, signal);
  // The need's review lapsed on the server before the confirmation reached it.
  plan = { ...plan, prepared: plan.prepared.map((item) => item.kind === "need" ? { ...item, review: { ...item.review, reviewId: crypto.randomUUID() } } : item) };
  plan = await publishListings(plan, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => [result.kind, result.state]), [["need", "review_lapsed"], ["offer", "published"]]);
  assert.match(resultLine(plan.results[0]!), /nothing was published/u);
  assert.equal(((await call("/api/projects", { action: "support_state", workspaceId })).listings as unknown[]).length, 1);
  plan = await prepareListings(plan, requests, signal, plan.results.filter((result) => result.state === "review_lapsed"));
  assert.equal(plan.confirmed, true, "preparing again is part of the same confirmation");
  assert.deepEqual(plan.results.map((result) => result.kind), ["offer"], "the published offer keeps its result");
  plan = await publishListings(plan, requests, signal, () => {});
  assert.deepEqual(plan.results.map((result) => result.state).sort(), ["published", "published"]);
});

test("a preview is refused, with nothing published, for an unlinked plan, an entry not seen, an altered review or one already public", async () => {
  setFixturePublishPermission("granted");
  const { plan, requests, call, signal, workspaceId, token } = await linkedDraft();
  const one = { ...plan, preview: preview.slice(0, 1) };
  await assert.rejects(prepareListings({ ...one, workspaceId: null }, requests, signal), /not linked in Weave yet/u);
  await assert.rejects(publishListings({ ...one, workspaceId: null }, requests, signal, () => {}), PreviewProblem);
  await assert.rejects(prepareListings(one, requests, signal, [{ kind: "offer", entryId: offerId }]), /not in what you saw/u);
  // The server's review must be the draft's own: one naming a saved revision, another project or other fields is not.
  for (const [label, alter] of [
    ["a saved revision", (answer: Record<string, unknown>) => ({ ...answer, expectedRevision: 3 })],
    ["a saved entry revision", (answer: Record<string, unknown>) => ({ ...answer, expectedEntryRevision: 2 })],
    ["another title", (answer: Record<string, unknown>) => ({ ...answer, record: { ...record(answer.record), title: "Something else" } })],
    ["other types of work", (answer: Record<string, unknown>) => ({ ...answer, record: { ...record(answer.record), lenses: ["research"] } })],
    ["another project", (answer: Record<string, unknown>) => ({ ...answer, record: { ...record(answer.record),
      projectUri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mfixtureelse" } })],
  ] as const) {
    const { requests: altered } = fixtureRequests(token, { change: (body, answer) => body.action === "support_review" ? alter(answer) : answer });
    await assert.rejects(prepareListings(one, altered, signal), PreviewProblem, label);
  }
  assert.equal(DRAFT_REVISION, 0);
  assert.equal(((await call("/api/projects", { action: "support_state", workspaceId })).listings as unknown[]).length, 0, "nothing was published");
  const published = await publishListings(await prepareListings(one, requests, signal), requests, signal, () => {});
  assert.equal(published.results[0]!.state, "published");
  // Editing the draft leaves the public listing as it is: publishing the need again waits for its withdrawal.
  const edited = { ...one, preview: [{ ...preview[0]!, title: "Seedlings, tools and gloves" }], prepared: [], results: [] };
  await assert.rejects(prepareListings(edited, requests, signal), (error) => {
    assert.ok(error instanceof PreviewProblem);
    assert.equal(error.message, "Already public with other details, or still being published or withdrawn: Seedlings, tools and gloves. "
      + "Withdraw it under Public Listings first, then make it public again. Nothing was published.");
    return true;
  });
  const listings = (await call("/api/projects", { action: "support_state", workspaceId })).listings as { record: { title: string } }[];
  assert.deepEqual(listings.map((listing) => listing.record.title), ["Seedlings and tools"]);
  // Withdrawn from another browser of the same account, it publishes again with the edited details.
  const elsewhere = fixtureRequests(fixtureSession(plan.owner!));
  assert.equal((await elsewhere.call("/api/projects", { action: "support_withdraw", workspaceId, kind: "need", entryId: needId,
    requestId: crypto.randomUUID() })).status, "withdrawn");
  const republished = await publishListings(await prepareListings(edited, requests, signal), requests, signal, () => {});
  assert.deepEqual(republished.results.map((result) => [result.title, result.state]), [["Seedlings, tools and gloves", "published"]]);
  const [first] = published.prepared, [second] = republished.prepared;
  assert.equal(second!.review.record.createdAt, first!.review.record.createdAt, "publishing again keeps the listing's first date");
  const after = (await call("/api/projects", { action: "support_state", workspaceId })).listings as { rkey: string }[];
  assert.equal(after.length, 1, "and its address");
});

test("a need or offer already public as shown is kept as it is, one added beside it is published, and one no longer open is left out", async () => {
  setFixturePublishPermission("granted");
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, updatedAt: "2026-11-25T00:00:00Z", document }, owner);
  const met = revise(draft, { needs: { ...draft.needs, items: draft.needs.items.map((item) => ({ ...item, value: { ...item.value, status: "met" as const } })) } });
  const { listings, closed } = publishPreview(met);
  assert.deepEqual(closed, [{ kind: "need", entryId: needId }], "a need marked met is never published as open");
  assert.deepEqual(listings.map((item) => item.kind), ["offer"]);

  let { plan, requests, call, sent, signal, workspaceId } = await linkedDraft();
  plan = await publishListings(await prepareListings(plan, requests, signal), requests, signal, () => {});
  const added: PreviewListing = { kind: "need", entryId: crypto.randomUUID(), title: "Volunteer drivers", description: null,
    capitalForms: ["social"], lenses: ["place_based"] };
  // Making it public again, later, with one more need: the two already public as shown are not sent again.
  let again = await linkForPublishing(plain(newPlan(plan.draftId, plan.owner, [...preview, added], null, projectUri)), requests, signal);
  assert.equal(again.workspaceId, workspaceId);
  sent.length = 0;
  again = await prepareListings(again, requests, signal);
  assert.deepEqual(again.unchanged, [{ kind: "need", entryId: needId }, { kind: "offer", entryId: offerId }]);
  assert.deepEqual(again.prepared.map((item) => item.entryId), [added.entryId]);
  assert.deepEqual(sent.map((body) => body.action), ["support_state", "support_review"], "only the new need is reviewed");
  assert.equal(nextStep(again, { signedIn: true, linked: projectUri }), "publish");
  const storage = memoryStorage();
  writePlan(storage, again);
  assert.deepEqual(readPlan(storage, again.draftId), again, "what is already public is kept with the plan");
  again = await publishListings(again, requests, signal, () => {});
  assert.equal(nextStep(again, { signedIn: true, linked: projectUri }), "done");
  assert.equal(resultsSummary(settledResults(again), again.prepared.length + again.unchanged.length),
    "All 3 listings are public, and Weave read each one back from your project's repository.");
  assert.equal(((await call("/api/projects", { action: "support_state", workspaceId })).listings as unknown[]).length, 3,
    "three listings, never a second copy of one");
  // With nothing new, making it public again sends nothing and is done at once.
  const nothing = await prepareListings(await linkForPublishing(plain(newPlan(plan.draftId, plan.owner, preview, null, projectUri)), requests, signal),
    requests, signal);
  assert.equal(nothing.prepared.length, 0);
  assert.equal(nextStep(nothing, { signedIn: true, linked: projectUri }), "done");
});

test("a draft's public listings are found by the project alone, withdrawn from another browser, and then show no row", async () => {
  setFixturePublishPermission("granted");
  let { plan, requests, signal, workspaceId } = await linkedDraft();
  const request = (body: Record<string, unknown>, abort: AbortSignal) => requests.project(body, abort);
  assert.equal(await projectListings(grouplessUnlinked, request, signal), null, "a project Weave has no link to shows nothing");
  assert.equal(await projectListings(projectUri, request, signal), null, "nor one with nothing public yet");
  plan = await publishListings(await prepareListings(plan, requests, signal), requests, signal, () => {});
  assert.deepEqual(await projectListings(projectUri, request, signal), { workspaceId, line: "2 needs and offers public on Certified." });
  // Another browser signed in to the same account needs no draft and no saved card: the project finds the listings.
  const elsewhere = fixtureRequests(fixtureSession(plan.owner!)).requests;
  const there = await projectListings(projectUri, (body, abort) => elsewhere.project(body, abort), signal);
  assert.equal(there?.workspaceId, workspaceId);
  await elsewhere.project({ action: "support_withdraw", workspaceId, kind: "need", entryId: needId, requestId: crypto.randomUUID() }, signal);
  assert.equal((await projectListings(projectUri, request, signal))?.line, "1 need or offer public on Certified.");
  await elsewhere.project({ action: "support_withdraw", workspaceId, kind: "offer", entryId: offerId, requestId: crypto.randomUUID() }, signal);
  assert.equal(await projectListings(projectUri, request, signal), null, "with everything withdrawn the row goes");
  // Someone else's account has its own link to the shared fixture project and sees none of these.
  const stranger = fixtureRequests(fixtureSession(crypto.randomUUID())).requests;
  assert.equal(await projectListings(projectUri, (body, abort) => stranger.project(body, abort), signal), null);
});
