import { Link } from "../router.tsx";
import { matchRoute, pathTo } from "../routes.ts";
import { Icon } from "./Icon.tsx";
import { SECTIONS } from "./sections.ts";

/** Bottom navigation organism (`rc-bottom-nav`): the sections on phones, icon and word. */
export function BottomNav({ pathname }: { pathname: string }) {
  const current = matchRoute(pathname)?.section;
  return (
    <nav className="rc-bottom-nav" aria-label="Main">
      {SECTIONS.map((section) => (
        <Link
          key={section.route}
          href={pathTo(section.route)}
          aria-current={section.route === current ? "page" : undefined}
        >
          <Icon name={section.icon} />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
