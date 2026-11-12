import { LENS_LABELS } from "../describe/contracts.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";
import { Tooltip } from "./Tooltip.tsx";
/**
 * Every lens a card can carry. The initiative list sorts by all of them but funders, who are
 * found in the funding directory.
 */
type Lens = (typeof LENS_LABELS)[keyof typeof LENS_LABELS];
const INFO: Record<Lens, { icon: IconName; description: string }> = {
  "Place-based": {
    icon: "place",
    description: "Groups rooted in a place, caring for land and people.",
  },
  Research: { icon: "research", description: "Studies, data and monitoring, often with communities." },
  "Art and culture": { icon: "culture", description: "Art, stories, music and the culture of a place." },
  Technology: { icon: "device", description: "Tools, software, energy and other technology for the work." },
  "Learning and education": {
    icon: "learning",
    description: "Schools, courses, workshops and other ways of learning together.",
  },
  Funders: { icon: "funding", description: "Groups that give or move money to support the work." },
};
/** The lens behind a label, which names the tag's colour (DL-065). */
const LENS_OF = Object.fromEntries(Object.entries(LENS_LABELS).map(([lens, label]) => [label, lens])) as Record<Lens, string>;
export function WorkTag({ work }: { work: Lens }) {
  const info = INFO[work];
  return (
    <Tooltip text={info.description}>
      <span className="rc-tag" data-kind="work" data-lens={LENS_OF[work]}>
        <Icon name={info.icon} size="sm" />
        {work}
      </span>
    </Tooltip>
  );
}
