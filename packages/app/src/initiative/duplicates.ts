/**
 * Whether a card looks like a project the person already has on Certified, so Weave can offer
 * that project before a second copy starts. A project's own link is the strongest sign when only
 * one project has it; a link several projects share leaves the choice to the names, first among
 * those projects and then among all. Links on a publisher's profile are not a project's and never
 * count. The names have to agree: the same words, or every word of the shorter name inside the
 * longer one when it has at least two. It only suggests; the person decides.
 */
const SMALL_WORDS = new Set(["a", "an", "and", "the", "of", "for", "e", "o", "os", "as", "da", "das", "de", "do", "dos"]);

function words(name: string): Set<string> {
  const plain = name.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  return new Set(
    plain
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word && !SMALL_WORDS.has(word))
      // "Circles" and "circle" are the same name.
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)),
  );
}

function address(link: string): string | null {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./u, "") + url.pathname.replace(/\/+$/u, "");
  } catch {
    return null;
  }
}

function sameName(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size || ![...small].every((word) => large.has(word))) return false;
  return small.size >= 2 || small.size === large.size;
}

export function likelyDuplicate<T extends { readonly name: string; readonly links: readonly string[] }>(
  card: { readonly name: string; readonly links: readonly string[] },
  records: readonly T[],
): T | null {
  const links = new Set(card.links.map(address).filter((value): value is string => !!value));
  const byLink = records.filter((record) =>
    record.links.some((link) => {
      const at = address(link);
      return !!at && links.has(at);
    }),
  );
  if (byLink.length === 1) return byLink[0]!;
  const name = words(card.name);
  const named = (list: readonly T[]) => list.find((record) => sameName(name, words(record.name)));
  return named(byLink) ?? named(records) ?? null;
}

/** Drafts the person said are not that project, for this visit, so the offer is not made on every look. */
const different = new Set<string>();
const pair = (owner: string, draftId: string, uri: string) => `${owner}/${draftId}/${uri}`;

/** The person answered that this draft is a different initiative from that project. */
export function dismissDuplicate(owner: string, draftId: string, uri: string): void {
  different.add(pair(owner, draftId, uri));
}

/**
 * The Certified project to offer for a draft on Your Initiatives (DL-134): the one it looks like,
 * unless the person already said it is a different initiative. Only an offer. Linking is the
 * person's press, through the same reviewed step as any other link.
 */
export function duplicateOffer<T extends { readonly uri: string; readonly name: string; readonly links: readonly string[] }>(
  owner: string,
  draftId: string,
  card: { readonly name: string; readonly links: readonly string[] },
  projects: readonly T[],
): T | null {
  const match = likelyDuplicate(card, projects);
  return match && !different.has(pair(owner, draftId, match.uri)) ? match : null;
}
