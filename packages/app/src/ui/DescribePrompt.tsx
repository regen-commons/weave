import { useId, type ReactNode } from "react";
import { ButtonLink } from "./ButtonLink.tsx";
import { useDescribeDoor } from "./describe-door.ts";
import { Section } from "./Section.tsx";

/**
 * The one prompt for a list that is not fitted to an initiative yet. Funding and Partners both
 * show it, so the two pages ask for the same thing in the same words. The sentence under the
 * title says what the page still offers without a card.
 */
export function DescribePrompt({ children }: { children: ReactNode }) {
  const id = useId();
  // Continue for this person's card in progress, otherwise a new card (DL-055 for another account's).
  const door = useDescribeDoor();
  const started = door.started;
  // A plain section, not a Notice: it is part of the page, and a Notice's surface and toned edge
  // are kept for what warns or reports (DL-109).
  return (
    <Section
      id={id}
      title={started ? "Finish Describing Your Initiative To See What Fits" : "Describe Your Initiative To See What Fits"}
      note={children}
    >
      <div className="rc-action-bar">
        <ButtonLink href={door.href} variant="primary">
          {door.label}
        </ButtonLink>
      </div>
    </Section>
  );
}
