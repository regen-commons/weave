/** The agreed social screens over the same-origin account and project APIs. No fixture identities or content. */
import { parseSummaries, record, uuid, type InitiativeSummary } from "@weave/api/account-contract";
import type { AccountState } from "../account/client.ts";
import { AccountFailure, accountMessage, accountRequest, accountSessionSignal, assertAccount, parseSaved } from "../account/client.ts";
import { AnotherAccountsCard, belongsToAnotherAccount, loadedDraft } from "../account/document.ts";
import { CardReferenced, cardReferences, deleteSavedCard } from "../account/delete-card.ts";
import { withConfirmedSession } from "../account/session-end.ts";
import type { DraftController } from "../describe/controller.ts";
import { hasDraft } from "../describe/view.ts";
import { projectLocations, projectPage, setupPage, workspacePage, type PublicProject } from "../initiative/projects-client.ts";
import { saveForProject } from "../initiative/project-save.ts";
import { chosenProjectUri, projectChoiceKey, projectChoosers } from "./project-choice.ts";
import { linkedProject } from "../initiative/list.ts";
import { submitProjectCreate } from "../initiative/project-creation.ts";
import { draftWithRecord } from "../initiative/import.ts";
import { finishEditorHandoff } from "../initiative/editor-handoff.ts";
import type { CertifiedRecord, ProjectLink, SocialService, SocialState } from "./fixture.ts";

export type LiveSocialService = Pick<SocialService,
  "snapshot" | "signIn" | "signOut" | "save" | "linkProject" | "openWorkspace" | "openCard" |
  "createProject" | "requestWorkspace" | "checkAgain" | "clearCard" | "approveSetup" | "recoverWorkspace" | "moreCards" | "deleteCard"> & {
  reload(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  syncAccount(account: AccountState): void;
  status(): { loading: boolean; problem: string | null; consent: boolean };
};
type Group = { groupDid: string; role: "owner" | "admin" | "member"; displayName?: string; handle?: string };
type Options = { account: AccountState; controller: DraftController; refreshAccount(): Promise<AccountState>;
  /** Asks /api/account, which renews the session, after the projects endpoint refused a request. Defaults to `refreshAccount`. */
  confirmAccount?(): Promise<AccountState>;
  request?: typeof accountRequest; storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "length" | "key">>;
  /**
   * Where project choices are kept. The app gives the device's own storage, so a card linked to a
   * project is still linked in a new tab and after signing in again. Left out, the browser gives
   * none: a choice is then held in memory while the tab is open, and `storage`, the tab's own, is
   * never read for one, because what an earlier build kept there is not a choice (DL-119).
   */
  choices?: (Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "length" | "key">>) | undefined;
  openWorkspace(id: string): void; signIn(): Promise<void>; signedOut(): void };

/**
 * A project as Certified supplied it. Its place counts as supplied only when the source named one. A
 * Certified project has no links of its own; its publisher's links are kept apart and never steer matching.
 */
export function certifiedRecord(project: PublicProject, group?: Group): CertifiedRecord {
  const locations = projectLocations(project);
  return { uri: project.uri, name: project.title, description: project.description ?? "", locations, links: [],
    publishedOn: project.createdAt?.slice(0, 10) ?? "", group: project.groupDid ? group?.displayName ?? group?.handle ?? "Certified group" : null,
    role: project.groupDid ? group?.role ?? "member" : "owner", workspace: false,
    verifiedFields: ["name", "description", ...(locations.length ? ["locations" as const] : [])],
    ...(project.place?.status === "unread" ? { unreadFields: ["locations" as const] } : {}),
    ...(project.publisherLinks?.length ? { publisherLinks: [...project.publisherLinks] } : {}) };
}
const savedCard = (item: InitiativeSummary) => ({ id: item.id, name: item.name, savedOn: item.updatedAt.slice(0, 10), revision: item.revision });
const projectLink = (record: CertifiedRecord): ProjectLink => ({ ...record,
  workspace: !record.group ? "solo" : record.workspace ? "open" : "absent", requestedOn: null, created: false });
export function createLiveSocialService(options: Options): LiveSocialService {
  const request = options.request ?? accountRequest;
  const owner = options.account.user?.id;
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let loading = false, problem: string | null = null, consent = false;
  let reloadGeneration = 0;
  let cardsKey = JSON.stringify(options.account.items), cardsGeneration = 0, nextCardOffset = options.account.items.length;
  // A choice the device could not store, held for as long as the tab is open.
  let selected: { scope: string; uri: string } | null = null;
  // The team workspace this tab opened over its card. It is not a choice and not the card's
  // project: it is never stored, so it ends with the tab and never decides whose the card is.
  let visiting: { scope: string; workspaceId: string } | null = null;
  const choices = options.choices;
  const key = () => projectChoiceKey(owner ?? "", options.controller.getSnapshot().draft.id);
  const requestKey = (uri: string) => `weave-workspace-request/${owner}/${uri}`;
  function linkOf(record: CertifiedRecord): ProjectLink {
    const link = projectLink(record);
    try {
      const on = options.storage?.getItem(requestKey(record.uri));
      if (record.group && !record.workspace && on && /^\d{4}-\d{2}-\d{2}$/u.test(on) && Number.isFinite(Date.parse(on)))
        return { ...link, workspace: "requested", requestedOn: on };
    } catch { /* A receipt is a display hint; it never grants access. */ }
    return link;
  }
  // A choice held in memory is the later one: it is there only because the device turned its write away.
  const selectedUri = () =>
    selected?.scope === key() ? selected.uri : chosenProjectUri(choices, owner, options.controller.getSnapshot().draft.id);
  let state: SocialState = { identity: owner ? { handle: "", id: owner } : null, saved: null, project: null, visit: null, shared: null, published: null,
    records: [], cards: options.account.items.map(savedCard),
    workspaces: [], hasMoreCards: options.account.items.length === 20, reminders: [], leads: [], notifications: { funding: false, partners: false } };
  const emit = () => { if (!lifetime.signal.aborted) for (const notify of listeners) notify(); };
  const checked = () => { lifetime.signal.throwIfAborted(); if (!owner) throw new AccountFailure("sign_in_required"); return owner; };
  const confirmAccount = options.confirmAccount ?? options.refreshAccount;
  async function post(body: unknown) {
    const account = checked();
    const result = await withConfirmedSession(() => request("", body, "/api/projects", lifetime.signal), confirmAccount, account);
    checked();
    return result;
  }
  /**
   * True when the tab's card belongs to another account than this one (DL-055): it was saved by
   * another, or another chose its Certified project for it on this device (DL-119).
   */
  const setAside = () => {
    const draft = options.controller.getSnapshot().draft;
    return belongsToAnotherAccount(draft, owner, choices?.key ? projectChoosers(choices as Pick<Storage, "length" | "key">, draft.id) : []);
  };
  /**
   * The project the tab's card is linked to, among the ones this account can open: the one chosen
   * for it on this device, or the workspace it was saved to, and nothing else. Suggestions read
   * from a project never link a card: a card nobody chose a project for still asks (DL-055). So a
   * link that is still being stored shows nothing new, which matters because the card's page takes
   * its link task away as soon as a new project appears (DL-119).
   */
  const linkedTo = (projects: readonly CertifiedRecord[]) =>
    linkedProject(selectedUri(), options.controller.getSnapshot().draft.account.saved?.id ?? null, projects);
  /**
   * The team workspace this tab opened over its card, while the card is linked to nothing and no
   * project is chosen for it. The team's page reads it to offer saving the card there. It is kept
   * apart from `project`, so the card still reads as not linked and can be linked to its own project.
   */
  const visitOf = (linked: CertifiedRecord | null | undefined) =>
    !linked && !selectedUri() && visiting?.scope === key() ? visiting.workspaceId : null;
  /** The tab's card's project and visit, read again from what is listed now. */
  const cardLinks = (projects: readonly CertifiedRecord[]) => {
    const linked = linkedTo(projects);
    return { project: linked ? linkOf(linked) : null, visit: visitOf(linked) };
  };
  function select(uri: string) {
    // A project choice is recorded against the tab's card. A card that is set aside takes none
    // from this account: a second chooser would make it read as shared and lift its set-aside.
    if (setAside()) return;
    // The only place a choice is written. Held in memory until the device has it, and from then on
    // read from the device, so a choice made in another tab since is not hidden by this one.
    selected = { scope: key(), uri };
    try { if (choices) { choices.setItem(key(), uri); selected = null; } } catch { /* This tab retains the selection; no authority is cached. */ }
  }
  async function allPages<T>(read: (cursor?: string) => Promise<{ items: T[]; cursor?: string }>) {
    const items: T[] = [], seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await read(cursor); checked(); items.push(...page.items);
      cursor = page.cursor;
      if (cursor && seen.has(cursor)) throw Error("The project list could not finish loading. Try again.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  async function reload() {
    if (!owner || lifetime.signal.aborted) return;
    const generation = ++reloadGeneration;
    const current = () => generation === reloadGeneration && !lifetime.signal.aborted;
    loading = true; problem = null; consent = false; emit();
    try {
      const [groups, workspaces, personal] = await Promise.allSettled([
        allPages<Group>(async cursor => {
          const page = await post({ action: "list_project_groups", ...(cursor ? { cursor } : {}) });
          if (!Array.isArray(page.groups)) throw Error();
          const items = page.groups.map(input => {
            const g = record(input);
            if (typeof g.groupDid !== "string" || !["owner", "admin", "member"].includes(String(g.role))) throw Error();
            return { groupDid: g.groupDid, role: g.role as Group["role"],
              ...(typeof g.displayName === "string" ? { displayName: g.displayName } : {}), ...(typeof g.handle === "string" ? { handle: g.handle } : {}) };
          });
          return { items, cursor: typeof page.cursor === "string" ? page.cursor : undefined };
        }),
        allPages(async cursor => { const page = workspacePage(await post({ action: "list_workspaces", ...(cursor ? { cursor } : {}) }));
          return { items: page.workspaces, cursor: page.cursor }; }),
        allPages(async cursor => { const page = projectPage(await post({ action: "list_projects", target: { kind: "personal" }, ...(cursor ? { cursor } : {}) }));
          return { items: page.projects, cursor: page.cursor }; }),
      ]);
      checked();
      if (!current()) return;
      const records: CertifiedRecord[] = personal.status === "fulfilled" ? personal.value.map(p => certifiedRecord(p)) : [];
      const failures: unknown[] = [groups, workspaces, personal].flatMap(result => result.status === "rejected" ? [result.reason] : []);
      const setupRequests: { requestId: string; projectUri: string; name: string }[] = [];
      if (workspaces.status === "fulfilled") {
        state = { ...state, records, workspaces: workspaces.value.map(w => ({
          ...(w.project ? certifiedRecord(w.project, groups.status === "fulfilled" ? groups.value.find(group => group.groupDid === w.project?.groupDid) : undefined)
            : { uri: w.projectUri, name: "Project unavailable on Certified", locations: [], links: [], description: "", publishedOn: "", group: w.kind === "group" ? "Certified group" : null, role: "member" as const, workspace: false }),
          workspace: true, workspaceId: w.workspaceId, accessRole: w.accessRole,
        })) }; emit();
      }
      // Bound concurrent public reads rather than sending one request for every group at once.
      if (groups.status === "fulfilled") for (let start = 0; start < groups.value.length; start += 4) {
        const pages = await Promise.allSettled(groups.value.slice(start, start + 4).map(async group => {
          if (group.role === "owner" || group.role === "admin") {
            const pending = await allPages(async cursor => {
              const page = setupPage(await post({ action: "list_workspaces", setupGroupDid: group.groupDid,
                ...(cursor ? { setupCursor: cursor } : {}) }), group.groupDid);
              return { items: page.requests, cursor: page.cursor };
            });
            setupRequests.push(...pending.map(row => ({ requestId: row.requestId, projectUri: row.projectUri, name: row.project.title })));
          }
          const projects = await allPages(async cursor => { const page = projectPage(await post({ action: "list_projects",
            target: { kind: "group", groupDid: group.groupDid }, ...(cursor ? { cursor } : {}) }));
            return { items: page.projects, cursor: page.cursor }; });
          return projects.map(project => certifiedRecord(project, group));
        }));
        if (!current()) return;
        for (const page of pages) if (page.status === "fulfilled") records.push(...page.value); else failures.push(page.reason);
      }
      checked();
      const linked = workspaces.status === "fulfilled" ? workspaces.value.map(w => ({
        ...(records.find(p => p.uri === w.projectUri) ?? (w.project ? certifiedRecord(w.project) : {
          uri: w.projectUri, name: "Project unavailable on Certified", locations: [], links: [], description: "", publishedOn: "",
          group: w.kind === "group" ? "Certified group" : null, role: "member" as const, workspace: false })),
        workspace: true, workspaceId: w.workspaceId, accessRole: w.accessRole,
      })) : [];
      const unique = [...new Map([...records, ...linked].map(p => [p.uri, p])).values()];
      state = { ...state, records: unique.filter(p => !p.workspace), workspaces: linked, setupRequests, ...cardLinks(unique) };
      if (failures.length) {
        consent = failures.some(e => e instanceof AccountFailure && e.code === "project_consent_required");
        problem = consent ? "Allow Weave to check your Certified projects to continue."
          : "Some Certified projects could not be checked. Your private saves are still available.";
      }
    } catch (error) { if (current()) problem = accountMessage(error); }
    finally { if (current()) { loading = false; emit(); } }
  }
  const find = (uri: string) => [...state.records, ...(state.workspaces ?? [])].find(p => p.uri === uri);
  const service: LiveSocialService = {
    snapshot: () => state,
    status: () => ({ loading, problem, consent }),
    subscribe(notify) { listeners.add(notify); return () => listeners.delete(notify); },
    dispose() { queueMicrotask(() => { if (!listeners.size) lifetime.abort(); }); }, reload,
    syncAccount(account) {
      if (account.user?.id !== owner || lifetime.signal.aborted) return;
      const links = cardLinks([...state.records, ...(state.workspaces ?? [])]);
      const nextKey = JSON.stringify(account.items);
      if (cardsKey !== nextKey) {
        cardsKey = nextKey; cardsGeneration++; nextCardOffset = account.items.length;
        state = { ...state, cards: account.items.map(savedCard),
          hasMoreCards: account.items.length === 20 };
      }
      state = { ...state, ...links };
      emit();
    },
    signIn: options.signIn,
    async signOut() { await request("", { action: "sign_out" }); checked(); options.signedOut(); },
    async save(_name, place = "private") {
      checked();
      if (place === "workspace") throw Error("Open the team workspace to review and save this card for your teammates.");
      const project = state.project;
      const receipt = await saveForProject(options.controller, owner!, lifetime.signal);
      if (state.project?.uri !== project?.uri) throw Error("The checked card was saved privately. Your project choice changed; review the link again before sharing.");
      if (project && !project.group) {
        const linked = await post({ action: "link", projectUri: project.uri, ...receipt });
        if (linked.status !== "linked" || linked.workspaceId !== receipt.initiativeId || linked.projectUri !== project.uri || linked.accessRole !== "admin")
          throw Error("Your card was saved privately. This Certified project already has another workspace; open it from Your Initiatives before sharing.");
        const record = find(project.uri);
        if (!record) throw Error("Your card was saved privately. Refresh your projects before sharing.");
        const workspace = { ...record, workspace: true, workspaceId: linked.workspaceId, accessRole: "admin" as const };
        state = { ...state, project: { ...project, workspaceId: linked.workspaceId }, records: state.records.filter(p => p.uri !== project.uri),
          workspaces: [...(state.workspaces ?? []).filter(p => p.uri !== project.uri), workspace] };
      }
      const account = await options.refreshAccount(); checked();
      service.syncAccount(account);
    },
    async linkProject(uri, signal, linkOptions) {
      signal?.throwIfAborted();
      // Linking writes the project's details into the tab's card, so another account's card is refused before anything is asked.
      if (setAside()) throw new AnotherAccountsCard();
      const chosen = find(uri); if (!chosen) throw Error("Check your Certified projects again before linking.");
      const before = options.controller.getSnapshot().draft;
      const result = await post({ action: "lookup", projectUri: uri });
      signal?.throwIfAborted();
      if (options.controller.getSnapshot().draft !== before) throw Error("Your device card changed. Review it before choosing this project again.");
      let link = linkOf(chosen);
      if (result.status === "linked") {
        if (!uuid(result.workspaceId) || result.projectUri !== uri || !["viewer", "editor", "admin"].includes(String(result.accessRole))) throw Error("The workspace could not be checked.");
        // A personal project's workspace is the saved card it was linked to, which the workspace list names. A link
        // made to publish from a draft has no card behind it (DL-155), so the card here is not told of another one.
        if (chosen.group || chosen.workspace) link = { ...link, workspaceId: result.workspaceId, workspace: chosen.group ? "open" : "solo",
          accessRole: result.accessRole === "viewer" ? "viewer" : result.accessRole === "editor" ? "editor" : "admin" };
      } else if (result.status === "access_required") throw Error("Ask a workspace admin for an invitation to this project.");
      else if (result.status !== "unlinked" && result.status !== "pending") throw Error("The project could not be linked.");
      // Publish selection only after the reviewed device update is durable. Its host may
      // remove the link task as soon as state.project appears.
      // A project made from this card already says what the card says, and its page suggests nothing new.
      const linkedDraft = linkOptions?.keepCard ? before : options.controller.change(current => draftWithRecord(current, chosen));
      await options.controller.settled(); checked(); signal?.throwIfAborted();
      const current = options.controller.getSnapshot();
      if (current.draft !== linkedDraft) throw Error("Your device card changed. Review it before choosing this project again.");
      if (current.storage !== "saved") throw Error("The project could not be finished because the latest device changes could not be stored. Keep this tab open and try device storage again.");
      finishEditorHandoff(options.storage, owner!, before.id);
      select(uri); state = { ...state, project: link, visit: null }; emit(); return link;
    },
    async openWorkspace(uri) {
      const p = find(uri); if (!p?.workspaceId) throw Error("Check the workspace list again.");
      await post({ action: "team_load", workspaceId: p.workspaceId });
      const link = projectLink(p);
      // The visit is noted for this tab when its card is this account's and has something in it,
      // so the team's page can offer to save the card there. It is not the card's project and
      // nothing is recorded: a stored choice would link an unrelated card for good, replace the
      // project a card was linked to on purpose, and set the card aside from every other account
      // (DL-119). With another account's card in the tab the workspace still opens, unnoted.
      if (!setAside() && hasDraft(options.controller.getSnapshot().draft)) {
        visiting = { scope: key(), workspaceId: p.workspaceId };
        state = { ...state, ...cardLinks([...state.records, ...(state.workspaces ?? [])]) }; emit();
      }
      options.openWorkspace(p.workspaceId); return link;
    },
    async openCard(id) {
      const signal = AbortSignal.any([lifetime.signal, accountSessionSignal()]);
      signal.throwIfAborted();
      const before = options.controller.getSnapshot().draft;
      const result = await request(`?id=${encodeURIComponent(id)}`, undefined, "/api/account", signal);
      signal.throwIfAborted(); checked(); assertAccount(result, owner!); const saved = parseSaved(result.saved);
      if (saved.id !== id || options.controller.getSnapshot().draft !== before) throw Error("Your device draft changed. Try opening the card again.");
      await options.controller.replace(loadedDraft(saved, owner!), signal); checked();
      selected = null; visiting = null;
      const linked = state.workspaces?.find(p => p.workspaceId === id);
      if (linked) select(linked.uri);
      state = { ...state, project: linked ? projectLink(linked) : null, visit: null }; emit();
    },
    async createProject(card, groupLabel) {
      checked();
      if (!groupLabel) throw Error("Check the group's web address first.");
      if (!options.storage) throw Error("Device storage is needed to keep this creation request safe.");
      const { result } = await submitProjectCreate({ owner: owner!, draftId: options.controller.getSnapshot().draft.id, groupLabel,
        profile: { title: card.name, description: card.description }, storage: options.storage,
        save: () => saveForProject(options.controller, owner!, lifetime.signal), request: post, signal: lifetime.signal, resumeOnly: true });
      if (result.status !== "linked" || !uuid(result.workspaceId) || typeof result.projectUri !== "string")
        throw Error("Certified is still confirming creation. Check again with the same request.");
      select(result.projectUri);
      await reload(); checked();
      const p = find(result.projectUri); if (!p) throw Error("The project was created. Refresh your projects to open it.");
      const link = { ...projectLink(p), created: true }; state = { ...state, project: link }; emit();
      options.openWorkspace(result.workspaceId); return link;
    },
    async requestWorkspace() {
      const project = state.project;
      if (!project) throw Error("Choose a project first.");
      const result = await post({ action: project.role === "member" ? "request_setup" : "activate", projectUri: project.uri });
      const requestedOn = new Date().toISOString().slice(0, 10);
      if (result.status === "pending") {
        try { options.storage?.setItem(requestKey(project.uri), requestedOn); } catch { /* The current view can retain the acknowledged request. */ }
      }
      if (state.project?.uri !== project.uri) throw Error("Your project choice changed. Open the reviewed project from Your Initiatives to check its workspace.");
      if (result.status === "linked" && uuid(result.workspaceId)) {
        state = { ...state, project: { ...project, workspace: "open", workspaceId: result.workspaceId } }; emit();
        options.openWorkspace(result.workspaceId);
      } else if (result.status === "pending") {
        state = { ...state, project: { ...project, workspace: "requested", requestedOn } }; emit();
      } else throw Error("Ask the workspace admin for access to the existing workspace.");
    },
    checkAgain: reload,
    async moreCards() {
      checked();
      const generation = cardsGeneration, offset = nextCardOffset;
      const result = await request(`?offset=${offset}`, undefined, "/api/account", lifetime.signal);
      checked(); assertAccount(result, owner!);
      if (generation !== cardsGeneration || offset !== nextCardOffset) throw Error("Your saved list changed. Open More private saves again to continue.");
      const items = parseSummaries(result.items);
      nextCardOffset += items.length;
      const seen = new Set(state.cards.map(item => item.id));
      const added = items.filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
      state = { ...state, cards: [...state.cards, ...added.map(savedCard)], hasMoreCards: items.length === 20 };
      emit();
    },
    async approveSetup(projectUri, requestId) {
      const result = await post({ action: "approve_setup", projectUri, requestId });
      if (result.status !== "linked" || !uuid(result.workspaceId)) throw Error("The workspace could not be approved. Check the request again.");
      options.openWorkspace(result.workspaceId);
    },
    async recoverWorkspace(projectUri) {
      const result = await post({ action: "recover_admin", projectUri });
      if (result.status !== "linked" || !uuid(result.workspaceId)) throw Error("Recovery could not be confirmed. Check again before retrying.");
      options.openWorkspace(result.workspaceId);
    },
    async clearCard() { selected = null; visiting = null; state = { ...state, project: null, visit: null }; emit(); },
    async deleteCard(card, requestId) {
      checked();
      const signal = AbortSignal.any([lifetime.signal, accountSessionSignal()]);
      try {
        const result = await deleteSavedCard(options.controller, card, requestId, request, signal);
        // Confirmed by the server: report it even if this view has since closed.
        if (!lifetime.signal.aborted) {
          cardsGeneration++; nextCardOffset = Math.max(0, nextCardOffset - 1);
          state = { ...state, cards: state.cards.filter(item => item.id !== card.id) }; emit();
        }
        return result;
      } catch (error) {
        // The account gives one code for every reference. Say only what Weave can verify (QA notes, 25 November 2026).
        if (error instanceof AccountFailure && error.code === "initiative_referenced" && !(error instanceof CardReferenced))
          throw new CardReferenced(cardReferences(card.id, state.workspaces ?? []));
        throw error;
      } finally {
        // The account list is the authority afterwards, whether the card went or was refused.
        if (!lifetime.signal.aborted) await options.refreshAccount().then(account => service.syncAccount(account), () => {});
      }
    },
  };
  return service;
}
