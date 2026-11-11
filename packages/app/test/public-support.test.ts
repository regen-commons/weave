import assert from "node:assert/strict";
import { test } from "node:test";
import { publicListingPage, publicListingReview, publicPublicationFeedback, publicReviewFacts } from "../src/partners/public-support-state.ts";
import { invitationDate, inviteToken, pendingInviteKey, pendingWorkspaceInvite, workspaceInvitations } from "../src/initiative/workspace-access-state.ts";

const workspace = "31000000-0000-4000-8000-000000000001";
const entry = "31000000-0000-4000-8000-000000000002";
const destination = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const listing = { $type: "com.regencommons.weave.supportListing", projectUri: `at://${destination}/org.hypercerts.collection/project`,
  kind: "offer", title: "Archive transcription", description: "Community recordings", capitalForms: ["cultural", "experiential"],
  status: "open", createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-11T00:00:00.000Z" };
const review = { reviewId: workspace, destination, audience: "public-atproto", expectedRevision: 3, expectedEntryRevision: 2, record: listing };

test("public review binds saved revisions and repository, rejects private extras and maps plain facts", () => {
  const parsed = publicListingReview(review, 3, 2);
  const facts = publicReviewFacts(parsed);
  assert.deepEqual(facts.map(item => item.term), ["Listing", "Title", "Description", "Kind of support", "Availability", "First published", "Last updated", "Sharing ends", "Certified project"]);
  assert.equal(facts.find(item => item.term === "Kind of support")!.value, "Experiential, Cultural");
  assert.equal(facts.find(item => item.term === "First published")!.value, "10 November 2026");
  assert.doesNotMatch(JSON.stringify(facts), /\$type|capitalForms|createdAt|updatedAt/u);
  for (const changed of [
    { expectedRevision: 4 }, { expectedEntryRevision: 3 }, { audience: "weave_users" },
    { destination: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb" },
    { record: { ...listing, privateNotes: "must not be displayed" } },
    { record: { ...listing, createdAt: "2026-02-30T00:00:00Z" } },
    { record: { ...listing, capitalForms: [] } },
    { record: { ...listing, capitalForms: ["cultural", "cultural"] } },
  ]) assert.throws(() => publicListingReview({ ...review, ...changed }, 3, 2));
});

test("public state supports historical pages independently of ten current entries and rejects another workspace", () => {
  const rows = Array.from({ length: 11 }, (_, n) => ({ kind: "offer", entryId: `31000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`,
    status: "withdrawn", record: listing, problem: null, privateNotes: "server-only" }));
  const input = { workspaceId: workspace, listings: rows, nextCursor: "opaque-page" };
  const parsed = publicListingPage(input, workspace);
  assert.equal(parsed.listings.length, 11);
  assert.equal(parsed.nextCursor, "opaque-page");
  assert.doesNotMatch(JSON.stringify(parsed), /privateNotes|server-only/u);
  assert.throws(() => publicListingPage(input, entry));
  assert.throws(() => publicListingPage({ ...input, listings: [rows[0], rows[0]] }, workspace));
  assert.throws(() => publicListingPage({ ...input, listings: Array(101).fill(rows[0]) }, workspace));
  assert.equal(publicListingPage({ ...input, nextCursor: null }, workspace).nextCursor, null);
});

test("a public review names learning before publishing and rejects unknown or duplicated types of work", () => {
  const parsed = publicListingReview({ ...review, record: { ...listing, lenses: ["learning"] } }, 3, 2);
  assert.equal(publicReviewFacts(parsed).find(fact => fact.term === "Type of work")?.value, "Learning and education");
  for (const lenses of [["learning", "learning"], ["not-a-lens"]])
    assert.throws(() => publicListingReview({ ...review, record: { ...listing, lenses } }, 3, 2));
});

test("invitation summaries keep capabilities and internal fields out of review and validate dates, IDs and pages", () => {
  const input = { invitations: [{ inviteId: entry, status: "claimed", expiresAt: "2026-11-17T00:00:00Z",
    claimedDid: destination, token: "private-capability", tokenHash: "server-only", privateDocument: "private" }] };
  const result = workspaceInvitations(input);
  assert.equal(result.invitations[0]!.claimedDid, destination);
  assert.equal(invitationDate(result.invitations[0]!.expiresAt), "17 November 2026");
  assert.doesNotMatch(JSON.stringify(result), /token|server-only|privateDocument/u);
  for (const changed of [{ status: "unknown" }, { expiresAt: "invalid" }, { inviteId: "bad-id" }, { claimedDid: "another identity" }])
    assert.throws(() => workspaceInvitations({ invitations: [{ ...input.invitations[0], ...changed }] }));
  assert.throws(() => workspaceInvitations({ invitations: [input.invitations[0], input.invitations[0]] }));
  assert.throws(() => workspaceInvitations({ ...input, cursor: workspace }));
  assert.equal(inviteToken("a".repeat(43)), true);
  assert.equal(inviteToken("a".repeat(42)), false);
  assert.equal(inviteToken("#invite=" + "a".repeat(43)), false);
});


test("pending public writes request the permission for the actual stored operation", () => {
  assert.equal(publicPublicationFeedback("withdrawal_pending", "project_consent_required").consent, "withdraw-support");
  assert.equal(publicPublicationFeedback("publish_pending", "authorization_required").consent, "publish-support");
  const blocked = publicPublicationFeedback("withdrawal_pending", "support_group_lifecycle_unverified");
  assert.equal(blocked.consent, null);
  assert.match(blocked.notice, /paused/u);
  const forbidden = publicPublicationFeedback("withdrawal_pending", "forbidden");
  assert.equal(forbidden.consent, null);
  assert.match(forbidden.notice, /original publisher/u);
  assert.equal(publicPublicationFeedback("published", null).consent, null);
});


test("an invitation survives repeated account initialization when device storage is unavailable", () => {
  const token="A".repeat(43);let hash=`#invite=${token}`,hidden=0;
  const unavailable=()=>{throw Error("storage_unavailable");};
  const hide=()=>{hidden++;hash="";};
  for(let n=0;n<2;n++) assert.deepEqual(pendingWorkspaceInvite(hash,unavailable,hide),{token,persisted:false});
  assert.equal(hidden,0);assert.equal(hash,`#invite=${token}`);
});

test("persisting an invitation precedes removing its fragment and supports a signed-in remount", () => {
  const token="A".repeat(43),held=new Map<string,string>();let hash=`#invite=${token}`;
  const storage={getItem:(key:string)=>held.get(key)??null,setItem:(key:string,value:string)=>{held.set(key,value);}};
  const hide=()=>{assert.equal(held.get(pendingInviteKey),token);hash="";};
  assert.deepEqual(pendingWorkspaceInvite(hash,()=>storage,hide),{token,persisted:true});
  assert.deepEqual(pendingWorkspaceInvite(hash,()=>storage,hide),{token,persisted:true});
});
