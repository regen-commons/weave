import { parseDocument, type AccountDocument } from "@weave/api/account-contract";
import type { DeviceDraft } from "../describe/contracts.ts";

export type ActiveInitiative = {
  id: string;
  owner: string;
  revision: number;
  contentKey: string;
  document: AccountDocument;
};

/** Save and explicit Load are the only ways a device draft gains an owned binding. */
export function activeInitiative(saved: DeviceDraft["account"]["saved"], owner?: string): ActiveInitiative | null {
  if (!owner || saved?.owner !== owner) return null;
  try {
    return { ...saved, document: parseDocument(JSON.parse(saved.contentKey)) };
  } catch {
    return null;
  }
}
