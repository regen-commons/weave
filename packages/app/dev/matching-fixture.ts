/** Development only. Real HTTP command parsing over ephemeral, fictional matching data. */
import { createMatchingHandlers } from "@weave/api/matching";
import {
  parseMatchingPreview, parseMatchingSearch, matchingCandidateId,
  type MatchingEntryRef, type MatchingEntryState, type MatchingLead, type MatchingPreview, type MatchingState,
} from "@weave/api/matching-contract";
import { PARTNER_ENGINE_VERSION, rankPartnerMatches, type ProjectEvidence, type SharedPartnerEntry } from "@weave/api/partner-matcher";
import { parseTeamDocument, type AccountDocument, type JsonObject, type SavedInitiative } from "@weave/api/account-contract";
import { createProjectHandler } from "../../api/src/project-http.ts";
import { sessionCookies } from "../../api/src/account-http.ts";
import { AccountError } from "../../api/src/account-provider.ts";
import { FIXTURE_ACCOUNT_ID, fixtureActor, fixtureDeleted, fixtureInitiative, fixtureReferences } from "./account-fixture.ts";
import accountExample from "../../api/src/test-data/account.json" with { type: "json" };

const DAY = 86_400_000;
const conflict = (): never => { throw new AccountError(409, "matching_conflict"); };
const entryKey = ({ kind, entryId }: Pick<MatchingEntryRef, "kind" | "entryId">) => `${kind}:${entryId}`;
type Row = MatchingEntryState & { value: JsonObject; summary: JsonObject | null; reviewedRevision: number | null };
type RecordState = { account: string; revision: number; entries: Map<string, Row> };
const cards = new Map<string, RecordState>();
const reviews = new Map<string, { preview: MatchingPreview; until: number }>();
const requests = new Map<string, { input: string; response: MatchingState | { initiativeId: string; leads: MatchingLead[] } }>();
const privateLeads = new Map<string, Map<string, MatchingLead>>();

function reconcile(account: string, saved: SavedInitiative) {
  const previous = cards.get(saved.id);
  if (previous?.revision === saved.revision) return previous;
  const entries = new Map<string, Row>();
  for (const kind of ["need", "offer"] as const) {
    for (const { id: entryId, value } of saved.document[kind === "need" ? "needs" : "offers"]) {
      const key = entryKey({ kind, entryId });
      const old = previous?.entries.get(key);
      const changed = old && JSON.stringify(old.value) !== JSON.stringify(value);
      entries.set(key, {
        kind, entryId, value, status: value.status as Row["status"],
        revision: (old?.revision ?? 0) + (old && !changed ? 0 : 1),
        shareVersion: old?.shareVersion ?? 0,
        sharing: changed && old.sharing === "shared" ? "needs_review" : old?.sharing ?? "private",
        confirmedAt: old?.confirmedAt ?? null, expiresAt: old?.expiresAt ?? null,
        reviewedRevision: old?.reviewedRevision ?? null, summary: old?.summary ?? null,
      });
    }
  }
  const result = { account, revision: saved.revision, entries };
  cards.set(saved.id, result);
  return result;
}

function entryState({ value: _value, summary: _summary, reviewedRevision: _reviewed, ...state }: Row): MatchingEntryState {
  return {
    ...state, sharing: state.sharing === "shared" && state.expiresAt !== null && Date.parse(state.expiresAt) <= Date.now() ? "expired" : state.sharing,
  };
}

function projection(initiativeId: string, row: Row): SharedPartnerEntry[] {
  if (entryState(row).sharing !== "shared" || row.status !== "open" || !row.summary || !row.confirmedAt) return [];
  const { kind, entryId, revision, value, summary, confirmedAt, expiresAt } = row;
  return [{ initiativeId, kind, entryId, revision, value, summary, confirmedAt, expiresAt }];
}

function reviewSummary({ initiative }: AccountDocument) {
  const { name, description, locations, isGlobal, lenses, themes } = initiative;
  return { name, description, locations, isGlobal, lenses, themes };
}

const sourceUri = "at://did:plc:weave-matching-fixture/org.hypercerts.collection/stream-surveys";
const publicEvidence: ProjectEvidence[] = [{
  id: "local-stream-surveys",
  projectUri: sourceUri,
  projectName: "Stream Survey Lab (fixture)",
  sourceUri,
  sourceUrl: "https://example.org/stream-survey-fixture",
  cid: "fictional-cid",
  contentHash: "fixture-v1",
  fieldPath: "/description",
  passage: "The Stream Survey Lab runs GPS watershed mapping, cartography and environmental monitoring workshops in Vermont.",
  sourceCreatedAt: "2026-10-01T00:00:00Z",
  sourceIndexedAt: null,
  fetchedAt: "2026-11-08T00:00:00Z",
  extractionVersion: "local-fixture",
  kind: "work",
}];
export const FIXTURE_TEAM_ID = "31000000-0000-4000-8000-000000000001";
export const FIXTURE_TEAM_EDITOR = "31000000-0000-4000-8000-000000000002";
export const FIXTURE_SECOND_TEAM_ID = "31000000-0000-4000-8000-000000000003";
export const FIXTURE_SECOND_EDITOR = "31000000-0000-4000-8000-000000000004";
export const FIXTURE_TEAM_ADMIN = "31000000-0000-4000-8000-000000000005";
export const FIXTURE_GROUP_MEMBER = "31000000-0000-4000-8000-000000000006";
export const FIXTURE_UNAVAILABLE = "31000000-0000-4000-8000-000000000007";
export const FIXTURE_PROJECT_STARTER = "31000000-0000-4000-8000-000000000008";
const teamRoles = new Map([[FIXTURE_ACCOUNT_ID, "viewer"], [FIXTURE_TEAM_EDITOR, "editor"], [FIXTURE_TEAM_ADMIN, "admin"]]);
const groupDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const groupUri = `at://${groupDid}/org.hypercerts.collection/watershed`;
const personalDid = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const personalUri = `at://${personalDid}/org.hypercerts.collection/water-notes`;
/**
 * A personal project whose public description names one need and one offer, as a project made on Ma Earth
 * or Certified often does. Linking it suggests both in pencil, which is how the 23 November 2026 release
 * blocker arose: the person saw them on the card while matching, which compares kept entries, had none.
 */
// A timestamp record key, as Certified gives one, so the project has a public address (/initiatives/<did>-<key>).
const gardenUri = `at://${personalDid}/org.hypercerts.collection/3mfixturegard`;
/** The one fixture project with a public address, which the public list and its page show in development. */
export const FIXTURE_PUBLIC_PROJECT_URI = gardenUri;
const memberGroup = "did:plc:cccccccccccccccccccccccc";
const memberUri = `at://${memberGroup}/org.hypercerts.collection/seed-library`;
const project = (uri: string, title: string, group?: string, source: Record<string, unknown> = {}) => ({ uri, cid: "bafyfixture", repoDid: uri.split("/")[2],
  ...(group ? { groupDid: group } : {}), title, description: "A fictional local project for learning and watershed monitoring.", createdAt: "2026-11-01T00:00:00Z", ...source });
// Place and publisher links as Certified's source gives them: named, or a place Weave could not read (coordinates only).
const fixtureProjects = [
  project(groupUri, "Watershed Team (fixture)", groupDid,
    { place: { status: "named", name: "Lower river meadows (fixture)" }, publisherLinks: ["https://watershed.example.org/"] }),
  project(memberUri, "Seed library (fixture)", memberGroup,
    { place: { status: "named", name: "Upper valley seed house (fixture)" }, publisherLinks: ["https://seeds.example.org/"] }),
  project(personalUri, "Water notes (fixture)", undefined, { place: { status: "unread" } }),
  project(gardenUri, "Garden commons (fixture)", undefined, {
    description: "A fictional community garden run by neighbours. We need watershed mapping training for our volunteers. We offer seedlings to local schools.",
    place: { status: "named", name: "Upper valley (fixture)" },
  }),
];
/**
 * Personal projects made from a draft by `create_personal_project`, as project-commands.ts answers it: one
 * per record key, the same answer for a retry of the same draft, a conflict for anything else at that key.
 * Each lives in a repository named after its fixture account. Nothing reaches Certified.
 */
type CreatedProject = ReturnType<typeof project> & { readonly place?: { readonly status: "named"; readonly name: string } };
const createdProjects = new Map<string, { owner: string; project: CreatedProject }>();
/** The created projects Weave's public list has picked up, as the daily refresh would. */
let listedCreated = new Set<string>();
/** Development control: the daily public-list refresh, which picks up the projects created since the last one. */
export function refreshFixturePublicList() { listedCreated = new Set(createdProjects.keys()); }
/** The created projects in the public list, for the public fixture's list and pages. */
export function fixtureListedProjects(): CreatedProject[] {
  return [...createdProjects.values()].filter(({ project }) => listedCreated.has(project.uri)).map(({ project }) => project);
}
const ownProjects = (owner: string) => [...createdProjects.values()].filter((item) => item.owner === owner).map((item) => item.project);
/** A did:plc for a fixture account's own repository: its ID's hex digits written as base-32 letters. */
const accountRepository = (owner: string) => `did:plc:${[...owner.replaceAll("-", "")].slice(0, 24).map((digit) => "abcdefghijklmnop"[parseInt(digit, 16)]).join("")}`;
function createPersonalProject(owner: string, command: { projectRkey: string; title: string; description: string; place?: { rkey: string; name: string } }) {
  if (publishPermission === "missing") throw new AccountError(403, "project_consent_required");
  const uri = `at://${accountRepository(owner)}/org.hypercerts.collection/${command.projectRkey}`;
  const place = command.place?.name ?? null;
  const existing = createdProjects.get(uri);
  if (existing && (existing.owner !== owner || existing.project.title !== command.title
    || existing.project.description !== command.description || (existing.project.place?.name ?? null) !== place))
    throw new AccountError(409, "project_conflict");
  if (!existing) createdProjects.set(uri, { owner, project: { ...project(uri, command.title), description: command.description,
    cid: fixtureCid(), createdAt: new Date().toISOString(), ...(place ? { place: { status: "named", name: place } as const } : {}) } });
  return { status: "created", projectUri: uri, cid: createdProjects.get(uri)!.project.cid };
}
const externalGroup = "did:plc:ffffffffffffffffffffffff";
const externalProject = project(`at://${externalGroup}/org.hypercerts.collection/editor-return`, "Editor return project (fixture)", externalGroup);
let externalPublished = false;
let externalWorkspace: string | null = null;
/** Explicit local editor stand-in. Never writes to Certified or Ma Earth. */
export function publishFixtureProject(owner: string) {
  if (owner !== FIXTURE_PROJECT_STARTER) throw new AccountError(403, "workspace_admin_required");
  externalPublished = true;
}
const invitations = new Map<string, { inviteId: string; status: string; expiresAt: string; claimedDid?: string; claimedHandle?: string }>([
  ["41000000-0000-4000-8000-000000000001", { inviteId: "41000000-0000-4000-8000-000000000001", status: "pending", expiresAt: "2027-01-01T00:00:00Z" }],
  ["41000000-0000-4000-8000-000000000002", { inviteId: "41000000-0000-4000-8000-000000000002", status: "claimed", expiresAt: "2027-01-01T00:00:00Z", claimedDid: "did:plc:dddddddddddddddddddddddd", claimedHandle: "orchard.certified.one" }],
  ["41000000-0000-4000-8000-000000000003", { inviteId: "41000000-0000-4000-8000-000000000003", status: "claimed", expiresAt: "2027-01-01T00:00:00Z", claimedDid: "did:plc:eeeeeeeeeeeeeeeeeeeeeeee" }],
]);
const fixtureInvites = new Map<string, string>();
const requested = new Set<string>();
/**
 * Personal project links, by account and project URI, to the linked card's ID. Every fixture account sees the
 * same personal project, so each keeps its own link, as each person's own project would have one.
 */
const soloLinks = new Map<string, string>();
/** The personal links made to publish from a draft, with no saved card behind them (DL-155). */
const cardlessLinks = new Set<string>();
// Deletion refuses a card that a project link or a support listing still refers to, as the database does.
// Its sharing for matching and its saved partners go with it (weave-initiative-deletion-stale-references.sql).
fixtureReferences((id) => [...soloLinks.values()].includes(id)
  || [...supportRows.values()].some((row) => row.workspaceId === id));
// A deleted card's entries leave matching and its own partners go with it; other people's partners naming
// it stay theirs and read as unavailable.
fixtureDeleted((id) => { cards.delete(id); privateLeads.delete(id); });
const teamSaves = new Map<string, SavedInitiative>();
const saveRequests = new Map<string, { input: string; saved: SavedInitiative }>();
export function fixtureTeam(token: string, id: string) {
  const account = fixtureActor(token).userId;
  const accessRole = id === FIXTURE_TEAM_ID ? teamRoles.get(account)
    : id === FIXTURE_SECOND_TEAM_ID && account === FIXTURE_SECOND_EDITOR ? "editor"
    : id === externalWorkspace && account === FIXTURE_PROJECT_STARTER ? "admin" : undefined;
  if (!accessRole) throw new AccountError(404, "not_found");
  let saved = teamSaves.get(id) ?? null;
  // A workspace set up after an editor return starts empty, as a real one does: linking copies nothing,
  // and the person saves their card to the team as its own reviewed step.
  if (!saved && id !== externalWorkspace) {
    saved = { id, revision: 1, updatedAt: new Date().toISOString(), document: structuredClone(teamDocument) };
    teamSaves.set(id, saved);
  }
  return { account, saved, accessRole };
}
/** The team workspaces the fixture serves, including one set up after the editor stand-in. */
const isFixtureTeam = (id: string) => [FIXTURE_TEAM_ID, FIXTURE_SECOND_TEAM_ID, externalWorkspace].includes(id);
const teamDocument = parseTeamDocument({
  ...accountExample,
  initiative: { ...accountExample.initiative, name: "Watershed Team (fixture)", locations: ["Upper valley, Vermont"] },
  needs: accountExample.needs.map((entry) => ({ ...entry,
    value: { ...entry.value, title: "GPS watershed mapping", capitalForms: [], amount: null },
  })),
  offers: accountExample.offers.map((entry) => ({ ...entry,
    value: { ...entry.value, title: "Environmental monitoring workshop" },
  })),
});

type SupportCommand = Extract<Parameters<Parameters<typeof createProjectHandler>[0]["execute"]>[2], { action: `support_${string}` }>;
type SupportRow = { workspaceId: string; kind: "need" | "offer"; entryId: string; rkey: string; operationId: string;
  status: "publish_pending" | "published" | "withdrawal_pending" | "withdrawn" | "conflict"; record: JsonObject; cid: string | null;
  attempted: boolean; problem: string | null; repository: string };
/**
 * Public support listings for a personal fixture project, as weave-support-publication.sql and
 * support-publication.ts answer: a review of the saved entry at its revision, one publication per
 * request ID, read back before it counts as published, and withdrawal. The "repository" is this map:
 * nothing reaches Certified. `/__fixture` can hold publication back for Certified's permission.
 */
const supportRows = new Map<string, SupportRow>();
const supportReviews = new Map<string, { actor: string; workspaceId: string; kind: "need" | "offer"; entryId: string; record: JsonObject; until: number }>();
const supportRequests = new Map<string, { input: string; row: SupportRow }>();
let publishPermission: "granted" | "missing" = "granted";
/** Development control: whether Certified's permission to publish is in place for the fixture accounts. */
export function setFixturePublishPermission(value: "granted" | "missing") { publishPermission = value; }
const base32 = "abcdefghijklmnopqrstuvwxyz234567";
const fixtureCid = () => `bafyrei${Array.from(crypto.getRandomValues(new Uint8Array(52)), (byte) => base32[byte % 32]).join("")}`;
const fixtureTid = () => `3m${Array.from(crypto.getRandomValues(new Uint8Array(11)), (byte) => base32[byte % 32]).join("")}`;
const supportKey = (workspaceId: string, kind: string, entryId: string) => `${workspaceId}/${kind}/${entryId}`;
const supportResult = ({ workspaceId: _w, repository: _r, ...row }: SupportRow) => row;
/** The published listings of one project, as a public reader finds them in its repository. */
export function fixturePublicListings(projectUri: string): { uri: string; cid: string; record: JsonObject }[] {
  return [...supportRows.values()].filter((row) => row.status === "published" && row.cid && row.record.projectUri === projectUri
    && (typeof row.record.expiresAt !== "string" || Date.parse(row.record.expiresAt) > Date.now()))
    .map((row) => ({ uri: `at://${row.repository}/com.regencommons.weave.supportListing/${row.rkey}`, cid: row.cid!, record: structuredClone(row.record) }));
}
function supportCommand(token: string, actor: string, command: SupportCommand) {
  const link = [...soloLinks].find(([key, id]) => key.startsWith(`${actor} `) && id === command.workspaceId);
  if (!link) { fixtureTeam(token, command.workspaceId); throw new AccountError(503, "support_group_lifecycle_unverified"); }
  const projectUri = link[0].slice(actor.length + 1), repository = projectUri.split("/")[2]!;
  const rows = () => [...supportRows.values()].filter((row) => row.workspaceId === command.workspaceId);
  if (command.action === "support_state") return { workspaceId: command.workspaceId, listings: rows().map(supportResult), nextCursor: null };
  if (command.action === "support_review" && "entry" in command) {
    // As the draft review in weave-publish-from-draft.sql: the record is built from the fields sent, and
    // no saved revision is named. A listing already public must be withdrawn first.
    const earlier = supportRows.get(supportKey(command.workspaceId, command.kind, command.entryId));
    if (earlier && earlier.status !== "withdrawn") throw new AccountError(409, "support_conflict");
    if (command.expiresAt && Date.parse(command.expiresAt) <= Date.now()) throw new AccountError(400, "invalid_support_command");
    // Publishing again after a withdrawal keeps the listing's first date, as the SQL does.
    const { entry } = command, now = new Date().toISOString();
    const createdAt = typeof earlier?.record.createdAt === "string" ? earlier.record.createdAt : now;
    const record: JsonObject = { $type: "com.regencommons.weave.supportListing", projectUri, kind: command.kind,
      ...(command.expiresAt ? { expiresAt: command.expiresAt } : {}), title: entry.title,
      ...(entry.description ? { description: entry.description } : {}), capitalForms: [...entry.capitalForms],
      ...(entry.lenses?.length ? { lenses: [...entry.lenses] } : {}), status: "open", createdAt, updatedAt: now };
    const reviewId = crypto.randomUUID(), until = Date.now() + 10 * 60_000;
    supportReviews.set(reviewId, { actor, workspaceId: command.workspaceId, kind: command.kind, entryId: command.entryId, record, until });
    return { reviewId, audience: "public-atproto", destination: repository, record, expectedRevision: 0,
      expectedEntryRevision: 0, reviewExpiresAt: new Date(until).toISOString() };
  }
  if (command.action === "support_review") {
    const { saved } = fixtureInitiative(token, command.workspaceId);
    if (saved.revision !== command.expectedRevision) throw new AccountError(409, "support_conflict");
    const entry = reconcile(actor, saved).entries.get(entryKey(command));
    const capitals = entry?.value.capitalForms as string[] | undefined;
    if (!entry || entry.revision !== command.expectedEntryRevision || entry.status !== "open" || !capitals?.length)
      throw new AccountError(409, "support_conflict");
    const earlier = supportRows.get(supportKey(command.workspaceId, command.kind, command.entryId));
    if (earlier && earlier.status !== "withdrawn") throw new AccountError(409, "support_conflict");
    const now = new Date().toISOString();
    // As the SQL review: an end date must be in the future, and an open-ended listing leaves it out.
    if (command.expiresAt && Date.parse(command.expiresAt) <= Date.now()) throw new AccountError(400, "invalid_support_command");
    const record: JsonObject = { $type: "com.regencommons.weave.supportListing", projectUri, kind: command.kind,
      ...(command.expiresAt ? { expiresAt: command.expiresAt } : {}),
      title: String(entry.value.title), ...(typeof entry.value.description === "string" && entry.value.description ? { description: entry.value.description } : {}),
      capitalForms: [...capitals], status: "open", createdAt: now };
    const reviewId = crypto.randomUUID(), until = Date.now() + 10 * 60_000;
    supportReviews.set(reviewId, { actor, workspaceId: command.workspaceId, kind: command.kind, entryId: command.entryId, record, until });
    return { reviewId, audience: "public-atproto", destination: repository, record, expectedRevision: saved.revision,
      expectedEntryRevision: entry.revision, reviewExpiresAt: new Date(until).toISOString() };
  }
  if (command.action === "support_publish") {
    const input = JSON.stringify(command), previous = supportRequests.get(`${actor}/${command.requestId}`);
    if (previous) { if (previous.input !== input) throw new AccountError(409, "support_conflict"); return supportResult(previous.row); }
    const review = supportReviews.get(command.reviewId);
    if (!review || review.actor !== actor || review.workspaceId !== command.workspaceId || review.until <= Date.now())
      throw new AccountError(409, "support_conflict");
    supportReviews.delete(command.reviewId);
    const granted = publishPermission === "granted";
    // A listing published again after a withdrawal keeps its record key, so its address stays the same.
    const rkey = supportRows.get(supportKey(command.workspaceId, review.kind, review.entryId))?.rkey ?? fixtureTid();
    const row: SupportRow = { workspaceId: command.workspaceId, kind: review.kind, entryId: review.entryId, rkey,
      operationId: crypto.randomUUID(), status: granted ? "published" : "publish_pending", record: review.record,
      cid: granted ? fixtureCid() : null, attempted: granted, problem: granted ? null : "authorization_required", repository };
    supportRows.set(supportKey(command.workspaceId, review.kind, review.entryId), row);
    supportRequests.set(`${actor}/${command.requestId}`, { input, row });
    return supportResult(row);
  }
  const row = supportRows.get(supportKey(command.workspaceId, command.kind, command.entryId));
  if (!row) throw new AccountError(404, "not_found");
  if (command.action === "support_reconcile") {
    if (row.status === "publish_pending" && publishPermission === "granted")
      Object.assign(row, { status: "published", cid: fixtureCid(), attempted: true, problem: null });
    if (row.status === "withdrawal_pending") Object.assign(row, { status: "withdrawn", problem: null });
    return supportResult(row);
  }
  if (command.action === "support_withdraw") {
    Object.assign(row, { status: "withdrawn", problem: null });
    return supportResult(row);
  }
  throw new AccountError(400, "invalid_project_command");
}

export const projectEvidenceFixture = (origin: string) => createProjectHandler({
  origin,
  async resolveActor(request) {
    return fixtureActor(sessionCookies(false).token(request) ?? "");
  },
  async execute(request, actor, command) {
    if (actor.userId === FIXTURE_UNAVAILABLE) throw new AccountError(503, "project_workspace_unavailable");
    if (command.action === "create_personal_project") return createPersonalProject(actor.userId, command);
    if (actor.userId === FIXTURE_PROJECT_STARTER) {
      if (command.action === "list_project_groups") return { groups: externalPublished ? [{ groupDid: externalGroup, role: "owner", displayName: "Editor return group (fixture)" }] : [] };
      if (command.action === "list_projects") return { projects: externalPublished && command.target.kind === "group" && command.target.groupDid === externalGroup ? [externalProject] : [] };
      if (command.action === "list_workspaces") return { workspaces: externalWorkspace ? [{ workspaceId: externalWorkspace,
        projectUri: externalProject.uri, kind: "group", accessRole: "admin", project: externalProject }] : [], pendingSetups: [] };
      if (command.action === "lookup" && command.projectUri === externalProject.uri && externalPublished)
        return externalWorkspace ? { status: "linked", workspaceId: externalWorkspace, projectUri: externalProject.uri, accessRole: "admin" } : { status: "unlinked", projectUri: externalProject.uri };
      if (command.action === "activate" && command.projectUri === externalProject.uri && externalPublished) {
        externalWorkspace ??= crypto.randomUUID();
        return { status: "linked", workspaceId: externalWorkspace, projectUri: externalProject.uri, accessRole: "admin" };
      }
    }
    if (command.action === "list_project_groups") return { groups: [
      { groupDid, role: actor.userId === FIXTURE_TEAM_ADMIN ? "owner" : "member", handle: "watershed.certified.one", displayName: "Watershed team" },
      { groupDid: memberGroup, role: "member", handle: "seed-library.certified.one", displayName: "Valley seed keepers" },
    ] };
    if (command.action === "list_projects") return { projects: [...fixtureProjects, ...ownProjects(actor.userId)].filter(p =>
      command.target.kind === "personal" ? !p.groupDid : p.groupDid === command.target.groupDid),
      ...(command.target.kind === "group" ? { certifiedRole: command.target.groupDid === groupDid && actor.userId === FIXTURE_TEAM_ADMIN ? "owner" : "member" } : {}) };
    // As link_result in weave-publish-from-draft.sql: the person whose repository holds the project holds its
    // personal link, with or without a saved card. Links here are kept per account, so the owner is the actor.
    const token = sessionCookies(false).token(request) ?? "";
    const soloLink = (projectUri: string) => {
      const workspaceId = soloLinks.get(`${actor.userId} ${projectUri}`);
      if (!workspaceId) return null;
      return { status: "linked", workspaceId, accessRole: "admin", projectUri, cid: "bafyfixture" } as const;
    };
    // As discovery: the workspace list names a personal link only with the saved card it is anchored on.
    const anchored = (workspaceId: string) => {
      if (cardlessLinks.has(workspaceId)) return false;
      try { fixtureInitiative(token, workspaceId); return true; } catch { return false; }
    };
    if (command.action === "list_workspaces") return { workspaces: [
      ...(teamRoles.has(actor.userId) ? [{ workspaceId: FIXTURE_TEAM_ID,
        projectUri: groupUri, kind: "group", accessRole: teamRoles.get(actor.userId), project: fixtureProjects[0] }] : []),
      ...[...fixtureProjects, ...ownProjects(actor.userId)].flatMap((project) => {
        const link = soloLink(project.uri);
        return link && anchored(link.workspaceId) ? [{ workspaceId: link.workspaceId, projectUri: project.uri, kind: "personal", accessRole: "admin", project }] : [];
      }),
    ], pendingSetups: [] };
    if (command.action === "lookup") {
      if (command.projectUri === groupUri && teamRoles.has(actor.userId)) return { status: "linked", workspaceId: FIXTURE_TEAM_ID,
        projectUri: groupUri, accessRole: teamRoles.get(actor.userId) };
      return soloLink(command.projectUri)
        ?? { status: requested.has(command.projectUri) ? "pending" : "unlinked", projectUri: command.projectUri };
    }
    // A personal project links to the person's saved card at its current revision, keeping the card's ID, or,
    // to publish from a draft, to no card at a new ID (DL-155). A project already linked returns that
    // canonical link, as the workspace candidate does.
    if (command.action === "link") {
      const project = [...fixtureProjects, ...ownProjects(actor.userId)].find(({ uri }) => uri === command.projectUri);
      if (!project) throw new AccountError(404, "project_not_found");
      if (project.groupDid) throw new AccountError(400, "invalid_project_command");
      const existing = soloLink(project.uri);
      if (existing) return existing;
      if (command.initiativeId === undefined) {
        const workspaceId = crypto.randomUUID();
        cardlessLinks.add(workspaceId);
        soloLinks.set(`${actor.userId} ${project.uri}`, workspaceId);
        return soloLink(project.uri);
      }
      if (fixtureInitiative(token, command.initiativeId).saved.revision !== command.expectedRevision)
        throw new AccountError(409, "project_conflict");
      soloLinks.set(`${actor.userId} ${project.uri}`, command.initiativeId);
      return soloLink(project.uri);
    }
    if (command.action === "request_setup") { requested.add(command.projectUri); return { status: "pending" }; }
    if (command.action === "claim_invite") {
      const id = fixtureInvites.get(command.token);
      if (!id) throw new AccountError(404, "not_found");
      const invite = invitations.get(id)!;
      if (invite.status !== "pending") throw new AccountError(409, "project_conflict");
      invitations.set(id, { ...invite, status: "claimed", claimedDid: actor.did }); return { status: "pending_review" };
    }
    if (command.action === "list_invites" || command.action === "create_invite" || command.action === "revoke_invite"
      || command.action === "approve_invite" || command.action === "resolve_teammate" || command.action === "grant_access"
      || command.action === "revoke_access") {
      if (actor.userId !== FIXTURE_TEAM_ADMIN || command.workspaceId !== FIXTURE_TEAM_ID || command.projectUri !== groupUri)
        throw new AccountError(403, "workspace_admin_required");
      if (command.action === "list_invites") return { invitations: [...invitations.values()] };
      if (command.action === "create_invite") {
        const inviteId = crypto.randomUUID(), token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
        const invite = { inviteId, status: "pending", expiresAt: new Date(Date.now() + 7 * DAY).toISOString() };
        invitations.set(inviteId, invite); fixtureInvites.set(token, inviteId); return { ...invite, token };
      }
      if (command.action === "resolve_teammate") return { recipientDid: "did:plc:dddddddddddddddddddddddd", handle: command.handle };
      if (command.action === "revoke_invite" || command.action === "approve_invite") {
        const invite = invitations.get(command.inviteId); if (!invite) throw new AccountError(404, "not_found");
        invitations.set(command.inviteId, { ...invite, status: command.action === "revoke_invite" ? "revoked" : "approved" });
        return { status: command.action === "revoke_invite" ? "revoked" : "granted" };
      }
      return { status: "granted" };
    }
    if (command.action.startsWith("support_")) return supportCommand(token, actor.userId, command as SupportCommand);
    if (command.action !== "public_evidence" && command.action !== "team_load" && command.action !== "team_save")
      throw new AccountError(503, "project_workspace_unavailable");
    const now = new Date().toISOString();
    const isTeam = isFixtureTeam(command.workspaceId);
    const team = isTeam ? fixtureTeam(sessionCookies(false).token(request) ?? "", command.workspaceId) : null;
    if (command.action === "team_load") {
      if (!team) throw new AccountError(404, "not_found");
      const external = command.workspaceId === externalWorkspace;
      return { saved: team.saved, accessRole: team.accessRole, projectTitle: external ? externalProject.title : null, projectUri: external ? externalProject.uri : groupUri };
    }
    if (command.action === "team_save") {
      if (!team) throw new AccountError(404, "not_found");
      if (team.accessRole === "viewer") throw new AccountError(403, "workspace_edit_required");
      const key = `${actor.userId}/${command.requestId}`;
      const input = JSON.stringify(command);
      const previous = saveRequests.get(key);
      if (previous) {
        if (previous.input !== input) return conflict();
        return { saved: previous.saved };
      }
      if ((team.saved?.revision ?? 0) !== command.expectedRevision) throw new AccountError(409, "project_conflict");
      const saved = { id: command.workspaceId, revision: command.expectedRevision + 1,
        document: command.document, updatedAt: now };
      teamSaves.set(saved.id, saved);
      reconcile(saved.id, saved);
      saveRequests.set(key, { input, saved });
      return { saved };
    }
    if (!isTeam) fixtureInitiative(sessionCookies(false).token(request) ?? "", command.workspaceId);
    return {
      workspaceId: command.workspaceId, corpusVersion: "certified-fixture", status: "bounded",
      indexedAt: now, availableUntil: new Date(Date.now() + 300_000).toISOString(),
      truncated: false, evidence: publicEvidence.map((row) => ({ ...row, fetchedAt: now })),
    };
  },
});

const counterpart: SharedPartnerEntry[] = [{
  initiativeId: "30000000-0000-4000-8000-000000000001",
  entryId: "30000000-0000-4000-8000-000000000002",
  kind: "offer",
  revision: 1,
  summary: { name: "Watershed Workshop (fixture)", locations: [], isGlobal: true },
  value: {
    title: "Watershed mapping training", description: "Hands-on GPS mapping workshop.",
    capitalForms: ["intellectual"], placeScope: "anywhere", exchangeTerms: ["open"], status: "open",
  },
  confirmedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + DAY).toISOString(),
}];

export const matchingFixture = createMatchingHandlers({
  secureCookies: false,
  provider: {
    async execute(token, command) {
      const { initiativeId, action } = command;
      const team = isFixtureTeam(initiativeId) ? fixtureTeam(token, initiativeId) : null;
      const { account, saved } = team ?? fixtureInitiative(token, initiativeId);
      // Matching starts from a saved team card; an empty workspace has nothing to match yet.
      if (!saved) throw new AccountError(404, "not_found");
      if (team?.accessRole === "viewer" && !["state", "search", "leads"].includes(action))
        throw new AccountError(403, "workspace_edit_required");
      const card = reconcile(team ? initiativeId : account, saved);
      const state = () => ({
        initiativeId, initiativeRevision: card.revision, entries: [...card.entries.values()].map(entryState),
      });
      const select = (refs: MatchingEntryRef[]) => refs.map((ref) => {
        const row = card.entries.get(entryKey(ref));
        if (!row || row.revision !== ref.revision || row.shareVersion !== ref.shareVersion) return conflict();
        return row;
      });
      const allShared = () => [...counterpart, ...[...cards.entries()].flatMap(([id, candidate]) =>
        candidate.account === (team ? initiativeId : account) ? [] : [...candidate.entries.values()].flatMap((row) => projection(id, row)))];
      const resultLeads = () => ({
        initiativeId,
        leads: [...(privateLeads.get(initiativeId)?.values() ?? [])].map((lead): MatchingLead => ({
          ...lead, evidenceStatus: card.entries.has(entryKey(lead)) &&
            (lead.candidateId === `public:${sourceUri}` || allShared().some((item) =>
              lead.candidateId === `weave:${item.initiativeId}:${item.kind}:${item.entryId}`)) ? "current" : "unavailable",
        })),
      });
      const search = (rows: Row[]) => rankPartnerMatches({
        queries: rows.flatMap((row) => projection(initiativeId, row)), shared: allShared(), publicEvidence,
      });
      if (action === "state") return state();
      if (action === "leads") return resultLeads();
      if (action === "search") {
        const rows = command.entries ? select(command.entries) : [...card.entries.values()];
        if (command.entries && rows.some((row) => !projection(initiativeId, row).length)) return conflict();
        return parseMatchingSearch({ initiativeId, results: search(rows), coverage: {
          shared: rows.some((row) => projection(initiativeId, row).length) ? "available" : "not_joined",
          external: "partial", corpusVersion: "local-fictional-corpus", modelVersion: null, engineVersion: PARTNER_ENGINE_VERSION,
        } });
      }
      if (action === "preview") {
        if (command.initiativeRevision !== card.revision) return conflict();
        const rows = select(command.entries);
        if (rows.some((row) => row.status !== "open" || !(row.value.capitalForms as unknown[]).length)) return conflict();
        const expiry = command.expiresAt ? Date.parse(command.expiresAt) : null;
        if (expiry !== null && expiry <= Date.now()) return conflict();
        const reviewId = crypto.randomUUID();
        const preview = parseMatchingPreview({
          initiativeId, reviewId, initiativeRevision: card.revision, audience: "weave_users",
          summary: reviewSummary(saved.document), expiresAt: expiry === null ? null : new Date(expiry).toISOString(),
          entries: rows.map(({ kind, entryId, revision, shareVersion, value }) => ({ kind, entryId, revision, shareVersion, value })),
        });
        reviews.set(reviewId, { preview, until: Date.now() + 15 * 60_000 });
        return preview;
      }
      if (!("requestId" in command)) return conflict();
      const key = `${account}/${command.requestId}`;
      const input = JSON.stringify(command);
      const previous = requests.get(key);
      if (previous) {
        if (previous.input !== input) return conflict();
        return previous.response;
      }
      if (action === "set_lead") {
        const id = matchingCandidateId(command.candidateId);
        const leads = privateLeads.get(initiativeId) ?? new Map<string, MatchingLead>();
        const leadId = `${entryKey(command.entry)}/${id}`;
        if (command.disposition === "removed") leads.delete(leadId);
        else {
          const [row] = select([command.entry]);
          if (!row || !search([row]).some(({ candidateId }) => candidateId === id)) return conflict();
          leads.set(leadId, {
            kind: row.kind, entryId: row.entryId, candidateId: id, disposition: command.disposition,
            updatedAt: new Date().toISOString(), evidenceStatus: "current",
          });
        }
        privateLeads.set(initiativeId, leads);
        const response = resultLeads();
        requests.set(key, { input, response });
        return response;
      }
      if (action === "withdraw") {
        for (const row of select(command.entries)) {
          row.sharing = "withdrawn";
          row.shareVersion++;
        }
      } else if (action === "share" || action === "renew") {
        const review = reviews.get(command.reviewId);
        if (!review || review.until <= Date.now() || review.preview.initiativeId !== initiativeId ||
            review.preview.initiativeRevision !== card.revision) return conflict();
        const rows = select(review.preview.entries);
        if (rows.some((row) => row.status !== "open" || (action === "renew" &&
            (row.reviewedRevision !== row.revision || row.sharing === "withdrawn")))) return conflict();
        for (const row of rows) {
          row.sharing = "shared";
          row.shareVersion++;
          row.reviewedRevision = row.revision;
          row.summary = review.preview.summary;
          row.confirmedAt = new Date().toISOString();
          row.expiresAt = review.preview.expiresAt;
        }
        reviews.delete(command.reviewId);
      }
      const response = state();
      requests.set(key, { input, response });
      return response;
    },
  },
}).POST;
