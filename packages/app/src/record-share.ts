import { PUBLIC_ORIGIN } from "./public-origin.ts";

/**
 * What a person sends when they share a fund or an initiative (22 November 2026): the public record's
 * name, its address on the public site and one plain line. Only the public record goes: nothing from the
 * person's own card, and none of the page's working parameters (an example scenario, a team, a search).
 */
export interface RecordShare {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

/** A record's public address: its path on the public site, with only the query that names the record. */
export function recordUrl(path: string, query: Readonly<Record<string, string | null | undefined>> = {}, origin = PUBLIC_ORIGIN): string {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("A record's address is a path on this site.");
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  return url.href;
}

/** A fund, or one program of it, to share. */
export function fundShare(fund: { id: string; name: string }, program: { id: string; name: string } | null, origin = PUBLIC_ORIGIN): RecordShare {
  const title = program?.name ?? fund.name;
  return {
    title,
    text: program && program.name !== fund.name
      ? `Funding for regenerative work: ${program.name}, from ${fund.name}.`
      : `Funding for regenerative work: ${fund.name}.`,
    url: recordUrl(`/funding/${encodeURIComponent(fund.id)}`, { program: program?.id }, origin),
  };
}

/** A public initiative to share, at its Weave address. */
export function initiativeShare(initiative: { name: string; path: string }, origin = PUBLIC_ORIGIN): RecordShare {
  return { title: initiative.name, text: `An initiative on Weave: ${initiative.name}.`, url: recordUrl(initiative.path, {}, origin) };
}

/** One place to share to, as a plain link: no script of theirs runs on Weave, and nothing is sent until the person posts. */
export interface ShareTarget {
  readonly label: string;
  readonly href: string;
}

const encode = encodeURIComponent;

/** Where a record can be shared with one tap, in the order the menu lists them. */
export function shareTargets(share: RecordShare): ShareTarget[] {
  const both = `${share.text} ${share.url}`;
  return [
    { label: "Email", href: `mailto:?subject=${encode(share.title)}&body=${encode(`${share.text}\n\n${share.url}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encode(share.url)}&text=${encode(share.text)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encode(both)}` },
    { label: "X", href: `https://x.com/intent/post?text=${encode(share.text)}&url=${encode(share.url)}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encode(share.url)}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encode(both)}` },
  ];
}
