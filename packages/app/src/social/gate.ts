import { canPublishForGroup, type CardStatus, type Exposure } from "../initiative/status.ts";
import type { SocialState } from "./fixture.ts";

/** What still has to happen before an entry can be published, in the order a person meets it. */
export type PublishGate = "sign-in" | "project" | "authority" | "workspace" | "save" | "card";

/**
 * The first step still missing before the review can open. A dialog shows that one step and
 * nothing else, so the person never reads about a step they have already taken.
 */
export function publishGate(state: SocialState, status: Pick<CardStatus, "save">): PublishGate | null {
  if (!state.identity) return "sign-in";
  const project = state.project;
  if (!project) return "project";
  if (project.workspace === "absent" || project.workspace === "requested") return "workspace";
  // Publishing for a group needs edit access in its team workspace, which a member gets from a workspace admin.
  if (project.group && !canPublishForGroup(project)) return "authority";
  if (status.save?.needs === "save") return "save";
  // Nothing saved and no save on offer: the card is not checked yet.
  if (!state.saved) return "card";
  return null;
}

const LABELS: Partial<Record<Exposure["state"], string>> = {
  on: "Change or withdraw", changed: "Publish again", withdrawing: "Check again",
};

/** The action a page offers for publishing, named for where the listing stands now. */
export function publishLabel(state: Exposure["state"] | undefined): string {
  return (state && LABELS[state]) || "Publish needs and offers";
}
