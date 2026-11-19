import { Link } from "../router.tsx";
import type { Crumb } from "../routes.ts";

/**
 * Breadcrumbs molecule (`rc-breadcrumbs`): the pages above this one, then this page, above the
 * title on a wide screen. A phone has the app bar's back link instead (DL-080).
 */
export function Breadcrumbs({ trail, current }: { trail: readonly Crumb[]; current: string }) {
  return (
    <nav className="rc-breadcrumbs" aria-label="Breadcrumb" data-from="wide">
      <ol>
        {trail.map((crumb) => (
          <li key={crumb.href}>
            <Link href={crumb.href}>{crumb.label}</Link>
          </li>
        ))}
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}
