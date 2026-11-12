import type { Section } from "../routes.ts";
import type { IconName } from "./icons.ts";

/**
 * The app's top-level sections, shared by the header and the bottom navigation. `short` is the
 * name on a phone's tab bar, where a quarter of the bar cannot hold the full one (DL-045). On wide
 * screens the logo goes home, so the header leaves Home out (`header: false`, DL-049).
 */
export const SECTIONS: readonly { label: string; short?: string; route: Section; icon: IconName; header?: false }[] = [
  { label: "Home", route: "home", icon: "home", header: false },
  { label: "Initiatives", route: "initiatives", icon: "people" },
  { label: "Funding", route: "funding", icon: "funding" },
  { label: "Your Initiatives", short: "You", route: "your-initiatives", icon: "person" },
];
