import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Doorway } from "../ui/layouts.tsx";

/** A missing page is a doorway back: nothing to fill in, one way home (DL-053). */
export function NotFound() {
  return (
    <Doorway>
      <Heading level={1} size="page">
        Page not found
      </Heading>
      <p className="rc-prose">Nothing lives at this address. Check it, or start again from the home page.</p>
      <ButtonLink href={pathTo("home")} variant="primary">
        Go to the home page
      </ButtonLink>
    </Doorway>
  );
}
