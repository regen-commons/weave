import {
  parsePublicInitiative, publicInitiativeUrl,
  type PublicInitiative, type PublicSupportListing,
} from "@weave/api/public-initiative-contract";
import { CAPITALS } from "../capitals.ts";
import { fullDate } from "../home.ts";
import type { CapitalKey, PublicAsk } from "../listing.ts";

/** How long the page waits for one initiative before it says the needs and offers could not be checked. */
const WAIT_MS = 8000;

export type InitiativeLookup =
  | { status: "found"; initiative: PublicInitiative }
  /** The public list shows no project at this address. */
  | { status: "missing" }
  /** The public list is not switched on here. */
  | { status: "off" };

/**
 * One public initiative with its current, confirmed public needs and offers, read fresh on every opening:
 * never from the browser's cache or the list the person came from, so a listing withdrawn or expired since
 * is gone the next time the page opens (QA notes, 25 November 2026). Sent with nothing of the person's. An
 * answer for another project, a refusal or a timeout rejects.
 */
export async function requestPublicInitiative(uri: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<InitiativeLookup> {
  const response = await request(publicInitiativeUrl(uri), {
    credentials: "omit", cache: "no-store", headers: { Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(WAIT_MS)]),
  });
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) throw Error("public_initiative_unavailable");
  const answer = parsePublicInitiative(await response.json());
  if ("status" in answer) return { status: "off" };
  if (answer.project.uri !== uri) throw Error("public_initiative_unavailable");
  return { status: "found", initiative: answer };
}

const day = (value: string) => fullDate(new Date(value).toISOString().slice(0, 10));
const capitalKeys = (forms: readonly string[]): CapitalKey[] =>
  CAPITALS.filter((capital) => forms.includes(capital.key)).map((capital) => capital.key);

/** A published need or offer as a public Ask card reads it: its kinds, title, description and how long it is open. */
export function publicAsk(listing: PublicSupportListing): PublicAsk {
  return {
    title: listing.title,
    description: listing.description ?? "",
    capitals: capitalKeys(listing.capitalForms),
    terms: listing.expiresAt
      ? `Listed on ${day(listing.createdAt)}, open until ${day(listing.expiresAt)}.`
      : `Listed on ${day(listing.createdAt)}.`,
  };
}
