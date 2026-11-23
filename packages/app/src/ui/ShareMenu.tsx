import { useEffect, useId, useRef, useState } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import { shareTargets, type RecordShare } from "../record-share.ts";
import { Link } from "../router.tsx";
import { Icon } from "./Icon.tsx";

/**
 * Share, as a Menu (`rc-menu`) of the ways to send a record's public link: copy it, the device's own
 * share sheet where the browser has one, and one link a place to post it. The menu sends nothing itself;
 * each place opens in a new tab with the words filled in, and the person posts from there. The line
 * under the button says what happened, for a copy that worked or one the browser refused.
 */
export function ShareMenu({ share }: { share: RecordShare }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState("");
  const device = typeof navigator !== "undefined" && typeof navigator.share === "function";
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  /** Says what happened, afresh each time, so a second copy is announced as the first was. */
  function say(words: string) {
    setResult("");
    requestAnimationFrame(() => setResult(words));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(share.url);
      say("Link copied.");
    } catch {
      say(`Copy this link: ${share.url}`);
    }
  }
  async function shareFromDevice() {
    setResult("");
    try {
      await navigator.share({ title: share.title, text: share.text, url: share.url });
    } catch (error) {
      // Closing the device's sheet is a choice, not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        say("This device could not share the link. Copy it instead.");
    }
  }
  return (
    <div className="rc-action-bar">
      <button ref={trigger} className="rc-button" data-variant="secondary" type="button" popoverTarget={id}>
        <Icon name="share" size="sm" />
        Share
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto" aria-labelledby={`${id}-head`}>
        <p className="rc-menu-head" id={`${id}-head`}>
          Share a link to {share.title}
        </p>
        <button className="rc-menu-item" type="button" data-close-popover onClick={() => void copy()}>
          Copy Link
        </button>
        {device && (
          <button className="rc-menu-item" type="button" data-close-popover onClick={() => void shareFromDevice()}>
            More Ways To Share
          </button>
        )}
        {shareTargets(share).map((target, index) => (
          <Link key={target.label} className="rc-menu-item" href={target.href} data-close-popover data-divide={index === 0 || undefined}>
            {target.label}
          </Link>
        ))}
      </div>
      <p className="rc-meta" role="status">
        {result}
      </p>
    </div>
  );
}
