import { parseSummaries, type SavedInitiative } from "@weave/api/account-contract";
import { accountRequest, assertAccount, parseSaved } from "./client.ts";

/** The most saved cards one download reads, so a very long account cannot hold the page for minutes. */
export const EXPORT_LIMIT = 200;
const PAGE = 20;

/** A download of the account's private saves: each card exactly as the account holds it. */
export interface PrivateSavesExport {
  readonly kind: "weave-private-saves";
  readonly exportedAt: string;
  readonly cards: readonly SavedInitiative[];
  /** True when the account held more cards than one download reads. */
  readonly truncated: boolean;
}

/**
 * Reads every private save of the signed-in account, page by page, then each card in full, and
 * returns them for a download. Every answer must be this account's: a session that changed
 * meanwhile stops the export. Nothing is changed in the account or on the device.
 */
export async function privateSavesExport(
  owner: string,
  request = accountRequest,
  signal?: AbortSignal,
  now: () => Date = () => new Date(),
): Promise<PrivateSavesExport> {
  const ids: string[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += PAGE) {
    const page = await request(offset ? `?offset=${offset}` : "", undefined, "/api/account", signal);
    assertAccount(page, owner);
    const items = parseSummaries(page.items);
    for (const item of items) if (!ids.includes(item.id)) ids.push(item.id);
    if (ids.length >= EXPORT_LIMIT) {
      truncated = items.length === PAGE || ids.length > EXPORT_LIMIT;
      break;
    }
    if (items.length < PAGE) break;
  }
  const cards: SavedInitiative[] = [];
  for (const id of ids.slice(0, EXPORT_LIMIT)) {
    const result = await request(`?id=${encodeURIComponent(id)}`, undefined, "/api/account", signal);
    assertAccount(result, owner);
    const saved = parseSaved(result.saved);
    if (saved.id !== id) throw Error("A saved card changed while it was being read. Try the download again.");
    cards.push(saved);
  }
  return { kind: "weave-private-saves", exportedAt: now().toISOString(), cards, truncated };
}

/** What the page says once the download has started. */
export function exportedMessage(result: PrivateSavesExport): string {
  const count = result.cards.length;
  const what = count === 0 ? "No private saves to download." : `Download started: ${count} private ${count === 1 ? "save" : "saves"} from your account.`;
  return result.truncated ? `${what} Your account holds more than ${EXPORT_LIMIT}; ask Regen Commons for the rest.` : what;
}
