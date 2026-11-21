import { useDraft } from "../describe/use-draft.ts";
import { useSocial } from "../social/context.tsx";
import { deviceChoosers } from "../social/project-choice.ts";
import { projectLinkState, type ProjectLinkState } from "./list.ts";

/**
 * What the tab's card can say about its Certified project, from the live account and the choices
 * kept on this device (DL-119). A card linked here stays linked when the session ends, so it says
 * so, and signing in shows the project. The example world has no stored choices and reads as not
 * linked here; its pages say what its own project is.
 */
export function useProjectLink(): ProjectLinkState {
  const { draft } = useDraft();
  const social = useSocial();
  const live = social?.mode === "live" ? social : null;
  return projectLinkState({
    linked: !!live?.state.project,
    owner: live?.state.identity?.id,
    choosers: live ? deviceChoosers(draft.id) : [],
    loading: !!live?.loading,
    problem: !!live?.problem,
  });
}
