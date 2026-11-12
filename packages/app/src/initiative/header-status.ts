import type { DeviceStorage } from "../describe/controller.ts";
import type { RouteName } from "../routes.ts";

/** How the card is saved, as the app header says it. */
export type SaveStatus = "none" | "device" | "account" | "saving" | "memory" | "conflict";

/**
 * The pages where a person works on their card. Only there does the header say how it is saved:
 * a status on every page is never read, and it means nothing beside a list of funds (DL-059).
 */
const CARD_PAGES: readonly RouteName[] = ["initiative", "check-card", "needs", "offers", "your-initiative"];

export function headerStatus({
  page,
  setAside,
  accountSaved,
  storage,
  hasCard,
}: {
  /** The page on screen, under any record opened over it. */
  page: RouteName | undefined;
  /** The card on this device belongs to another account, so it does not speak for this one (DL-055). */
  setAside: boolean;
  /** The signed-in account holds this exact card. */
  accountSaved: boolean;
  storage: DeviceStorage;
  hasCard: boolean;
}): SaveStatus {
  if (!page || !CARD_PAGES.includes(page) || setAside) return "none";
  if (accountSaved) return "account";
  if (storage === "saving" || storage === "memory" || storage === "conflict") return storage;
  return storage === "saved" && hasCard ? "device" : "none";
}
