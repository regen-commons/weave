import { useEffect, useRef } from "react";
import { growMycelium } from "@regen-commons/design-system/mycelium";

/**
 * Mycelium backdrop (`rc-mycelium`): the website's branching growth behind a doorway, or behind a
 * whole page with `extent="page"`. It grows underneath the content of the element it sits in
 * (DL-071), and follows a mouse, or scrolling on a phone (DL-066). It is decorative and takes no
 * pointer. The behaviour stops drawing once the growth settles, while the page is hidden or off
 * screen, and under reduced motion; unmounting disposes it.
 */
export function Mycelium({ extent }: { extent?: "page" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const growth = growMycelium(canvas);
    return () => growth.dispose();
  }, []);
  return <canvas ref={ref} className="rc-mycelium" data-extent={extent} aria-hidden="true" />;
}
