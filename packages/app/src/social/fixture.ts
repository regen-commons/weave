/**
 * Development-only example of Certified sign-in, saving, project linking, team
 * workspaces, sharing for matching and publishing. It sends nothing, stores nothing
 * and grants no real access. Where the services are not built yet, it shows the
 * first-release target so the interface can be reviewed.
 */
import type { Scenario } from "../fixtures.ts";

/** Chosen need and offer identities, or every kept one. */
export type Entries = readonly string[] | "all";
export type ProjectRole = "owner" | "admin" | "member";
/** A project's team workspace: open to this person, not set up, asked for, or none because the project is personal. */
export type WorkspaceState = "open" | "absent" | "requested" | "solo";
export interface CertifiedRecord {
  readonly uri: string;
  readonly name: string;
  readonly locations: readonly string[];
  readonly description: string;
  readonly links: readonly string[];
  readonly publishedOn: string;
  /** The Certified group the project belongs to; null for a personal project. */
  readonly group: string | null;
  readonly role: ProjectRole;
  /** A Weave workspace exists and this person already has access to it. */
  readonly workspace: boolean;
  readonly workspaceId?: string;
  readonly accessRole?: "viewer" | "editor" | "admin";
  /** Fields this provider actually supplied. Missing fields never erase local work. */
  readonly verifiedFields?: readonly (keyof PublicCard)[];
}
/** The Certified project this device's card belongs to. */
export interface ProjectLink {
  readonly uri: string;
  readonly name: string;
  readonly group: string | null;
  readonly role: ProjectRole;
  readonly workspace: WorkspaceState;
  readonly publishedOn: string;
  /** The day this person asked for the workspace to be set up. */
  readonly requestedOn: string | null;
  /** Created from Weave in this example, rather than chosen from existing projects. */
  readonly created: boolean;
  readonly workspaceId?: string;
  readonly accessRole?: "viewer" | "editor" | "admin";
}
export interface SavedCard {
  readonly id: string;
  readonly name: string;
  readonly savedOn: string;
}
export interface SocialState {
  readonly identity: { readonly handle: string; readonly id?: string } | null;
  /** Where Weave holds a copy of this device's card: for this person only, or for the project's team. */
  /**
   * The saved copy. `key` is what was saved, so the page can say when this device has
   * moved on since; a seeded example has none and counts as current.
   */
  readonly saved: {
    readonly place: "private" | "workspace";
    readonly on: string;
    readonly key: string | null;
    /** The private save this is, so a renamed card stays one save. Null in a team workspace. */
    readonly card: string | null;
  } | null;
  readonly project: ProjectLink | null;
  /** Entries shared for matching with people signed in. The key is what was shared; null when seeded. */
  readonly shared: { readonly entries: Entries; readonly until: string | null; readonly key: string | null } | null;
  /** Entries published to AT Protocol through Certified, and the day a withdrawal was asked for. */
  readonly published: {
    readonly on: string;
    readonly entries: Entries;
    readonly key: string | null;
    readonly withdrawal: string | null;
  } | null;
  /** The person's projects on Certified. */
  readonly records: readonly CertifiedRecord[];
  /** Private saves that belong to no team workspace. */
  readonly cards: readonly SavedCard[];
  readonly workspaces?: readonly CertifiedRecord[];
  readonly setupRequests?: readonly { requestId: string; projectUri: string; name: string }[];
  readonly hasMoreCards?: boolean;
  readonly reminders: readonly string[];
  /** Matches saved to come back to. Saving one sends nothing to the other initiative. */
  readonly leads: readonly string[];
  readonly notifications: { readonly funding: boolean; readonly partners: boolean };
}
export interface PublicCard {
  readonly name: string;
  readonly locations: readonly string[];
  readonly description: string;
  readonly links: readonly string[];
}
export interface SocialService {
  snapshot(): SocialState;
  /** Signing in only identifies the person. It saves, loads and shares nothing. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  save(name: string, place?: "private" | "workspace", key?: string | null): Promise<void>;
  /** Selects an authorized project. The live adapter stores its reviewed public fields on the device; team Save stays separate. */
  linkProject(uri: string, signal?: AbortSignal): Promise<ProjectLink>;
  /** Opens a project's team workspace that already exists and reads what the team saved there. */
  openWorkspace(uri: string, key: string | null): Promise<ProjectLink>;
  /** Loads a private save onto this device. Loading saves nothing new and links nothing. */
  openCard(id: string, key: string | null): Promise<void>;
  /** Legacy creator recovery only in the live adapter. New public projects use the external editors. */
  createProject(card: PublicCard, groupLabel?: string): Promise<ProjectLink>;
  /** A member asks the group's admin or owner to set up the team workspace. */
  requestWorkspace(): Promise<void>;
  /** Reads the latest state from Certified. In this example a pending request or withdrawal is then confirmed. */
  checkAgain(): Promise<void>;
  share(entries: readonly string[], key: string): Promise<void>;
  stopSharing(): Promise<void>;
  publish(entries: readonly string[], key: string): Promise<void>;
  withdraw(): Promise<void>;
  clearCard(): Promise<void>;
  remind(id: string): Promise<void>;
  saveLead(id: string): Promise<void>;
  removeLead(id: string): Promise<void>;
  notify(kind: "funding" | "partners", enabled: boolean): Promise<void>;
  deleteAccount(): Promise<void>;
  approveSetup?(projectUri: string, requestId: string): Promise<void>;
  recoverWorkspace?(projectUri: string): Promise<void>;
  moreCards?(): Promise<void>;
}

export const EXAMPLE_HANDLE = "orchard.certified.one";
const DAY = 86_400_000;
const EXAMPLE_DID = "at://did:plc:example-orchard/org.hypercerts.collection";
/** A group project whose team workspace this person can already open. */
export const ORCHARD_RECORD: CertifiedRecord = {
  uri: `${EXAMPLE_DID}/orchard-learning-circle`,
  name: "Orchard learning circle",
  locations: ["Upper valley, Brazil"],
  description: "Families restore an old orchard and share what they learn about soil, water and seed saving.",
  links: ["https://example.org/orchard"],
  publishedOn: "2026-11-02",
  group: "Upper valley growers",
  role: "admin",
  workspace: true,
};
/** A group project with no team workspace yet, so a member has to ask for one. */
export const SEED_LIBRARY_RECORD: CertifiedRecord = {
  uri: `${EXAMPLE_DID}/seed-library`,
  name: "Seed library of the upper valley",
  locations: ["Upper valley, Brazil"],
  description: "A shared seed library with a seasonal exchange and a growing guide for the valley's schools.",
  links: [],
  publishedOn: "2026-10-12",
  group: "Valley seed keepers",
  role: "member",
  workspace: false,
};
/** A personal project, which stays with one person. */
export const WATER_NOTES_RECORD: CertifiedRecord = {
  uri: `${EXAMPLE_DID}/water-notes`,
  name: "Spring water notes",
  locations: ["Upper valley, Brazil"],
  description: "One person's field notes on the valley's springs through the dry season.",
  links: [],
  publishedOn: "2026-09-20",
  group: null,
  role: "owner",
  workspace: false,
};
const EXAMPLE_RECORDS = [ORCHARD_RECORD, SEED_LIBRARY_RECORD, WATER_NOTES_RECORD] as const;

/** Where this device's card is kept. */
export const savedPlace = (state: SocialState): "device" | "private" | "workspace" =>
  state.identity && state.saved ? state.saved.place : "device";

/**
 * Which partner suggestions a person can see. Funding needs none of this. A linked
 * project sees suggestions from public sources while its entries stay private, and
 * searching what other teams shared needs one shared entry of its own. A share the
 * card has moved on from is out of matching, so `current` false opens public sources only.
 */
export type PartnerAccess = "unlinked" | "public" | "network";
export const partnerAccessOf = (state: SocialState, current = true): PartnerAccess =>
  !state.identity || !state.project ? "unlinked" : state.shared && current ? "network" : "public";

/** A share has no end date: it stays discoverable until the team closes or withdraws it. */
export function sharingEnds(_today: string): string | null {
  return null;
}
const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 60) || "initiative";

const orchardCard = (savedOn: string): SavedCard => ({ id: slug(ORCHARD_RECORD.name), name: ORCHARD_RECORD.name, savedOn });
const linkTo = (record: CertifiedRecord, created = false): ProjectLink => ({
  uri: record.uri,
  name: record.name,
  group: record.group,
  role: record.role,
  workspace: !record.group ? "solo" : record.workspace ? "open" : "absent",
  publishedOn: record.publishedOn,
  requestedOn: null,
  created,
});
const EMPTY: SocialState = {
  identity: null,
  saved: null,
  project: null,
  shared: null,
  published: null,
  records: [],
  cards: [],
  reminders: [],
  leads: [],
  notifications: { funding: false, partners: false },
};

export function createSocialFixture(
  scenario: Scenario,
  today = "2026-11-04",
  outcome: () => "ok" | "fail" = () => "ok",
  projects: "some" | "none" = "some",
): SocialService {
  const signed = scenario !== "visitor" && scenario !== "draft";
  const linked = scenario === "workspace" || scenario === "shared" || scenario === "published";
  const sharing = scenario === "shared" || scenario === "published";
  // A linked example always has its project; otherwise the person has some projects or none.
  const owned = linked || projects === "some" ? EXAMPLE_RECORDS : [];
  const seeded = orchardCard(scenario === "returning" ? "2026-11-01" : "2026-11-03");
  let state: SocialState = {
    ...EMPTY,
    identity: signed ? { handle: EXAMPLE_HANDLE } : null,
    saved: linked
      ? { place: "workspace", on: "2026-11-03", key: null, card: null }
      : scenario === "private"
        ? { place: "private", on: seeded.savedOn, key: null, card: seeded.id }
        : null,
    project: linked ? linkTo(ORCHARD_RECORD) : null,
    shared: sharing ? { entries: "all", until: sharingEnds(today), key: null } : null,
    published:
      scenario === "published" ? { on: "2026-11-02", entries: "all", key: null, withdrawal: null } : null,
    records: signed ? owned : [],
    cards: signed && !linked ? [seeded] : [],
  };
  function identity() {
    if (!state.identity) throw new Error("Sign in with Certified first.");
  }
  function saved() {
    identity();
    if (!state.saved) throw new Error("Save your initiative first.");
  }
  function project(): ProjectLink {
    identity();
    if (!state.project) throw new Error("Link a Certified project first.");
    return state.project;
  }
  function chosen(entries: readonly string[]) {
    if (!entries.length) throw new Error("Choose at least one need or offer.");
  }
  /** A team's entries leave from its workspace. A personal project's leave from the person's own save. */
  function leaves(): ProjectLink {
    saved();
    const link = project();
    if (link.workspace === "absent" || link.workspace === "requested")
      throw new Error("This project has no team workspace you can open yet.");
    if (link.workspace === "open" && state.saved?.place !== "workspace")
      throw new Error("Save to the team workspace first.");
    return link;
  }
  return {
    snapshot: () => state,
    async signIn() {
      state = { ...state, identity: { handle: EXAMPLE_HANDLE }, records: state.records.length ? state.records : owned };
    },
    async signOut() {
      state = { ...state, identity: null, saved: null, project: null, shared: null, published: null };
    },
    async save(name, place = "private", key = null) {
      identity();
      if (place === "workspace" && state.project?.workspace !== "open")
        throw new Error("This project has no team workspace you can open yet.");
      // A private save keeps its identity when the card is renamed, so a new name never makes a second save.
      const open = state.saved?.card ?? null;
      const id = place === "private" ? (open ?? slug(name)) : null;
      const others = state.cards.filter((card) => card.id !== (id ?? open));
      state = {
        ...state,
        saved: { place, on: today, key, card: id },
        // A team workspace holds its own copy, so a private save that moves there leaves the personal list.
        cards: id ? [{ id, name, savedOn: today }, ...others] : others,
      };
    },
    async linkProject(uri) {
      identity();
      const record = state.records.find((item) => item.uri === uri);
      if (!record) throw new Error("This project is not on Certified any more.");
      const link = linkTo(record);
      const open = link.workspace === "open";
      const moved = open ? (state.saved?.card ?? null) : null;
      state = {
        ...state,
        project: link,
        // An open workspace takes an existing private save with it. Linking alone saves nothing.
        saved: open && state.saved ? { ...state.saved, place: "workspace", card: null } : state.saved,
        cards: moved ? state.cards.filter((card) => card.id !== moved) : state.cards,
        shared: null,
        published: null,
      };
      return link;
    },
    async openWorkspace(uri, key) {
      identity();
      const record = state.records.find((item) => item.uri === uri);
      if (!record) throw new Error("This project is not on Certified any more.");
      const link = linkTo(record);
      if (link.workspace !== "open") throw new Error("This project has no team workspace you can open yet.");
      // The workspace already holds the team's copy, so opening it saves nothing new.
      state = {
        ...state,
        project: link,
        saved: { place: "workspace", on: record.publishedOn, key, card: null },
        shared: null,
        published: null,
      };
      return link;
    },
    async openCard(id, key) {
      identity();
      const card = state.cards.find((item) => item.id === id);
      if (!card) throw new Error("This saved initiative is not in Weave any more.");
      state = {
        ...state,
        saved: { place: "private", on: card.savedOn, key, card: card.id },
        project: null,
        shared: null,
        published: null,
      };
    },
    async createProject(card) {
      identity();
      if (outcome() === "fail") throw new Error("Certified did not confirm the project. Nothing was created.");
      const record: CertifiedRecord = {
        uri: `${EXAMPLE_DID}/${slug(card.name)}`,
        name: card.name,
        locations: [...card.locations],
        description: card.description,
        links: [...card.links],
        publishedOn: today,
        group: card.name,
        role: "owner",
        workspace: true,
      };
      const link = linkTo(record, true);
      // The new group's workspace takes the private save the project was made from.
      const moved = state.saved?.card ?? null;
      state = {
        ...state,
        project: link,
        saved: state.saved ? { ...state.saved, place: "workspace", card: null } : null,
        cards: moved ? state.cards.filter((item) => item.id !== moved) : state.cards,
        records: [record, ...state.records.filter((item) => item.uri !== record.uri)],
        shared: null,
        published: null,
      };
      return link;
    },
    async requestWorkspace() {
      const link = project();
      if (link.workspace !== "absent") throw new Error("This project does not need a workspace request.");
      state = { ...state, project: { ...link, workspace: "requested", requestedOn: today } };
    },
    async checkAgain() {
      identity();
      state = {
        ...state,
        project:
          state.project?.workspace === "requested" ? { ...state.project, workspace: "open" } : state.project,
        published: state.published?.withdrawal ? null : state.published,
      };
    },
    async share(entries, key) {
      leaves();
      chosen(entries);
      state = { ...state, shared: { entries: [...entries], until: sharingEnds(today), key } };
    },
    async stopSharing() {
      identity();
      // Sharing for matching and publishing are separate, so a published entry stays published.
      state = { ...state, shared: null, notifications: { ...state.notifications, partners: false } };
    },
    async publish(entries, key) {
      identity();
      // Publishing authority comes from the Certified group, so it is refused before anything else.
      if (state.project?.group && state.project.role === "member")
        throw new Error("Only a group admin or owner can publish on Certified.");
      leaves();
      chosen(entries);
      if (outcome() === "fail") throw new Error("Certified did not confirm the record. Nothing was published.");
      state = {
        ...state,
        published: { on: state.published?.on ?? today, entries: [...entries], key, withdrawal: null },
      };
    },
    async withdraw() {
      identity();
      if (!state.published) throw new Error("Nothing is published.");
      state = { ...state, published: { ...state.published, withdrawal: today } };
    },
    async clearCard() {
      state = { ...state, saved: null, project: null, shared: null, published: null };
    },
    async remind(id) {
      saved();
      state = { ...state, reminders: [...new Set([...state.reminders, id])] };
    },
    async saveLead(id) {
      project();
      state = { ...state, leads: [...new Set([...state.leads, id])] };
    },
    async removeLead(id) {
      identity();
      state = { ...state, leads: state.leads.filter((lead) => lead !== id) };
    },
    async notify(kind, enabled) {
      identity();
      if (kind === "partners" && enabled && !state.shared)
        throw new Error("Share a need or offer before asking for partner updates.");
      state = { ...state, notifications: { ...state.notifications, [kind]: enabled } };
    },
    async deleteAccount() {
      identity();
      state = EMPTY;
    },
  };
}
