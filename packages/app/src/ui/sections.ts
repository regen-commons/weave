import type { Section } from "../routes.ts";
import type { IconName } from "./icons.ts";

/** The app's top-level sections, shared by the header and the bottom navigation. */
export const SECTIONS: readonly { label: string; route: Section; icon: IconName }[] = [
  { label: "Home", route: "home", icon: "home" },
  { label: "Initiatives", route: "initiatives", icon: "people" },
  { label: "Funding", route: "funding", icon: "funding" },
  { label: "Your initiatives", route: "your-initiatives", icon: "person" },
];
