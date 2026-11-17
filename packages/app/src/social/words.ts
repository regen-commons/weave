import { fullDate } from "../home.ts";
import { entryCount } from "../initiative/status.ts";
import type { CertifiedRecord, ProjectLink, ProjectRole, PublicCard } from "./fixture.ts";

const MEMBERSHIP: Record<ProjectRole, (group: string) => string> = {
  owner: (group) => `You own the group ${group}.`,
  admin: (group) => `You are an admin of the group ${group}.`,
  member: (group) => `You are a member of the group ${group}.`,
};

/** Who works on a Certified project and whether Weave has a team workspace for it. */
export function projectLine(record: Pick<CertifiedRecord, "group" | "role" | "workspace">): string {
  if (!record.group) return "A personal project. Only you work on it.";
  return `${MEMBERSHIP[record.role](record.group)} ${
    record.workspace ? "It has a team workspace in Weave." : "It has no team workspace in Weave yet."
  }`;
}

/**
 * Where saved work goes once this project is linked, said before the person links it.
 * A private save moves into an open team workspace, so the review says who sees it there.
 */
export function linkEffect(record: Pick<CertifiedRecord, "group" | "workspace">, saved = false): string {
  if (!record.group) return "A personal project stays yours alone, so what you save stays private.";
  if (!record.workspace)
    return `${record.group} has no team workspace in Weave yet. You can ask for one and keep working privately.`;
  return saved
    ? `Your saved initiative moves to the ${record.group} workspace, where teammates with access can see it.`
    : `What you save goes to the ${record.group} workspace, where teammates with access can see it.`;
}

/** The state of a team workspace the person is waiting on. Null when there is nothing to wait for. */
export function workspaceLine(link: ProjectLink): string | null {
  if (link.workspace === "absent") return `${link.group ?? link.name} has no team workspace in Weave yet.`;
  if (link.workspace === "requested")
    return link.requestedOn
      ? `You asked for a team workspace on ${fullDate(link.requestedOn)}.`
      : "You asked for a team workspace.";
  return null;
}

/** Said where the request was shown, once the team workspace opens while the person is looking. */
export function workspaceOpenLine(link: Pick<ProjectLink, "group" | "name">): string {
  return `${link.group ?? link.name} has a team workspace in Weave now.`;
}

/**
 * The public details as a review lists them. Given the fields a provider supplied, only those show:
 * a field Certified did not send never replaces the card's own, so listing it as "Not stated" would mislead.
 */
export function publicFacts(card: PublicCard, supplied?: readonly (keyof PublicCard)[]): { term: string; value: string }[] {
  const facts: { field: keyof PublicCard; term: string; value: string }[] = [
    { field: "name", term: "Name", value: card.name || "Not stated" },
    { field: "locations", term: "Where", value: card.locations.join("; ") || "Not stated" },
    { field: "description", term: "About", value: card.description || "Not stated" },
    { field: "links", term: "Links", value: card.links.join(", ") || "None" },
  ];
  return facts.filter(({ field }) => !supplied || supplied.includes(field)).map(({ term, value }) => ({ term, value }));
}

type SourceFields = Pick<CertifiedRecord, "verifiedFields" | "unreadFields">;

/**
 * What linking a live project does with its place and links, said before the tap and after it.
 * They fill only what the card leaves empty, and a place Weave could not read is named, not guessed.
 * Empty when the project gave neither.
 */
export function sourceDetailsLine(record: SourceFields): string {
  const place = !!record.verifiedFields?.includes("locations");
  const links = !!record.verifiedFields?.includes("links");
  const filled = place && links ? "Its place and links go on your card only where yours are empty."
    : place ? "Its place goes on your card only if Where is empty."
    : links ? "Its links go on your card only if it has none."
    : "";
  const unread = record.unreadFields?.includes("locations")
    ? "Certified lists a place for it that Weave could not read, so Where stays as it is on your card."
    : "";
  return [filled, unread].filter(Boolean).join(" ");
}

/** Where a live project's details come from, for the link review. */
export function sourceOriginLine(record: SourceFields): string {
  const extra = record.verifiedFields?.includes("locations") || record.verifiedFields?.includes("links");
  return extra
    ? "The name and description come from Certified, and its place and links when your card has none. Other details stay as they are on your card."
    : "The name and description come from Certified. Other details stay as they are on your card.";
}

/** What the project step says about discovery, and the one way to act on it. */
export interface Discovery {
  readonly line: string;
  readonly action: "check" | "retry" | "consent" | null;
}

/**
 * One line for the result of reading the person's projects. Existing projects are always checked
 * before an editor is offered, so the line says what that check found. A failed read is never
 * "no projects", and a return from an editor proves nothing about publication.
 */
export function discoveryLine({ loading, problem, consent, found, editor }: {
  loading: boolean;
  problem: string | null;
  consent: boolean;
  found: number;
  /** The editor this account and draft left for, from the local return hint. */
  editor: string | null;
}): Discovery {
  if (loading) return { line: "Checking your Certified projects", action: null };
  if (problem) return { line: problem, action: consent ? "consent" : "retry" };
  if (!found)
    return { line: editor ? "No published project found yet." : "No Certified project found for your account.", action: "check" };
  if (editor) return { line: `Back from ${editor}? Choose the project you published.`, action: "check" };
  return { line: `${found} Certified ${found === 1 ? "project" : "projects"} found.`, action: "check" };
}

type Suggested = readonly { readonly kind: "needs" | "offers" }[];

/** What a link review adds, before the tap, when the project's page suggests needs or offers. Empty when it suggests none. */
export function suggestionLine(suggested: Suggested): string {
  return suggested.length ? `The project page also suggests ${entryCount(suggested)} for you to check.` : "";
}

/**
 * Suggestions from the project page still in pencil, said where the card is. A checked card stays
 * checked and they wait beside it; a card not checked yet is finished on Needs and offers.
 * Empty when none wait.
 */
export function waitingLine(waiting: Suggested, checked: boolean): string {
  if (!waiting.length) return "";
  const count = entryCount(waiting);
  if (waiting.length === 1)
    return checked
      ? `Your project page suggests ${count}. It is not on your card until you keep it.`
      : `Your project page suggests ${count}. Check it to finish your card.`;
  return checked
    ? `Your project page suggests ${count}. They are not on your card until you keep them.`
    : `Your project page suggests ${count}. Check them to finish your card.`;
}

/** The button beside the waiting line on a checked card. */
export const waitingAction = (waiting: Suggested): string =>
  waiting.length === 1 ? "Check the suggestion" : "Check the suggestions";

/** True when linking would change any of the card's four public details. */
export function replacesCard(card: PublicCard, record: PublicCard): boolean {
  const key = (value: PublicCard) =>
    JSON.stringify([value.name, value.locations, value.description, value.links]);
  return !!card.name.trim() && key(card) !== key(record);
}

/** True when linking a live project changes the card's name or description, the two details it always takes. */
export function replacesNameOrDescription(card: PublicCard, record: PublicCard): boolean {
  return replacesCard(card, { ...card, name: record.name, description: record.description });
}
