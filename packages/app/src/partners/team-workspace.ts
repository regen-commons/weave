import { parseTeamDocument, parseTeamSaved, parseTeamWorkspace, type AccountDocument, type SavedInitiative } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { emptyFundingForm } from "../funding/contracts.ts";
import { SuggestionSchema, type DeviceDraft, type Initiative } from "../describe/contracts.ts";
import { ownDocument } from "../account/document.ts";
import { deviceChoosers } from "../social/project-choice.ts";
import { AskSuggestionSchema, type AskFields } from "../intake/contracts.ts";
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

/**
 * Whether the card on this device is offered to a team at all: its button, and the preview of the
 * card behind it. Never another account's card (DL-055), which is neither offered nor shown to
 * the person signed in, and never without someone signed in or with a card that cannot be saved yet.
 */
export function offersDeviceCardToTeam(card: { blocked: boolean; signedIn: boolean; setAside: boolean }): boolean {
  return !card.blocked && card.signedIn && !card.setAside;
}

/**
 * Copies the checked card on this device into a team workspace: the one save that does not go
 * through `saveCommand`, because a team document has no private card ID. It takes its document
 * from `ownDocument` as that one does, so another account's card is refused here too. `retry` is the request
 * a failed attempt started with, sent again unchanged. `started` is told the request before it
 * is sent, so a failure can be retried.
 */
export async function saveDeviceCardToTeam(
  draft: DeviceDraft, owner: string, workspaceId: string, retry: TeamSave | null, signal: AbortSignal,
  started: (command: TeamSave) => void = () => {},
) {
  // Checked on a retry too: the request was built for this card, and the card must still be this account's.
  const document = parseTeamDocument(ownDocument(draft, owner, deviceChoosers(draft.id)));
  const command = retry ?? { expectedRevision: 0, requestId: crypto.randomUUID(), document };
  started(command);
  return { command, saved: await saveTeamWorkspace(workspaceId, command, signal) };
}

export function initialTeamDocument(name: string): AccountDocument {
  return parseTeamDocument({
    version: 1, initiative: { name: name.trim(), description: "", locations: [], isGlobal: false,
      links: [], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [] },
    needs: [], offers: [], funding: { form: emptyFundingForm(), programAnswers: {} },
  });
}

/**
 * A saved document as the card shows it, so a review names the entries instead of listing raw fields.
 * Null when the document cannot be shown as a card; the save itself still validates it.
 */
export function documentCard(document: AccountDocument): { fields: Initiative; needs: AskFields[]; offers: AskFields[] } | null {
  try {
    return {
      fields: SuggestionSchema.parse({ ...document.initiative, confidence: 1 }),
      needs: document.needs.map((entry) => AskSuggestionSchema.parse(entry.value)),
      offers: document.offers.map((entry) => AskSuggestionSchema.parse(entry.value)),
    };
  } catch {
    return null;
  }
}

export function teamPartnerQueries(saved: SavedInitiative | null) {
  return saved ? privatePartnerQueries(saved.id, saved.revision, saved.document.needs, saved.document.offers, saved.document.initiative) : [];
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
