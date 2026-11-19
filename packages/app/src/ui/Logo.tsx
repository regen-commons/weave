import { useEffect, useRef } from "react";
import { growLogoMark } from "@regen-commons/design-system/mycelium";
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
    const mark = growLogoMark(canvas, { hoverTarget: canvas.closest(".rc-logo") ?? canvas });
    return () => mark.dispose();
  }, []);
  return <canvas ref={ref} className="rc-logo-mark" aria-hidden="true" />;
}
