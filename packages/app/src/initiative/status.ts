import type { DeviceDraft } from "../describe/contracts.ts";
import type { DeviceStorage } from "../describe/controller.ts";
import { hasDraft, previewFields } from "../describe/view.ts";
import { fullDate } from "../home.ts";
import { intakeComplete } from "../intake/finish.ts";
import { reviewStep } from "../intake/state.ts";
import type { RouteName } from "../routes.ts";
import type { Entries, PublicCard, SocialState, WorkspaceState } from "../social/fixture.ts";

/** The card's one-line state: where it is kept, and the widest audience that can see any of it. */
export type CardState = "none" | "device" | "memory" | "saved" | "shared" | "published";
/** Publishing, the one way an entry leaves the team now (DL-155), with its own state and line. */
export interface Exposure {
  /** `locked` needs an earlier step first; `changed` means the card moved on since; `withdrawing` waits on Certified. */
  readonly state: "locked" | "off" | "on" | "changed" | "withdrawing";
  readonly line: string;
  /** The earlier step a locked exposure waits on, so a page can offer that step. Null unless locked. */
  readonly waits: "project" | "workspace" | "save" | "authority" | null;
}
/** The one saving step open to the person now. Signing in and saving are separate taps. */
export interface SaveStep {
  readonly needs: "sign-in" | "save";
  readonly label: string;
  /** What the tap saves and who can see it there, said before the tap. Empty where the door says it. */
  readonly note: string;
}
export interface CardStatus {
  readonly state: CardState;
  /** Where the card is kept and who can open it there. */
  readonly line: string;
  /** A saved copy exists and this device has moved on since. Saving again is the person's call. */
  readonly unsaved: boolean;
  /** Null while the card is unchecked and once the saved copy is current. */
  readonly save: SaveStep | null;
  /** Null where the service is not built, so the page shows no row for it. */
  readonly publishing: Exposure | null;
}

export function cardName(draft: DeviceDraft): string {
  return (draft.confirmed ?? previewFields(draft)).name.trim() || "Your initiative";
}

/** Where to open the card: its page once checked, otherwise the step it is waiting on. */
/** A step's list is checked as it stands now, by the rule `intakeComplete` applies to both. */
function stepChecked(draft: DeviceDraft, kind: "needs" | "offers"): boolean {
  try {
    return draft[kind].reviewedVersion === draft[kind].inputVersion && reviewStep(draft[kind]).reviewedVersion === draft[kind].inputVersion;
  } catch {
    return false;
  }
}
/** Where a card is waiting: its first step that is not done. Needs and offers are two steps. */
export function cardRoute(draft: DeviceDraft): RouteName {
  if (intakeComplete(draft)) return "your-initiative";
  if (!(draft.confirmed && draft.proposalVersion === draft.inputVersion)) return "initiative";
  return stepChecked(draft, "needs") ? "offers" : "needs";
}
/**
 * Where Continue on the first step goes. A change there leaves needs and offers checked, so a card
 * whose lists are both checked goes back to its own page, and one press brings the matches back.
 * Otherwise the steps go on in order, to needs (DL-113).
 */
export function afterInitiative(draft: DeviceDraft): RouteName {
  return intakeComplete(draft) ? "your-initiative" : "needs";
}
/** Only the first step waits: the card changed there, and its needs and offers are still checked. */
export function onlyInitiativeWaits(draft: DeviceDraft): boolean {
  return cardRoute(draft) === "initiative" && stepChecked(draft, "needs") && stepChecked(draft, "offers");
}

export function chosenEntries(draft: DeviceDraft, entries: Entries) {
  return (["needs", "offers"] as const).flatMap((kind) =>
    draft[kind].items
      .filter((item) => item.decision === "kept" && (entries === "all" || entries.includes(item.id)))
      .map((item) => ({
        kind,
        id: item.id,
        title: item.value.title,
        kinds: item.value.capitalForms,
        value: item.value,
      })),
  );
}
/** Publishing an entry needs at least one kind of support; a team save does not. */
export function shareable(draft: DeviceDraft, entries: Entries = "all") {
  return chosenEntries(draft, entries).filter((entry) => entry.kinds.length > 0);
}

/** "2 needs, 1 offer": the count is the label. */
export function entryCount(entries: readonly { kind: "needs" | "offers" }[]): string {
  const part = (kind: "needs" | "offers", one: string, many: string) => {
    const count = entries.filter((entry) => entry.kind === kind).length;
    return count ? `${count} ${count === 1 ? one : many}` : "";
  };
  return [part("needs", "need", "needs"), part("offers", "offer", "offers")].filter(Boolean).join(", ") || "Nothing";
}

/** The four details a Certified project carries. Anyone can read them there. */
export function publicCard(draft: DeviceDraft): PublicCard {
  const fields = draft.confirmed ?? previewFields(draft);
  return {
    name: fields.name,
    locations: fields.isGlobal ? ["Global"] : [...fields.locations],
    description: fields.description,
    links: [...fields.links],
  };
}

/** What leaves the team: the four public fields and the chosen needs and offers with their kinds of support. */
export function publicKey(draft: DeviceDraft, entries: Entries = "all"): string {
  const fields = draft.confirmed ?? previewFields(draft);
  return JSON.stringify({
    name: fields.name,
    locations: fields.locations,
    isGlobal: fields.isGlobal,
    description: fields.description,
    links: fields.links,
    entries: chosenEntries(draft, entries).map((entry) => `${entry.kind}:${entry.title}:${entry.kinds.join()}`),
  });
}

/** A group project's entries leave from its shared team draft (D48), so the card is saved there first. */
const TEAM_SAVE_FIRST: Exposure = { state: "locked", line: "Save to the team workspace first.", waits: "save" };
const WORKSPACE_FIRST: Exposure = { state: "locked", line: "Waits for the team workspace.", waits: "workspace" };
/** What a teammate without edit access reads, wherever publishing for a group is refused. */
export const GROUP_PUBLISH_AUTHORITY = "Only teammates who can edit the team workspace can publish. Ask a workspace admin for edit access.";
/**
 * Whether this person may publish for a group project: a Weave editor or admin grant in its team workspace, as
 * Platform and the API require with current group membership (the user, 28 November 2026). A plain group member
 * with an editor grant can; an admin or owner of the group with only a viewer grant cannot.
 */
export function canPublishForGroup(project: { readonly accessRole?: "viewer" | "editor" | "admin" }): boolean {
  return project.accessRole === "editor" || project.accessRole === "admin";
}
const NO_EDIT_ACCESS: Exposure = { state: "locked", line: GROUP_PUBLISH_AUTHORITY, waits: "authority" };
/**
 * The lock a linked project puts on publishing, or null when the entries can leave. A person's own card
 * publishes straight from the draft (DL-155); a group project waits for its team workspace, then for edit
 * access in it, then for its team draft.
 */
function locked(example: SocialState, project: NonNullable<SocialState["project"]>): Exposure | null {
  if (project.workspace === "absent" || project.workspace === "requested") return WORKSPACE_FIRST;
  if (project.group && !canPublishForGroup(project)) return NO_EDIT_ACCESS;
  if (project.workspace === "open" && example.saved?.place !== "workspace") return TEAM_SAVE_FIRST;
  return null;
}
/**
 * Publishing puts needs and offers on Certified as public listings of the project; the project itself
 * is already there. The row and its button say which, so a project from Certified never reads as not
 * published.
 */
export const PUBLISH_ACTION = "Publish Needs And Offers";
export const NOT_PUBLIC_LINE = "Your project is on Certified. Its needs and offers are not public.";
export const publicListingsLine = (count: number): string =>
  `${count} ${count === 1 ? "need or offer" : "needs and offers"} public on Certified.`;

function publishingOf(draft: DeviceDraft, example: SocialState): Exposure | null {
  const project = example.identity ? example.project : null;
  // Publishing goes through a Certified project, so there is nothing to say about it before one is linked.
  if (!project) return null;
  const published = example.published;
  if (published?.withdrawal)
    return {
      state: "withdrawing",
      line: `Withdrawal asked for on ${fullDate(published.withdrawal)}. The listing can stay readable until Certified confirms.`,
      waits: null,
    };
  if (published && published.key !== null && published.key !== publicKey(draft, published.entries))
    return {
      state: "changed",
      line: "Changed since publishing. The earlier listing is being withdrawn, and your changes stay private until you publish again.",
      waits: null,
    };
  if (published)
    return {
      state: "on",
      line: `${entryCount(chosenEntries(draft, published.entries))} published on ${fullDate(published.on)}, for anyone to read.`,
      waits: null,
    };
  return locked(example, project) ?? { state: "off", line: NOT_PUBLIC_LINE, waits: null };
}

/** What the saving and sharing section shows: the steps open now, the one to take next, and a line for the rest. */
export interface OpenSteps {
  /** The step to take next; it alone gets the filled button. Null when nothing waits on the person. */
  readonly lead: "save" | "workspace" | null;
  /** Publishing has a row once it is open. */
  readonly publishing: Exposure | null;
  /** What opens publishing while it is closed, so no row repeats a lock. Empty when it is open or not offered. */
  readonly later: string;
}
const OPENS: Record<"project" | "workspace" | "save", string> = {
  project: "once you link a Certified project",
  workspace: "once the team workspace is set up",
  save: "once you save it to the team workspace",
};

/**
 * Chooses the rows for the saving and sharing section. A closed step gets no row of its own: one line
 * says what opens it, so the page never shows a button that cannot be used. Sharing for matching has no
 * row: it ended with DL-155.
 */
export function openSteps(status: CardStatus, workspace: WorkspaceState | null): OpenSteps {
  const lead: OpenSteps["lead"] = status.save ? "save" : workspace === "absent" || workspace === "requested" ? "workspace" : null;
  const publishing = status.publishing && status.publishing.state !== "locked" ? status.publishing : null;
  const waits = publishing ? null : status.publishing?.waits;
  // Authority is not a step the person can take, so its own sentence says who can.
  const later = !waits ? "" : waits === "authority" ? status.publishing!.line : `Publishing opens ${OPENS[waits]}.`;
  return { lead, publishing, later };
}

/**
 * What a card that exists only in this browser says, on its page and on its badge in Your Initiatives.
 * Nothing is saved privately any more (DL-155): this device and, once published, the project are its places.
 */
export const NOT_SAVED_YET = "On this device";
/**
 * What the live account holds for this card: no session, or a session. Nothing is saved privately any
 * more, and the earlier private saves are gone (DL-155, D49), so the account holds no copy of a card.
 */
export type AccountSave = "signed-out" | "none";

/** Saving to a team does not back up source words or files. Said where the person saves. */
const SAVING_LIMIT = "Files and conversations stay on this device.";

export function cardStatus(
  draft: DeviceDraft,
  storage: DeviceStorage,
  example: SocialState | null,
  account: AccountSave,
): CardStatus {
  const signed = example ? !!example.identity : account !== "signed-out";
  const publishing = example ? publishingOf(draft, example) : null;
  // Only a team workspace holds a copy of a card now. The example world still seeds a private save
  // for its own publishing rules, and the card says what is true of it: it is on this device.
  const saved = example && signed && example.saved?.place === "workspace" ? example.saved : null;
  const unsaved = !!saved && saved.key !== null && saved.key !== publicKey(draft);
  // Where a save goes now: only a linked project's open team workspace, its shared team draft (D48).
  const team = signed && example?.project?.workspace === "open" ? example.project.group : null;
  const rows = { unsaved, save: saveStep(draft, signed, saved, unsaved, team), publishing };
  if (saved) {
    const group = example?.project?.group;
    return {
      state: publishing && publishing.state !== "locked" && publishing.state !== "off" ? "published" : "saved",
      line: unsaved
        ? "Changed on this device since you saved. Your team still sees the earlier version."
        : group
          ? `Saved in the ${group} workspace. Teammates with access can see it.`
          : "Saved in the team workspace. Teammates with access can see it.",
      ...rows,
    };
  }
  if (!hasDraft(draft)) return { state: "none", line: "", ...rows };
  if (storage === "memory") return { state: "memory", line: "Not stored on this device yet.", ...rows };
  // Kept in this browser, whatever an earlier private save left on the draft (DL-155, D49).
  return { state: "device", line: `${NOT_SAVED_YET}.`, ...rows };
}

function saveStep(
  draft: DeviceDraft,
  signed: boolean,
  saved: { readonly place: "private" | "workspace" } | null,
  unsaved: boolean,
  team: string | null,
): SaveStep | null {
  // Nothing is saved privately any more (DL-155, step 4). Only a team's open workspace takes its card (D48).
  if (!intakeComplete(draft) || !signed || !team) return null;
  if (saved && !unsaved) return null;
  return {
    needs: "save",
    label: unsaved ? "Save Changes" : "Save To Team Workspace",
    note: `Teammates with access to the ${team} workspace can see it. ${SAVING_LIMIT}`,
  };
}
