import type { ReactNode } from "react";
import { Link } from "../router.tsx";

type ButtonLinkProps = {
  href: string;
  variant: "primary" | "secondary" | "quiet";
  size?: "sm" | "lg";
  /** In an action bar, shown on a wide screen only, where a phone offers it elsewhere on the page. */
  from?: "wide";
  children: ReactNode;
};

/** Button atom (`rc-button`) for navigation. One primary per region. */
export function ButtonLink({ href, variant, size, from, children }: ButtonLinkProps) {
  return (
    <Link className="rc-button" data-variant={variant} data-size={size} data-from={from} href={href}>
      {children}
    </Link>
  );
}
