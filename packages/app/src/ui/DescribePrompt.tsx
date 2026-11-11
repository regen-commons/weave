import { useId, type ReactNode } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
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
  const route = cardRoute(draft);
  const started = hasDraft(draft);
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
