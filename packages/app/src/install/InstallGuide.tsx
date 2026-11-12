import { useState, useSyncExternalStore } from "react";
import { PUBLIC_ORIGIN } from "../public-origin.ts";
import { NumberedList } from "../ui/NumberedList.tsx";
import { INSTALL_STEPS, installCase, installQr } from "./guidance.ts";
import { acceptInstallOffer, installState, subscribeInstall } from "./prompt.ts";

/** The page runs from the home screen. iOS says so in its own way. */
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Install guide (DL-067): the steps for the device in hand and no others. An Android phone whose
 * browser offers to install gets one button, an iPhone gets the two things to tap with the signs
 * to look for, and a computer gets a code to scan, because Weave installs on a phone.
 */
export function InstallGuide() {
  const offer = useSyncExternalStore(subscribeInstall, installState);
  const [note, setNote] = useState("");
  const kind = installCase({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: standalone() || offer === "installed",
    canPrompt: offer === "offered",
  });

  if (kind === "installed") return <p>Weave is installed on this device.</p>;

  if (kind === "desktop") {
    const qr = installQr(window.location.origin);
    // The review copy cannot be installed, so it names the real address.
    const address = __WEAVE_PROTOTYPE__ ? new URL(PUBLIC_ORIGIN).host : window.location.host;
    return (
      <>
        <p>
          Weave installs on a phone.{" "}
          {qr
            ? "Point your phone's camera at this code to open Weave there. It will show the steps for that phone."
            : `Open ${address} on your phone. It will show the steps for that phone.`}
        </p>
        {qr && (
          <figure className="rc-qr">
            <img src={qr.src} alt={`QR code that opens ${qr.address}`} width={160} height={160} />
            <figcaption className="rc-meta">{qr.address}</figcaption>
          </figure>
        )}
      </>
    );
  }

  if (kind === "prompt") {
    return (
      <>
        <p>Add Weave to your home screen and it opens like an app, full screen.</p>
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            onClick={() =>
              void acceptInstallOffer().then((outcome) =>
                setNote(outcome === "accepted" ? "" : "Not installed. The steps below work at any time."),
              )
            }
          >
            Install Weave
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p>
        {kind === "in-app"
          ? "This app's own browser cannot install Weave. Open the page in your phone's browser first."
          : "Add Weave to your home screen and it opens like an app, full screen."}
      </p>
      {note && <p role="status">{note}</p>}
      <NumberedList items={INSTALL_STEPS[kind]} />
      {kind === "in-app" && (
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(
                  () => setNote("Address copied. Paste it into your phone's browser."),
                  () => setNote("The address could not be copied. Type it into your phone's browser."),
                )
            }
          >
            Copy this page's address
          </button>
        </div>
      )}
      {kind === "ios" && (
        <p className="rc-meta">
          Save your initiative first. The installed app starts empty, so sign in there to open it.
        </p>
      )}
    </>
  );
}
