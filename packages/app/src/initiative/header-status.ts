import type { DeviceStorage } from "../describe/controller.ts";
import type { RouteName } from "../routes.ts";

/**
 * What the app header says about saving: that the account holds this card, or that the latest
 * changes could not be stored. A card kept only in this browser gets no label there (DL-112).
 */
export type SaveStatus = "none" | "account" | "memory";

/**
 * The pages where a person works on their card. Only there does the header say how it is saved:
 * a status on every page is never read, and it means nothing beside a list of funds (DL-059).
 */
const CARD_PAGES: readonly RouteName[] = ["initiative", "needs", "offers", "your-initiative"];

export function headerStatus({
  page,
  setAside,
  accountSaved,
  storage,
}: {
  /** The page on screen, under any record opened over it. */
  page: RouteName | undefined;
  /** The card on this device belongs to another account, so it does not speak for this one (DL-055). */
  setAside: boolean;
  /** The signed-in account holds this exact card. */
  accountSaved: boolean;
  storage: DeviceStorage;
}): SaveStatus {
  if (!page || !CARD_PAGES.includes(page) || setAside) return "none";
  if (storage === "memory") return "memory";
  return accountSaved ? "account" : "none";
}
