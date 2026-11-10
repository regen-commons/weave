import { fullDate } from "../home.ts";
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

/** The four public details as a review lists them. */
export function publicFacts(card: PublicCard): { term: string; value: string }[] {
  return [
    { term: "Name", value: card.name || "Not stated" },
    { term: "Where", value: card.locations.join("; ") || "Not stated" },
    { term: "About", value: card.description || "Not stated" },
    { term: "Links", value: card.links.join(", ") || "None" },
  ];
}

/** True when linking would change any of the card's four public details. */
export function replacesCard(card: PublicCard, record: PublicCard): boolean {
  const key = (value: PublicCard) =>
    JSON.stringify([value.name, value.locations, value.description, value.links]);
  return !!card.name.trim() && key(card) !== key(record);
}
