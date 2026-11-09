import { Link } from "../router.tsx";
import { pathTo } from "../routes.ts";

/** Logo atom (`rc-logo`): the mark and product name, returning home. */
export function Logo() {
  return (
    <Link className="rc-logo" href={pathTo("home")}>
      <svg className="rc-logo-mark" aria-hidden="true">
        <use href="/brand/icons.svg#mark" />
      </svg>
      Weave
    </Link>
  );
}
