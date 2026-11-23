import { useId, type ReactNode } from "react";
import { describePromptTitle } from "../describe/start-new.ts";
import { ButtonLink } from "./ButtonLink.tsx";
import { useDescribeDoor } from "./describe-door.ts";
import { Section } from "./Section.tsx";

/**
 * The door to describing an initiative, as a button: Continue for this person's card in progress,
 * otherwise a new card. Which one depends on this device's draft, so until the draft opens the
 * button holds its exact room, unseen and out of reach, and nobody can press the wrong door. Every
 * page that offers the door uses this, so none has to check for itself.
 */
export function DescribeDoor({ variant }: { variant: "primary" | "secondary" }) {
  const door = useDescribeDoor();
  const button = (
    <ButtonLink href={door.href} variant={variant}>
      {door.label}
    </ButtonLink>
  );
  return door.ready ? (
    button
  ) : (
    <span className="rc-skeleton" data-shape="room" aria-hidden="true">
      {button}
    </span>
  );
}

/**
 * The one prompt for a list that is not fitted to an initiative yet. Funding and Partners both
 * show it, so the two pages ask for the same thing in the same words. The sentence under the
 * title says what the page still offers without a card.
 *
 * Its words are drawn at once, before this device's draft has opened, so a page that leads with
 * them is not kept waiting on storage; its door waits for the draft. Without a card and with one
 * in progress the prompt is the same size, so the title and the door change in place and nothing
 * moves (DL-104).
 */
export function DescribePrompt({ children }: { children: ReactNode }) {
  const id = useId();
  const door = useDescribeDoor();
  // A plain section, not a Notice: it is part of the page, and a Notice's surface and toned edge
  // are kept for what warns or reports (DL-109).
  return (
    <Section id={id} title={describePromptTitle(door.ready, door.started)} note={children}>
      <div className="rc-action-bar">
        <DescribeDoor variant="primary" />
      </div>
    </Section>
  );
}
