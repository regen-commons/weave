import { parseDocument, type AccountDocument, type SavedInitiative } from "@weave/api/account-contract";
import { DeviceDraftSchema, newDraft, type DeviceDraft } from "../describe/contracts.ts";
import { intakeComplete } from "../intake/finish.ts";
import { emptyAskStep, type AskStep } from "../intake/contracts.ts";
/** Explicit projection: source words, files, AI records and open editors never cross this boundary. */
export function accountDocument(draft: DeviceDraft): AccountDocument {
  if (!intakeComplete(draft)) throw new Error("Check your initiative, needs and offers before saving.");
  if (draft.funding.editor) throw new Error("Keep or cancel your funding detail changes before saving.");
  const { confidence: _confidence, ...initiative } = draft.confirmed!;
  const asks = (kind: "needs" | "offers") =>
    draft[kind].items.filter((item) => item.decision === "kept").map(({ id, value }) => ({ id, value }));
  return parseDocument({
    version: 1,
    initiative,
    needs: asks("needs"),
    offers: asks("offers"),
    funding: { form: draft.funding.form, programAnswers: draft.funding.programAnswers },
  });
}
export function accountKey(draft: DeviceDraft): string | null {
  try {
    return JSON.stringify(accountDocument(draft));
  } catch {
    return null;
  }
}
export function loadedDraft(saved: SavedInitiative, owner: string): DeviceDraft {
  const document = parseDocument(saved.document);
  const step = (items: AccountDocument["needs"]): AskStep =>
    ({
      ...emptyAskStep(),
      mode: "manual",
      builtVersion: 0,
      reviewedVersion: 0,
      items: items.map((item) => ({
        ...item,
        sourceKey: null,
        fingerprint: "account",
        decision: "kept",
        decisionBeforeRemove: null,
      })),
    }) as AskStep;
  return DeviceDraftSchema.parse({
    ...newDraft(),
    id: saved.id,
    proposal: { ...document.initiative, confidence: 0 },
    confirmed: { ...document.initiative, confidence: 0 },
    proposalVersion: 0,
    links: document.initiative.links,
    kept: ["stage", "lenses", "themes", "beneficiaries", "languages"],
    needs: step(document.needs),
    offers: step(document.offers),
    funding: { ...document.funding, editor: null },
    account: {
      saved: { id: saved.id, owner, revision: saved.revision, contentKey: JSON.stringify(document) },
      pending: null,
    },
  });
}
export function saveCommand(draft: DeviceDraft, owner: string) {
  const document = accountDocument(draft),
    contentKey = JSON.stringify(document),
    saved = draft.account.saved;
  const same = saved?.owner === owner;
  const pending = draft.account.pending;
  const binding =
    pending?.owner === owner && pending.contentKey === contentKey
      ? pending
      : {
          id: same
            ? saved.id
            : saved || (pending?.owner && pending.owner !== owner)
              ? crypto.randomUUID()
              : draft.id,
          owner,
          revision: same ? saved.revision : 0,
          contentKey,
          requestId: crypto.randomUUID(),
        };
  return {
    binding,
    command: {
      accountId: owner,
      id: binding.id,
      expectedRevision: binding.revision,
      requestId: binding.requestId,
      document,
    },
  };
}
