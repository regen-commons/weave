import type { Section } from "../routes.ts";
import type { IconName } from "./icons.ts";

/**
 * The app's top-level sections, shared by the header and the bottom navigation. `short` is the
 * name on a phone's tab bar, where a quarter of the bar cannot hold the full one (DL-045).
 */
export const SECTIONS: readonly { label: string; short?: string; route: Section; icon: IconName }[] = [
  { label: "Home", route: "home", icon: "home" },
  { label: "Initiatives", route: "initiatives", icon: "people" },
  { label: "Funding", route: "funding", icon: "funding" },
  { label: "Your initiatives", short: "You", route: "your-initiatives", icon: "person" },
];
