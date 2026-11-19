import { useEffect, useRef } from "react";
import { growMycelium } from "@regen-commons/design-system/mycelium";

/**
 * Mycelium backdrop (`rc-mycelium`): the website's branching growth behind a region, or behind a
 * whole page with `extent="page"`, as the page body has it on every page (DL-078). It grows
 * underneath the content of the element it sits in (DL-071), and follows a mouse, or scrolling on a
 * phone (DL-066). Behind a page, the element after it is the page's column, where the resting
 * network is quieter. It is decorative and takes no pointer. The behaviour stops drawing once the
 * growth settles, while the page is hidden or off screen, and under reduced motion; unmounting
 * disposes it.
 */
export function Mycelium({ extent }: { extent?: "page" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // The page's column is replaced on every move between pages, so it is found when it is measured.
    const growth = growMycelium(canvas, extent === "page" ? { column: () => canvas.nextElementSibling } : undefined);
    return () => growth.dispose();
  }, [extent]);
  return <canvas ref={ref} className="rc-mycelium" data-extent={extent} aria-hidden="true" />;
}
