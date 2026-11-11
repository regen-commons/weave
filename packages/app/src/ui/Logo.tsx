import { Link } from "../router.tsx";
import { pathTo } from "../routes.ts";

/** Logo atom (`rc-logo`): the mark and product name, returning home. On Home it is the current page. */
export function Logo({ current = false }: { current?: boolean }) {
  return (
    <Link className="rc-logo" href={pathTo("home")} aria-current={current ? "page" : undefined}>
      <svg className="rc-logo-mark" aria-hidden="true">
        <use href={`${import.meta.env.BASE_URL}brand/icons.svg#mark`} />
      </svg>
      Weave
    </Link>
  );
}
