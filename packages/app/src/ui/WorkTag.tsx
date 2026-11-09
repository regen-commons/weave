import type { Work } from "../listing.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";
import { Tooltip } from "./Tooltip.tsx";
const INFO: Record<Work, { icon: IconName; description: string }> = {
  "Place-based community": {
    icon: "place",
    description: "Groups rooted in a place, caring for land and people.",
  },
  Research: { icon: "research", description: "Studies, data and monitoring, often with communities." },
  "Art and culture": { icon: "culture", description: "Art, stories, music and the culture of a place." },
  Technology: { icon: "device", description: "Tools, software, energy and other technology for the work." },
  Funders: { icon: "funding", description: "Groups that give or move money to support the work." },
};
export function WorkTag({ work }: { work: Work }) {
  const info = INFO[work];
  return (
    <Tooltip text={info.description}>
      <span className="rc-tag" data-kind="work">
        <Icon name={info.icon} size="sm" />
        {work}
      </span>
    </Tooltip>
  );
}
