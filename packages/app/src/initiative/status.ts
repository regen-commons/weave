import type { DeviceDraft } from "../describe/contracts.ts";
import type { DeviceStorage } from "../describe/controller.ts";
import { hasDraft, previewFields } from "../describe/view.ts";
import { fullDate } from "../home.ts";
import { asksWithoutKind, intakeComplete } from "../intake/finish.ts";
import type { RouteName } from "../routes.ts";
import type { Entries, PublicCard, SocialState, WorkspaceState } from "../social/fixture.ts";

/** The card's one-line state: where it is kept, and the widest audience that can see any of it. */
export type CardState = "none" | "device" | "saving" | "memory" | "conflict" | "saved" | "shared" | "published";
/**
 * One of the two ways an entry leaves the team: sharing for matching, or publishing.
 * Each is its own explicit action, so each has its own state and line.
 */
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
  readonly sharing: Exposure | null;
  readonly publishing: Exposure | null;
}

export function cardName(draft: DeviceDraft): string {
  return (draft.confirmed ?? previewFields(draft)).name.trim() || "Your initiative";
}

/** Where to open the card: its page once checked, otherwise the step it is waiting on. */
export function cardRoute(draft: DeviceDraft): RouteName {
  if (intakeComplete(draft)) return "your-initiative";
  if (draft.confirmed && draft.proposalVersion === draft.inputVersion) return "needs";
  return draft.proposal ? "check-card" : "initiative";
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
/** Sharing or publishing an entry needs at least one kind of support; a private save does not. */
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

/** A team's entries leave from its workspace, so a personal save has to move there first. */
const TEAM_SAVE_FIRST: Exposure = { state: "locked", line: "Save to the team workspace first.", waits: "save" };
const SAVE_FIRST: Exposure = { state: "locked", line: "Save your initiative first.", waits: "save" };
const WORKSPACE_FIRST: Exposure = { state: "locked", line: "Waits for the team workspace.", waits: "workspace" };
/** The lock a linked project puts on sharing and publishing alike, or null when the entries can leave. */
function locked(example: SocialState, project: NonNullable<SocialState["project"]>): Exposure | null {
  if (project.workspace === "absent" || project.workspace === "requested") return WORKSPACE_FIRST;
  if (!example.saved) return SAVE_FIRST;
  if (project.workspace === "open" && example.saved.place !== "workspace") return TEAM_SAVE_FIRST;
  return null;
}
function sharingOf(draft: DeviceDraft, example: SocialState): Exposure {
  const project = example.identity ? example.project : null;
  if (!project)
    return { state: "locked", line: "Sharing for matching needs a Certified project.", waits: "project" };
  const lock = locked(example, project);
  if (lock) return lock;
  if (!example.shared)
    return {
      state: "off",
      line: project.group
        ? "Not shared. Only your team sees your needs and offers."
        : "Not shared. Only you see your needs and offers.",
      waits: null,
    };
  const { entries, until, key } = example.shared;
  if (key !== null && key !== publicKey(draft, entries))
    return {
      state: "changed",
      line: "Changed since you shared. The earlier version is out of matching, and your changes stay private until you share again.",
      waits: null,
    };
  return {
    state: "on",
    line: `${entryCount(chosenEntries(draft, entries))} shared with people signed in${until ? ` until ${fullDate(until)}` : " until closed or withdrawn"}.`,
    waits: null,
  };
}
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
  // Publishing authority comes from the Certified group, so a plain member reads why there is no action.
  if (project.group && project.role === "member")
    return { state: "locked", line: "Only a group admin or owner can publish on Certified.", waits: "authority" };
  return locked(example, project) ?? { state: "off", line: "Not published.", waits: null };
}

/** What the saving and sharing section shows: the steps open now, the one to take next, and a line for the rest. */
export interface OpenSteps {
  /** The step to take next; it alone gets the filled button. Null when nothing waits on the person. */
  readonly lead: "save" | "workspace" | "project" | "share" | null;
  /** Sharing has a row once it is open, and while the project it needs is the next step. */
  readonly sharing: Exposure | null;
  /** Publishing has a row once it is open. */
  readonly publishing: Exposure | null;
  /** The steps still closed and what opens them, so no row repeats a lock. Empty when none is closed. */
  readonly later: string;
}
const OPENS: Record<"project" | "workspace" | "save", string> = {
  project: "once you save and link a Certified project",
  workspace: "once the team workspace is set up",
  save: "once you save",
};
const open = (exposure: Exposure | null): Exposure | null =>
  exposure && exposure.state !== "locked" ? exposure : null;

/**
 * Chooses the rows for the saving and sharing section. A closed step gets no row of its own: one
 * line under the open rows says what opens it, so the page never shows a button that cannot be used.
 */
export function openSteps(status: CardStatus, workspace: WorkspaceState | null): OpenSteps {
  const waiting = workspace === "absent" || workspace === "requested";
  const kept = status.state === "saved" || status.state === "shared" || status.state === "published";
  const shareOpen = open(status.sharing);
  const lead: OpenSteps["lead"] = status.save
    ? "save"
    : waiting
      ? "workspace"
      : kept && status.sharing?.waits === "project"
        ? "project"
        : shareOpen && shareOpen.state !== "on"
          ? "share"
          : null;
  const sharing = lead === "project" ? status.sharing : shareOpen;
  const publishing = open(status.publishing);
  const closedSharing = sharing ? null : status.sharing;
  const closedPublishing = publishing ? null : status.publishing;
  const lines: string[] = [];
  const sharingWaits = closedSharing?.waits;
  const publishingWaits = closedPublishing?.waits;
  if (sharingWaits && sharingWaits !== "authority")
    lines.push(
      publishingWaits === sharingWaits
        ? `Sharing for matching and publishing open ${OPENS[sharingWaits]}.`
        : `Sharing for matching opens ${OPENS[sharingWaits]}.`,
    );
  else if (publishingWaits && publishingWaits !== "authority") lines.push(`Publishing opens ${OPENS[publishingWaits]}.`);
  // Authority is not a step the person can take, so its own sentence says who can.
  if (closedPublishing && publishingWaits === "authority") lines.push(closedPublishing.line);
  return { lead, sharing, publishing, later: lines.join(" ") };
}

/** What the live account holds for this card: no session, nothing, this version, or an earlier one. */
export type AccountSave = "signed-out" | "none" | "current" | "changed";

/** Saving does not back up source words or files. Said where the person saves. */
const SAVING_LIMIT = "Files and conversations stay on this device.";

export function cardStatus(
  draft: DeviceDraft,
  storage: DeviceStorage,
  example: SocialState | null,
  account: AccountSave,
): CardStatus {
  const signed = example ? !!example.identity : account !== "signed-out";
  const sharing = example ? sharingOf(draft, example) : null;
  const publishing = example ? publishingOf(draft, example) : null;
  const saved = example
    ? signed
      ? example.saved
      : null
    : account === "current" || account === "changed"
      ? { place: "private" as const, key: null }
      : null;
  const unsaved =
    !!saved && (example ? saved.key !== null && saved.key !== publicKey(draft) : account === "changed");
  // Where a save goes now: the linked project's open workspace, otherwise the person's private saves.
  const team = signed && example?.project?.workspace === "open" ? example.project.group : null;
  const rows = { unsaved, save: saveStep(draft, signed, saved, unsaved, team, !example), sharing, publishing };
  if (saved) {
    const group = saved.place === "workspace" ? example?.project?.group : null;
    return {
      state: publishing && publishing.state !== "locked" && publishing.state !== "off"
        ? "published"
        : sharing?.state === "on" || sharing?.state === "changed"
          ? "shared"
          : "saved",
      line: unsaved
        ? group
          ? "Changed on this device since you saved. Your team still sees the earlier version."
          : "Changed on this device since you saved."
        : group
          ? `Saved in the ${group} workspace. Teammates with access can see it.`
          : "Saved privately in Weave. Only you can see it.",
      ...rows,
    };
  }
  if (!hasDraft(draft)) return { state: "none", line: "", ...rows };
  if (storage === "saving") return { state: "saving", line: "Saving on this device.", ...rows };
  if (storage === "memory") return { state: "memory", line: "Not saved on this device.", ...rows };
  if (storage === "conflict") return { state: "conflict", line: "Draft changed in another tab.", ...rows };
  return { state: "device", line: "On this device only.", ...rows };
}

function saveStep(
  draft: DeviceDraft,
  signed: boolean,
  saved: { readonly place: "private" | "workspace" } | null,
  unsaved: boolean,
  team: string | null,
  live: boolean,
): SaveStep | null {
  if (!intakeComplete(draft)) return null;
  if (!signed) return { needs: "sign-in", label: "Sign in to save", note: "" };
  // A personal save does not follow the person into a team workspace on its own.
  const moves = !!saved && !!team && saved.place !== "workspace";
  if (saved && !unsaved && !moves) return null;
  // The live account still rejects an entry with no kind of support, so say it before the tap.
  const missing = live ? asksWithoutKind(draft)[0] : undefined;
  return {
    needs: "save",
    label: unsaved && !moves ? "Save changes" : team ? "Save to team workspace" : "Save privately",
    note: missing
      ? `Add a kind of support to "${missing.title}" first. Saving needs one on every need and offer.`
      : team
        ? `Teammates with access to the ${team} workspace can see it. ${SAVING_LIMIT}`
        : `Only you can see it. ${SAVING_LIMIT}`,
  };
}
