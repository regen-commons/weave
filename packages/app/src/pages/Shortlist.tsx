import { useEffect } from "react";
import { ShortlistPanel } from "../shortlist/ShortlistPanel.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout } from "../ui/layouts.tsx";

/**
 * The shortlist as a page of its own (DL-153): where a phone opens it from Your Initiatives, and
 * where a link with `?show=funds` or `?show=initiatives` lands at any width.
 */
export function Shortlist({ search }: { search: string }) {
  const asked = new URLSearchParams(search).get("show");
  useEffect(() => {
    document.title = "Your Shortlist | Weave";
  }, []);
  return (
    <ListLayout>
      <Heading level={1} size="page">
        Your Shortlist
      </Heading>
      <ShortlistPanel place="page" asked={asked} />
    </ListLayout>
  );
}
