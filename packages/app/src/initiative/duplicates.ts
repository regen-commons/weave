/**
 * Whether a card looks like a project the person already has on Certified, so Weave can offer
 * that project before a second copy starts. A shared link is the strongest sign. Otherwise the
 * names have to agree: the same words, or every word of the shorter name inside the longer one
 * when it has at least two. It only suggests; the person decides.
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
  const byLink = records.find((record) =>
    record.links.some((link) => {
      const at = address(link);
      return !!at && links.has(at);
    }),
  );
  if (byLink) return byLink;
  const name = words(card.name);
  return records.find((record) => sameName(name, words(record.name))) ?? null;
}
