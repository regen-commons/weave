import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { NarrowLayout } from "../ui/layouts.tsx";

export function NotFound() {
  return (
    <NarrowLayout>
      <Heading level={1} size="page">
        Page not found
      </Heading>
      <EmptyState
        title="Nothing lives at this address"
        action={
          <ButtonLink href={pathTo("home")} variant="primary">
            Go to the home page
          </ButtonLink>
        }
      >
        Check the address, or start again from the home page.
      </EmptyState>
    </NarrowLayout>
  );
}
