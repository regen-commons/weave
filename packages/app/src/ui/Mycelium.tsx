import { useEffect, useRef } from "react";
import { growMycelium } from "@regen-commons/design-system/mycelium";

/**
 * Mycelium backdrop (`rc-mycelium`): the website's branching growth behind the home hero. It is
 * decorative and takes no pointer. The behaviour stops drawing once the growth settles, while the
 * page is hidden or the hero is off screen, and under reduced motion; unmounting disposes it.
 */
export function Mycelium() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const growth = growMycelium(canvas);
    return () => growth.dispose();
  }, []);
  return <canvas ref={ref} className="rc-mycelium" aria-hidden="true" />;
}
