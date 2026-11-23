import { useId, type ReactNode } from "react";
import { describePrompt } from "../describe/start-new.ts";
import { useDraft } from "../describe/use-draft.ts";
import { ButtonLink } from "./ButtonLink.tsx";
import { useDescribeDoor } from "./describe-door.ts";
import { Section } from "./Section.tsx";

/**
 * The one prompt for a list that is not fitted to an initiative yet. Funding and Partners both
 * show it, so the two pages ask for the same thing in the same words. The sentence under the
 * title says what the page still offers without a card.
 *
 * Its words are drawn at once, before this device's draft has opened, so a page that leads with
 * them is not kept waiting on storage. Its one action depends on the draft (Continue for a card in
 * progress, otherwise a new card), so until the draft opens the action holds its exact room,
 * unseen and out of reach, and nobody can press the wrong one. Without a card and with one in
 * progress the prompt is the same size, so the title and the action change in place and nothing
 * moves (DL-104).
 */
export function DescribePrompt({ children }: { children: ReactNode }) {
  const id = useId();
  const { ready } = useDraft();
  // Continue for this person's card in progress, otherwise a new card (DL-055 for another account's).
  const door = useDescribeDoor();
  const shown = describePrompt(ready, door.started);
  const action = (
    <ButtonLink href={door.href} variant="primary">
      {door.label}
    </ButtonLink>
  );
  // A plain section, not a Notice: it is part of the page, and a Notice's surface and toned edge
  // are kept for what warns or reports (DL-109).
  return (
    <Section
      id={id}
      title={shown.title}
      note={children}
    >
      <div className="rc-action-bar">
        {shown.actionWaits ? (
          <span className="rc-skeleton" data-shape="room" aria-hidden="true">
            {action}
          </span>
        ) : (
          action
        )}
      </div>
    </Section>
  );
}
