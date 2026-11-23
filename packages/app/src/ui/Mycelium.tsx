import { useEffect, useRef } from "react";
import { growMycelium } from "@regen-commons/design-system/mycelium";

/**
 * Mycelium backdrop (`rc-mycelium`): the website's branching growth behind a region, or behind a
 * whole page with `extent="page"`, as the page body has it on every page (DL-078). Behind a page it
 * is fixed to the window and the page scrolls over it. It is drawn as the website draws it: trails
 * that fade where a mouse or a finger moves, over a light resting network that is quieter under the
 * page's column, the element after the canvas (DL-106). `home` gives it the website's depth for
 * Home; every other page takes the next depth. New growth lingers and fades slowly, and a tuft
 * also grows on its own every few seconds (DL-128). It is decorative and takes no pointer. The
 * behaviour stops drawing once the trails have faded, while the page is hidden or off screen, and
 * under reduced motion; unmounting disposes it.
 */
export function Mycelium({ extent, home = false }: { extent?: "page"; home?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The canvas outlives the page, so the depth is read when something grows, not when it mounts.
  const depth = useRef(home ? 1 : 2);
  depth.current = home ? 1 : 2;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const growth = growMycelium(canvas, { depth: () => depth.current });
    return () => growth.dispose();
  }, [extent]);
  return <canvas ref={ref} className="rc-mycelium" data-extent={extent} aria-hidden="true" />;
}
