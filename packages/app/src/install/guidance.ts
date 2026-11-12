import { PUBLIC_ORIGIN } from "../public-origin.ts";
import type { IconName } from "../ui/icons.ts";

/**
 * What one device needs to hear about installing Weave (DL-067). A person sees the steps for the
 * device in their hand and no others: a job aid they can follow, not two platforms to read and
 * tell apart.
 */
export type InstallCase =
  /** Weave is running from the home screen already. */
  | "installed"
  /** The browser has offered to install it: one button does it. */
  | "prompt"
  /** An iPhone or iPad: Share, then Add to Home Screen. */
  | "ios"
  /** An Android phone whose browser has not offered: its menu, then Install app. */
  | "android"
  /** A browser inside another app, which cannot install anything. */
  | "in-app"
  /** A computer: Weave installs on a phone, so the guide sends it there. */
  | "desktop";

export interface InstallSignals {
  readonly userAgent: string;
  /** An iPad reports itself as a Mac; a Mac has no touch points. */
  readonly maxTouchPoints: number;
  /** The page runs from the home screen. */
  readonly standalone: boolean;
  /** The browser has offered to install the app. */
  readonly canPrompt: boolean;
}

/** Apps that open links in a browser of their own, where the home screen cannot be reached. */
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Twitter|Snapchat|TikTok|musical_ly|; wv\)/;

export function installCase({ userAgent, maxTouchPoints, standalone, canPrompt }: InstallSignals): InstallCase {
  if (standalone) return "installed";
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const android = /Android/.test(userAgent);
  if (!ios && !android) return "desktop";
  if (IN_APP.test(userAgent)) return "in-app";
  if (ios) return "ios";
  return canPrompt ? "prompt" : "android";
}

export interface InstallStep {
  /** The sign the person has to find on their own screen, shown beside the words. */
  readonly icon: IconName;
  readonly title: string;
  readonly note: string;
}

/** The steps a person takes by hand, in the words their phone uses. */
export const INSTALL_STEPS: Readonly<Record<"ios" | "android" | "in-app", readonly InstallStep[]>> = {
  ios: [
    { icon: "share", title: "Tap Share", note: "In your browser's toolbar. If it is not there, tap the three dots first." },
    { icon: "add-box", title: "Tap Add to Home Screen", note: "Scroll down the list to find it, then tap Add." },
  ],
  android: [
    { icon: "more", title: "Tap the three dots", note: "At the top of your browser, beside the address." },
    { icon: "add-box", title: "Tap Install app", note: "It may say Add to Home screen." },
  ],
  "in-app": [
    { icon: "more", title: "Open this app's menu", note: "Usually three dots, at the top or bottom of the screen." },
    { icon: "globe", title: "Choose Open in browser", note: "It may name Safari or Chrome. Then come back to this page." },
  ],
};

/**
 * The QR code a computer shows, for a phone's camera. It is a picture made for the public address,
 * so it shows only where this page is served from that address; anywhere else, such as a preview,
 * the guide gives the page's own address in words instead.
 */
export function installQr(origin: string): { src: string; address: string } | null {
  if (origin !== PUBLIC_ORIGIN) return null;
  const host = new URL(PUBLIC_ORIGIN).host;
  return { src: `/install/${host}.svg`, address: host };
}
