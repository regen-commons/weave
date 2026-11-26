import type { ReactNode } from "react";
import { describePromptLine } from "../describe/start-new.ts";
import { ButtonLink } from "./ButtonLink.tsx";
import { useDescribeDoor } from "./describe-door.ts";
import { StatusLine } from "./StatusLine.tsx";

/**
 * The door to describing an initiative, as a button: Continue for this person's card in progress,
 * otherwise a new card. Which one depends on this device's draft, so until the draft opens the
 * button holds its exact room, unseen and out of reach, and nobody can press the wrong door. Every
 * page that offers the door uses this, so none has to check for itself.
 */
export function DescribeDoor({ variant, size }: { variant: "primary" | "secondary"; size?: "sm" }) {
  const door = useDescribeDoor();
  const button = (
    <ButtonLink href={door.href} variant={variant} size={size}>
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
 * show it, so the two pages ask for the same thing in the same words. The sentence after the lead
 * says what the page still offers without a card.
 *
 * It is one Status line, the shape a checked card's line takes in the same place, so it no longer
 * pushes the list down by a section's height (DL-153), and it is still not a Notice: nothing here
 * warns (DL-109). Its words are drawn at once, before this device's draft has opened, so a page that
 * leads with them is not kept waiting on storage; its door waits for the draft. Without a card and
 * with one in progress the prompt is the same size, so the words and the door change in place and
 * nothing moves (DL-104).
 */
export function DescribePrompt({ children }: { children: ReactNode }) {
  const door = useDescribeDoor();
  return (
    <StatusLine actions={<DescribeDoor variant="primary" size="sm" />}>
      <strong>{describePromptLine(door.ready, door.started)}</strong> {children}
    </StatusLine>
  );
}
