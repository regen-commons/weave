import type { ReactNode } from "react";
import { Link } from "../router.tsx";

type ButtonLinkProps = {
  href: string;
  variant: "primary" | "secondary" | "quiet";
  size?: "sm" | "lg";
  children: ReactNode;
};

/** Button atom (`rc-button`) for navigation. One primary per region. */
export function ButtonLink({ href, variant, size, children }: ButtonLinkProps) {
  return (
    <Link className="rc-button" data-variant={variant} data-size={size} href={href}>
      {children}
    </Link>
  );
}
