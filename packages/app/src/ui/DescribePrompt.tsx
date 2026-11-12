import { useId, type ReactNode } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { useSetAside } from "../account/set-aside.ts";
import { resumeLabel } from "../home.ts";
import { cardRoute } from "../initiative/status.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "./ButtonLink.tsx";

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
  return (
    <section className="rc-notice" data-tone="info" aria-labelledby={id}>
      <div className="rc-notice-body">
        <h2 className="rc-notice-title" id={id}>
          {started ? "Finish describing your initiative to see what fits" : "Describe your initiative to see what fits"}
        </h2>
        <p>{children}</p>
        <div className="rc-action-bar">
          <ButtonLink href={pathTo(route)} variant="primary">
            {started ? resumeLabel(route) : "Describe your initiative"}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
