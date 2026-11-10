/** Development only. Real HTTP command parsing over ephemeral, fictional matching data. */
import { createMatchingHandlers } from "@weave/api/matching";
import {
  parseMatchingPreview, parseMatchingSearch, matchingCandidateId,
  type MatchingEntryRef, type MatchingEntryState, type MatchingLead, type MatchingPreview, type MatchingState,
} from "@weave/api/matching-contract";
import { rankPartnerMatches, type ProjectEvidence, type SharedPartnerEntry } from "@weave/api/partner-matcher";
import { parseTeamDocument, type AccountDocument, type JsonObject, type SavedInitiative } from "@weave/api/account-contract";
import { createProjectHandler } from "../../api/src/project-http.ts";
import { sessionCookies } from "../../api/src/account-http.ts";
import { AccountError } from "../../api/src/account-provider.ts";
import { FIXTURE_ACCOUNT_ID, fixtureActor, fixtureInitiative } from "./account-fixture.ts";
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
  passage: "The Stream Survey Lab runs GPS watershed mapping and environmental monitoring workshops.",
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
const teamRoles = new Map([[FIXTURE_ACCOUNT_ID, "viewer"], [FIXTURE_TEAM_EDITOR, "editor"]]);
const teamSaves = new Map<string, SavedInitiative>();
const saveRequests = new Map<string, { input: string; saved: SavedInitiative }>();
export function fixtureTeam(token: string, id: string) {
  const account = fixtureActor(token).userId;
  const accessRole = id === FIXTURE_TEAM_ID ? teamRoles.get(account)
    : id === FIXTURE_SECOND_TEAM_ID && account === FIXTURE_SECOND_EDITOR ? "editor" : undefined;
  if (!accessRole) throw new AccountError(404, "not_found");
  let saved = teamSaves.get(id);
  if (!saved) {
    saved = { id, revision: 1, updatedAt: new Date().toISOString(), document: structuredClone(teamDocument) };
    teamSaves.set(id, saved);
  }
  return { account, saved, accessRole };
}
const teamDocument = parseTeamDocument({
  ...accountExample,
  initiative: { ...accountExample.initiative, name: "Watershed Team (fixture)" },
  needs: accountExample.needs.map((entry) => ({ ...entry,
    value: { ...entry.value, title: "GPS watershed mapping", capitalForms: [], amount: null },
  })),
  offers: accountExample.offers.map((entry) => ({ ...entry,
    value: { ...entry.value, title: "Environmental monitoring workshop" },
  })),
});

export const projectEvidenceFixture = (origin: string) => createProjectHandler({
  origin,
  async resolveActor(request) {
    return fixtureActor(sessionCookies(false).token(request) ?? "");
  },
  async execute(request, actor, command) {
    if (command.action !== "public_evidence" && command.action !== "team_load" && command.action !== "team_save")
      throw new AccountError(503, "project_workspace_unavailable");
    const now = new Date().toISOString();
    const isTeam = [FIXTURE_TEAM_ID, FIXTURE_SECOND_TEAM_ID].includes(command.workspaceId);
    const team = isTeam ? fixtureTeam(sessionCookies(false).token(request) ?? "", command.workspaceId) : null;
    if (command.action === "team_load") {
      if (!team) throw new AccountError(404, "not_found");
      return { saved: team.saved, accessRole: team.accessRole, projectTitle: null };
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
      if (team.saved.revision !== command.expectedRevision) throw new AccountError(409, "project_conflict");
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
      const team = [FIXTURE_TEAM_ID, FIXTURE_SECOND_TEAM_ID].includes(initiativeId) ? fixtureTeam(token, initiativeId) : null;
      const { account, saved } = team ?? fixtureInitiative(token, initiativeId);
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
          external: "partial", corpusVersion: "local-fictional-corpus", modelVersion: null, engineVersion: "partner-lexical-v1",
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
