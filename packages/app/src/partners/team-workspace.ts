import { parseTeamDocument, parseTeamSaved, parseTeamWorkspace, type AccountDocument, type SavedInitiative } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { emptyFundingForm } from "../funding/contracts.ts";
import { privatePartnerQueries } from "./certified-suggestions.ts";
import { beginConsentReturn, cancelConsentReturn, currentConsentReturn, finishConsentReturn, takeConsentReturn } from "../initiative/consent-return.ts";

const accessEndpoint = "/api/certified-project-consent";

export async function requestTeamWorkspace(workspaceId: string, signal: AbortSignal) {
  const data = await accountRequest("", { action: "team_load", workspaceId }, "/api/projects", signal);
  try {
    const workspace = parseTeamWorkspace(data);
    if (workspace.saved && workspace.saved.id !== workspaceId) throw Error();
    return workspace;
  } catch {
    throw new AccountFailure("project_workspace_unavailable");
  }
}

export type TeamSave = { expectedRevision: number; requestId: string; document: AccountDocument };

export async function saveTeamWorkspace(workspaceId: string, command: TeamSave, signal: AbortSignal) {
  const { saved } = await accountRequest("", { action: "team_save", workspaceId, ...command }, "/api/projects", signal);
  try {
    const next = parseTeamSaved(saved);
    if (next.id !== workspaceId || next.revision !== command.expectedRevision + 1) throw Error();
    return next;
  } catch {
    throw new AccountFailure("project_workspace_unavailable");
  }
}

export function initialTeamDocument(name: string): AccountDocument {
  return parseTeamDocument({
    version: 1, initiative: { name: name.trim(), description: "", locations: [], isGlobal: false,
      links: [], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [] },
    needs: [], offers: [], funding: { form: emptyFundingForm(), programAnswers: {} },
  });
}

export function teamPartnerQueries(saved: SavedInitiative | null) {
  return saved ? privatePartnerQueries(saved.id, saved.revision, saved.document.needs, saved.document.offers) : [];
}

export async function startTeamAccess(workspaceId: string, storage: Storage) {
  const id = beginConsentReturn(storage, { kind: "team", workspaceId });
  try {
    const data = await accountRequest("", { action: "membership" }, accessEndpoint);
    const url = typeof data.authorizeUrl === "string" ? new URL(data.authorizeUrl) : null;
    if (!url || !["https://certified.one", "https://auth.certified.one"].includes(url.origin)
        || url.pathname !== "/oauth/authorize" || url.username || url.password || url.hash
        || !currentConsentReturn(storage, id)) throw new AccountFailure("project_consent_failed");
    return url.href;
  } catch (error) { cancelConsentReturn(storage, id); throw error; }
}

export function takeTeamAccessReturn(result: string | null, getStorage: () => Storage) {
  const task = takeConsentReturn(result, getStorage, "team");
  return task?.kind === "team" ? { workspaceId: task.workspaceId, result: task.result } : null;
}

export async function finishTeamAccess({ workspaceId, result }: NonNullable<ReturnType<typeof takeTeamAccessReturn>>) {
  return finishConsentReturn({ kind: "team", workspaceId, result });
}
