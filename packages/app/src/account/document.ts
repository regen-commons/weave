import { parseDocument, type AccountDocument, type SavedInitiative } from "@weave/api/account-contract";
import { DeviceDraftSchema, newDraft, type DeviceDraft } from "../describe/contracts.ts";
import { intakeComplete } from "../intake/finish.ts";
import { emptyAskStep, type AskStep } from "../intake/contracts.ts";
/** Why this draft cannot be saved to the account yet, in the words the person reads. Null when it can. */
export function saveBlocker(draft: DeviceDraft): string | null {
  if (!intakeComplete(draft)) return "Check your initiative, needs and offers before saving.";
  if (draft.funding.editor) return "Keep or cancel your funding detail changes before saving.";
  return null;
}
/** Explicit projection: source words, files, AI records and open editors never cross this boundary. */
export function accountDocument(draft: DeviceDraft): AccountDocument {
  const blocker = saveBlocker(draft);
  if (blocker) throw new Error(blocker);
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
/** The account a card on this device belongs to: the one that saved it, or is saving it now. */
export function cardOwner(draft: DeviceDraft): string | null {
  return draft.account.saved?.owner ?? draft.account.pending?.owner ?? null;
}

/**
 * Whether the card on this device belongs to another account than the one signed in now (DL-055).
 * A saved card belongs to the account that saved it. A card nobody has saved belongs to the
 * accounts that opened it from their Certified project (`chosenBy`), and otherwise to whoever uses
 * the device. Signed out, nothing is set aside.
 */
export function belongsToAnotherAccount(
  draft: DeviceDraft, accountId: string | null | undefined, chosenBy: readonly string[] = [],
): boolean {
  if (!accountId) return false;
  const owner = cardOwner(draft);
  if (owner !== null) return owner !== accountId;
  return chosenBy.length > 0 && !chosenBy.includes(accountId);
}

/**
 * A save was asked for a card that belongs to another account. A card is never copied into
 * another account (DL-055), so nothing is sent and the card stays as it is on the device.
 */
export class AnotherAccountsCard extends Error {
  constructor() {
    super("This card belongs to another account, so it was not saved. It stays on this device and opens again when that account signs in.");
  }
}

/**
 * The card on this device as an account would hold it, for the account it belongs to and for no
 * other. Every save takes its document from here, a private save and a copy into a team alike,
 * so the refusal is in the save itself and not only on the buttons: a return from sign-in, a
 * retry or a page nobody guarded all pass through it.
 */
export function ownDocument(draft: DeviceDraft, owner: string, chosenBy: readonly string[] = []) {
  if (belongsToAnotherAccount(draft, owner, chosenBy)) throw new AnotherAccountsCard();
  return accountDocument(draft);
}
