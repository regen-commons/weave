import type { ReactNode } from "react";
import { COMMONS } from "../links.ts";
import { pathTo, type RouteName } from "../routes.ts";
import { Link } from "../router.tsx";
import type { Information } from "./InformationDialog.tsx";

// Footer links are the one place the app uses title case (DL-033).
const PAGES: readonly { name: RouteName; label: string }[] = [
  { name: "initiative", label: "Describe Your Initiative" },
  { name: "initiatives", label: "Initiatives" },
  { name: "funding", label: "Funding" },
  { name: "your-initiatives", label: "Your Initiatives" },
];
const INFORMATION: readonly { kind: Information; label: string }[] = [
  { kind: "storage", label: "What We Store" },
  { kind: "assistant", label: "What the Assistant Did" },
  { kind: "policy", label: "Data Policy" },
];
const COMMONS_LINKS = [
  { href: COMMONS.website, label: "Website" },
  { href: COMMONS.membership, label: "Membership" },
  { href: COMMONS.youtube, label: "YouTube" },
  { href: COMMONS.forum, label: "Forum" },
] as const;

/** Footer organism (`rc-footer`): the same on every page, without the link to the page the person is on. */
export function Footer({
  current,
  onInformation,
  children,
}: {
  current?: RouteName;
  onInformation: (value: Information) => void;
  /** Sits under the links, such as the example world's label in development. */
  children?: ReactNode;
}) {
  return (
    <footer className="rc-footer">
      <div className="rc-footer-grid">
        <section>
          <h2 className="rc-footer-title">Weave</h2>
          <ul>
            {PAGES.filter((page) => page.name !== current).map((page) => (
              <li key={page.name}>
                <Link className="rc-footer-link" href={pathTo(page.name)}>
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="rc-footer-title">Data &amp; Privacy</h2>
          <ul>
            {INFORMATION.map((item) => (
              <li key={item.kind}>
                <button className="rc-footer-link" type="button" onClick={() => onInformation(item.kind)}>
                  {item.label}
                </button>
              </li>
            ))}
            {current !== "settings" && (
              <li>
                <Link className="rc-footer-link" href={pathTo("settings")}>
                  Settings
                </Link>
              </li>
            )}
          </ul>
        </section>
        <section>
          <h2 className="rc-footer-title">Regen Commons</h2>
          <ul>
            {COMMONS_LINKS.map((link) => (
              <li key={link.label}>
                <a className="rc-footer-link" href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {children}
    </footer>
  );
}
