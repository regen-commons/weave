import { Link } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { useFundShortlist, useInitiativeShortlist } from "./use-shortlist.ts";

/**
 * What a list's count line says about the shortlist (DL-153): "3 on your shortlist", as the way to it,
 * or, once a visit, right after the first bookmark, "Added to your shortlist." in the same room, so the
 * person learns where the bookmark put it and nothing on the page moves. Nothing while it is empty.
 */
export function ShortlistCount({ kind, told }: { kind: "funds" | "initiatives"; told: boolean }) {
  const funds = useFundShortlist();
  const initiatives = useInitiativeShortlist();
  const count = (kind === "funds" ? funds : initiatives).items.length;
  const href = `${pathTo("shortlist")}?show=${kind}`;
  if (told) return <>Added to <Link href={href}>your shortlist</Link>.</>;
  return count ? <Link href={href}>{count} on your shortlist</Link> : null;
}
