import { useId, type ReactNode } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { useSetAside } from "../account/set-aside.ts";
import { resumeLabel } from "../home.ts";
import { cardRoute } from "../initiative/status.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "./ButtonLink.tsx";
import { Section } from "./Section.tsx";

/**
 * The one prompt for a list that is not fitted to an initiative yet. Funding and Partners both
 * show it, so the two pages ask for the same thing in the same words. The sentence under the
 * title says what the page still offers without a card.
 */
export function DescribePrompt({ children }: { children: ReactNode }) {
  const { draft } = useDraft();
  const id = useId();
  const setAside = useSetAside();
  // Another account's card is not this person's to finish (DL-055).
  const started = hasDraft(draft) && !setAside;
  const route = started ? cardRoute(draft) : "initiative";
  // A plain section, not a Notice: it is part of the page, and a Notice's surface and toned edge
  // are kept for what warns or reports (DL-109).
  return (
    <Section
      id={id}
      title={started ? "Finish Describing Your Initiative To See What Fits" : "Describe Your Initiative To See What Fits"}
      note={children}
    >
      <div className="rc-action-bar">
        <ButtonLink href={pathTo(route)} variant="primary">
          {started ? resumeLabel(route) : "Describe Your Initiative"}
        </ButtonLink>
      </div>
    </Section>
  );
}
