import { useEffect } from "react";
import { keepOutOfSearch, robotsNoindex } from "../not-found-meta.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Doorway } from "../ui/layouts.tsx";

/** A missing page is a doorway back: nothing to fill in, one way home (DL-053). */
export function NotFound() {
  // Kept out of search engines, since the server answers a missing address with Home's file.
  useEffect(() => keepOutOfSearch(document.head, () => robotsNoindex(document)), []);
  return (
    <Doorway>
      <Heading level={1} size="page">
        Page Not Found
      </Heading>
      <p className="rc-prose">Nothing lives at this address. Check it, or start again from the home page.</p>
      <ButtonLink href={pathTo("home")} variant="primary">
        Go To The Home Page
      </ButtonLink>
    </Doorway>
  );
}
