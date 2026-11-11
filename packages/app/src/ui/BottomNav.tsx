import type { MouseEvent } from "react";
import { Link, scrollToTop } from "../router.tsx";
import { matchRoute, pathTo, type Section } from "../routes.ts";
import { Icon } from "./Icon.tsx";
import { SECTIONS } from "./sections.ts";

/** Tapping the tab you are on brings its page to the top instead of opening it again. */
export function tabPress(event: MouseEvent<HTMLAnchorElement>, route: Section, pathname: string): void {
  if (pathTo(route) !== pathname) return;
  event.preventDefault();
  scrollToTop();
}

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
          onClick={(event) => tabPress(event, section.route, pathname)}
        >
          <Icon name={section.icon} />
          {section.short ?? section.label}
        </Link>
      ))}
    </nav>
  );
}
