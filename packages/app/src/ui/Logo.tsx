import { useEffect, useRef } from "react";
import { growLogoMark } from "@regen-commons/design-system/mycelium";
import { afterPaint } from "./after-paint.ts";
import { Link } from "../router.tsx";
import { pathTo } from "../routes.ts";

/**
 * Logo atom (`rc-logo`): the mark and product name, returning home. On Home it is the current page.
 * `from="wide"` shows it on wide screens only, where a phone's app bar has the way back in its place.
 */
export function Logo({ current = false, from }: { current?: boolean; from?: "wide" }) {
  return (
    <Link className="rc-logo" href={pathTo("home")} aria-current={current ? "page" : undefined} data-from={from}>
      <LogoMark />
      Weave
    </Link>
  );
}

/**
 * The website's logo mark: a little mycelium in a ring that grows once and rests, and fills under a
 * mouse (DL-054). The design system draws it; this component only mounts and disposes it.
 */
function LogoMark() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Drawn after the next paint, so sizing the canvas reads the layout that paint made instead of
    // forcing one in the task that drew the page (ui/after-paint.ts).
    let mark: { dispose(): void } | undefined;
    const cancel = afterPaint(window, () => {
      mark = growLogoMark(canvas, { hoverTarget: canvas.closest(".rc-logo") ?? canvas });
    });
    return () => {
      cancel();
      mark?.dispose();
    };
  }, []);
  return <canvas ref={ref} className="rc-logo-mark" aria-hidden="true" />;
}
