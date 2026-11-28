import { useMemo, useSyncExternalStore } from "react";
import { useSocial } from "../social/context.tsx";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { projectLinkLine } from "../initiative/list.ts";
import { useProjectLink } from "../initiative/use-project-link.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { waitingSuggestions } from "../initiative/import.ts";
import { CertifiedSuggestions } from "./CertifiedSuggestions.tsx";
import { privatePartnerQueries } from "./certified-suggestions.ts";

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const isOnline = () => navigator.onLine;

/**
 * Partners For You for the draft on this device, once its card is linked to a project (DL-155, step 5): the
 * draft's kept needs and offers ranked here against public projects and their published listings, with the
 * project's own published listings matched on the server. Sharing for matching has ended, so there is
 * nothing to share, stop or keep on the server; partners are kept on the device's shortlist.
 */
export function PartnerExperience({ mode, separateActions = false, refreshVersion = 0 }: {
  mode: "matches" | "preview"; separateActions?: boolean;
  /** Changes when the card's listings changed, such as after Make It Public, so suggestions are read again. */
  refreshVersion?: number;
}) {
  const { state } = useAccount();
  const social = useSocial();
  const project = social?.mode === "live" ? social.state.project : null;
  const { draft, ready } = useDraft();
  const link = useProjectLink();
  const owner = state?.user?.id;
  const linkedId = project?.workspaceId;
  const queries = useMemo(() => linkedId ? privatePartnerQueries(linkedId, 0,
    draft.needs.items.filter(({ decision }) => decision === "kept"),
    draft.offers.items.filter(({ decision }) => decision === "kept"),
    draft.confirmed,
  ) : [], [linkedId, draft.needs.items, draft.offers.items, draft.confirmed]);
  const compact = mode === "preview";
  // Why there are no partner suggestions yet, and what opens them.
  const unlinkedLine = project?.group && !linkedId
    ? project.role === "member"
      ? "Your team workspace needs approval and an access grant before partner suggestions can open."
      : "Set up the team workspace to open partner suggestions."
    : project && !linkedId ? "Partner suggestions for this project are not ready yet. Make your needs and offers public so other initiatives can find them."
      : link === "signed-out" ? "Sign in to get partner suggestions for your linked Certified project."
        : link === "checking" || link === "unchecked" ? projectLinkLine(link)
          : "Link a Certified project to get partner suggestions for your private needs and offers.";
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  return (
    <div className="rc-stack">
      {linkedId && ready && <CertifiedSuggestions key={`${owner}/${linkedId}/${refreshVersion}`}
        workspaceId={linkedId} queries={queries} waiting={waitingSuggestions(draft)} compact={compact} online={online} />}
      {/* With no card yet there is nothing to match: the list below asks for the card first. A session that
          ended is said once, by the page's own notice (SessionEndedNotice). */}
      {!linkedId && ready && !!draft.confirmed && (compact ? (
        // On the card's page the steps to link a project sit in Saving And Sharing, so this line offers what
        // can be done now: the initiatives already in the directory.
        <StatusLine
          actions={
            <ButtonLink href={pathTo("initiatives")} variant="secondary" size="sm">
              Browse All Initiatives
            </ButtonLink>
          }
        >
          {unlinkedLine}
        </StatusLine>
      ) : (
        <p>{unlinkedLine}</p>
      ))}
      {compact && linkedId && !separateActions && (
        <div className="rc-action-bar"><ButtonLink href={pathTo("partners")} variant="secondary">See All Partners</ButtonLink></div>
      )}
    </div>
  );
}
