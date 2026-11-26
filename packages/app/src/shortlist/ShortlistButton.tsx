import type { Entry } from "../funding/contracts.ts";
import { Icon } from "../ui/Icon.tsx";
import { fundItemOf, initiativeItemOf } from "./items.ts";
import type { ShortlistChange } from "./store.ts";
import { useFundShortlist, useInitiativeShortlist } from "./use-shortlist.ts";

export type { ShortlistChange };

/**
 * The shortlist toggle (DL-152, DL-153), drawn one of three ways:
 * - `card`: the card's one Icon button, outlined so it reads as something to press on a screen with
 *   no hover, in the card's top corner above its stretched link;
 * - `row`: the same button at the end of a shortlist row;
 * - `button`: a secondary button whose words say where the record stands, beside Share.
 * As an Icon button it keeps one name and is pressed (`aria-pressed`) once the record is on the
 * shortlist; in every form its outline fills.
 */
export function ShortlistToggle({
  on,
  name,
  place,
  onPress,
}: {
  on: boolean;
  name: string;
  place: "card" | "row" | "button";
  onPress(): void;
}) {
  if (place === "button")
    return (
      // Its words change with its state, so it is not also marked pressed: a toggle keeps one name.
      <button className="rc-button" data-variant="secondary" type="button" onClick={onPress}>
        <Icon name={on ? "bookmarked" : "bookmark"} size="sm" />
        {on ? "On Your Shortlist" : "Add To Shortlist"}
      </button>
    );
  return (
    <button
      className={place === "card" ? "rc-icon-button rc-card-toggle" : "rc-icon-button"}
      data-variant="secondary"
      data-size="sm"
      type="button"
      aria-pressed={on}
      aria-label={`Add to shortlist: ${name}`}
      onClick={onPress}
    >
      <Icon name={on ? "bookmarked" : "bookmark"} />
    </button>
  );
}

/** The toggle for one catalog entry. */
export function FundShortlistButton({ entry, name, place, onChange }: {
  entry: Entry;
  name: string;
  place: "card" | "row" | "button";
  onChange?(change: ShortlistChange): void;
}) {
  const shortlist = useFundShortlist();
  const on = shortlist.items.some((item) => item.id === entry.id);
  return <ShortlistToggle on={on} name={name} place={place} onPress={() => onChange?.(shortlist.toggle(fundItemOf(entry)))} />;
}

/** The toggle for one public project. A project with no Weave address has none. */
export function InitiativeShortlistButton({ project, place, onChange }: {
  project: { readonly uri: string; readonly name: string; readonly publisher?: string };
  place: "card" | "row" | "button";
  onChange?(change: ShortlistChange): void;
}) {
  const shortlist = useInitiativeShortlist();
  const item = initiativeItemOf(project);
  if (!item) return null;
  const on = shortlist.items.some((each) => each.id === item.id);
  return <ShortlistToggle on={on} name={project.name} place={place} onPress={() => onChange?.(shortlist.toggle(item))} />;
}

/** What a refused addition says, wherever the toggle is. */
export const SHORTLIST_FULL = "Your shortlist is full. Take something off it to add more.";
/** What a page says when this browser would not keep the shortlist. */
export const SHORTLIST_NOT_KEPT = "This browser could not keep your shortlist, so it lasts until you close this tab.";
