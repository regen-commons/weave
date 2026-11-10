import type { CardStatus, Exposure } from "../initiative/status.ts";
import type { SocialState } from "./fixture.ts";

/** The two ways a need or offer leaves the team. Each is its own explicit action. */
export type ShareIntent = "share" | "publish";
/** What still has to happen before an entry can leave the team, in the order a person meets it. */
export type ShareGate = "sign-in" | "project" | "authority" | "workspace" | "save" | "card";

/**
 * The first step still missing before the review can open. A dialog shows that one step and
 * nothing else, so the person never reads about a step they have already taken.
 */
export function shareGate(
  state: SocialState,
  status: Pick<CardStatus, "save">,
  intent: ShareIntent,
): ShareGate | null {
  if (!state.identity) return "sign-in";
  const project = state.project;
  if (!project) return "project";
  // Publishing authority comes from the Certified group. Said first, so nobody saves or asks for a
  // workspace only to be told they cannot publish.
  if (intent === "publish" && project.group && project.role === "member") return "authority";
  if (project.workspace === "absent" || project.workspace === "requested") return "workspace";
  if (status.save?.needs === "save") return "save";
  // Nothing saved and no save on offer: the card is not checked yet.
  if (!state.saved) return "card";
  return null;
}

const LABELS: Record<ShareIntent, Partial<Record<Exposure["state"], string>>> = {
  share: { on: "Change or stop sharing", changed: "Share the changes" },
  publish: { on: "Change or withdraw", changed: "Publish again", withdrawing: "Check again" },
};
const START: Record<ShareIntent, string> = { share: "Share for matching", publish: "Publish on Certified" };

/** The action a page offers for sharing or publishing, named for where that exposure stands now. */
export function exposureLabel(intent: ShareIntent, state: Exposure["state"] | undefined): string {
  return (state && LABELS[intent][state]) || START[intent];
}
