import { isDeepStrictEqual } from "node:util";
import { record, uuid } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import type { CertifiedGroupRole, CertifiedProjectProvider, CertifiedProjectResult } from "./certified-project-provider.ts";
import type { ProjectActor } from "./project-commands.ts";
import { requireCertifiedProjectResult } from "./project-commands.ts";
import { parseProjectUri } from "./project-index-source.ts";

export const SUPPORT_COLLECTION = "com.regencommons.weave.supportListing";
export type SupportKind = "need" | "offer";
export interface SupportListing {
  $type: typeof SUPPORT_COLLECTION;
  projectUri: string;
  kind: SupportKind;
  title: string;
  description?: string;
  capitalForms: string[];
  status: "open";
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
}
const capitals = ["living", "material", "intellectual", "experiential", "social", "financial", "cultural", "spiritual"];
const segmenter = new Intl.Segmenter();
function text(value: unknown, max: number, bytes: number): value is string {
  return typeof value === "string" && !/\p{Surrogate}/u.test(value) && Buffer.byteLength(value) <= bytes &&
    [...segmenter.segment(value)].length <= max;
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value.slice(0, 10));
}
export function parseSupportListing(input: unknown): SupportListing {
  const v = record(input);
  const keys = ["$type", "projectUri", "kind", "title", "capitalForms", "status", "createdAt"];
  if (v.description !== undefined) keys.push("description");
  if (v.expiresAt !== undefined) keys.push("expiresAt");
  if (v.updatedAt !== undefined) keys.push("updatedAt");
  if (Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key)) ||
      v.$type !== SUPPORT_COLLECTION || (v.kind !== "need" && v.kind !== "offer") ||
      !text(v.title, 140, 1400) || !v.title.trim() ||
      (v.description !== undefined && !text(v.description, 600, 6000)) ||
      !Array.isArray(v.capitalForms) || v.capitalForms.length < 1 || v.capitalForms.length > 8 ||
      v.capitalForms.some(x => typeof x !== "string" || !capitals.includes(x)) ||
      new Set(v.capitalForms).size !== v.capitalForms.length || v.status !== "open" ||
      !date(v.createdAt) || (v.expiresAt !== undefined && (!date(v.expiresAt) || Date.parse(v.expiresAt) <= Date.parse(v.createdAt))))
    throw Error("invalid_support_listing");
  if (v.updatedAt !== undefined && (!date(v.updatedAt) || Date.parse(v.updatedAt) < Date.parse(v.createdAt)))
    throw Error("invalid_support_listing");
  const projectUri = parseProjectUri(v.projectUri).uri;
  return { $type: SUPPORT_COLLECTION, projectUri, kind: v.kind, title: v.title,
    ...(v.description === undefined ? {} : { description: v.description as string }),
    capitalForms: [...v.capitalForms] as string[], status: "open", createdAt: v.createdAt,
    ...(v.updatedAt === undefined ? {} : { updatedAt: v.updatedAt as string }),
    ...(v.expiresAt === undefined ? {} : { expiresAt: v.expiresAt as string }) };
}

type Entry = { kind: SupportKind; entryId: string };
export type SupportPublicationCommand =
  | { action: "support_state"; workspaceId: string; cursor?: string }
  | ({ action: "support_review"; workspaceId: string; expectedRevision: number; expectedEntryRevision: number; expiresAt: string | null } & Entry)
  | { action: "support_publish"; workspaceId: string; reviewId: string; requestId: string; audience: "public-atproto"; confirmPublic: true }
  | ({ action: "support_withdraw"; workspaceId: string; requestId: string } & Entry)
  | ({ action: "support_reconcile"; workspaceId: string } & Entry);
function invalid(): never { throw new AccountError(400, "invalid_support_command"); }
export function parseSupportPublicationCommand(input: unknown): SupportPublicationCommand {
  const v = record(input), a = v.action;
  const common = ["action", "workspaceId"];
  const entry = ["kind", "entryId"];
  let keys: string[];
  if (a === "support_state") keys = v.cursor === undefined ? common : [...common, "cursor"];
  else if (a === "support_review") keys = [...common, ...entry, "expectedRevision", "expectedEntryRevision", "expiresAt"];
  else if (a === "support_publish") keys = [...common, "reviewId", "requestId", "audience", "confirmPublic"];
  else if (a === "support_withdraw") keys = [...common, ...entry, "requestId"];
  else if (a === "support_reconcile") keys = [...common, ...entry];
  else return invalid();
  if (Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key)) || !uuid(v.workspaceId) ||
      (keys.includes("entryId") && (!uuid(v.entryId) || (v.kind !== "need" && v.kind !== "offer"))) ||
      (keys.includes("requestId") && !uuid(v.requestId)) || (keys.includes("reviewId") && !uuid(v.reviewId))) return invalid();
  if (a === "support_publish" && (v.audience !== "public-atproto" || v.confirmPublic !== true)) return invalid();
  if (a === "support_state" && v.cursor !== undefined && (typeof v.cursor !== "string" ||
      v.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(v.cursor))) return invalid();
  if (a === "support_review" && (!Number.isSafeInteger(v.expectedRevision) || Number(v.expectedRevision) < 1 ||
      !Number.isSafeInteger(v.expectedEntryRevision) || Number(v.expectedEntryRevision) < 1 ||
      (v.expiresAt !== null && !date(v.expiresAt)))) return invalid();
  return v as unknown as SupportPublicationCommand;
}

export interface SupportTarget {
  projectUri: string;
  repositoryDid: string;
  groupDid: string | null;
}
export interface SupportPublicationStore {
  target(actor: ProjectActor, workspaceId: string): Promise<unknown>;
  command(actor: ProjectActor, workspaceId: string, role: CertifiedGroupRole | null, projectCid: string | null,
    action: string, data: Record<string, unknown>): Promise<unknown>;
}
export interface SupportPublicationAdapter {
  authorize(actorDid: string, target: SupportTarget, operation: "create" | "delete"): Promise<void>;
  read(target: SupportTarget, rkey: string): Promise<CertifiedProjectResult<{ cid: string; value: unknown } | null>>;
  create(actorDid: string, target: SupportTarget, rkey: string, value: SupportListing): Promise<CertifiedProjectResult<unknown>>;
  delete(actorDid: string, target: SupportTarget, rkey: string, expectedCid: string): Promise<CertifiedProjectResult<unknown>>;
}
export interface SupportPublication {
  kind: SupportKind;
  entryId: string;
  rkey: string;
  operationId: string;
  status: "publish_pending" | "published" | "withdrawal_pending" | "withdrawn" | "conflict";
  record: SupportListing;
  cid: string | null;
  attempted: boolean;
  problem: string | null;
}
function publication(input: unknown): SupportPublication {
  const v = record(input);
  if ((v.kind !== "need" && v.kind !== "offer") || !uuid(v.entryId) || !uuid(v.operationId) ||
      typeof v.rkey !== "string" || !/^[2-7a-j][2-7a-z]{12}$/u.test(v.rkey) ||
      !["publish_pending", "published", "withdrawal_pending", "withdrawn", "conflict"].includes(String(v.status)) ||
      (v.cid !== null && (typeof v.cid !== "string" || !/^b[a-z2-7]{40,100}$/u.test(v.cid))) ||
      typeof v.attempted !== "boolean" || (v.problem !== null && typeof v.problem !== "string"))
    throw Error("invalid_support_publication_state");
  const listing = parseSupportListing(v.record);
  if (listing.kind !== v.kind) throw Error("invalid_support_publication_state");
  return { kind: v.kind, entryId: v.entryId, rkey: v.rkey, operationId: v.operationId,
    status: v.status as SupportPublication["status"], record: listing, cid: v.cid as string | null,
    attempted: v.attempted, problem: v.problem as string | null };
}

/** SQL owns revisions, grants and durable checkpoints. The adapter never receives private fields. */
export function createSupportPublication(
  projects: Pick<CertifiedProjectProvider, "getProject" | "getMembership">,
  store: SupportPublicationStore, adapter: SupportPublicationAdapter,
) {
  return {
    async execute(actor: ProjectActor, command: SupportPublicationCommand): Promise<unknown> {
      const raw = record(await store.target(actor, command.workspaceId));
      const projectUri = parseProjectUri(raw.projectUri);
      if (raw.repositoryDid !== projectUri.did || (raw.groupDid !== null && raw.groupDid !== projectUri.did))
        throw Error("invalid_support_target");
      const target: SupportTarget = { projectUri: projectUri.uri, repositoryDid: projectUri.did, groupDid: raw.groupDid as string | null };
      const membershipObservedAt = new Date().toISOString();
      const role = target.groupDid ? requireCertifiedProjectResult(await projects.getMembership(actor.did, target.groupDid)) : null;
      if (target.groupDid && !role) {
        await store.command(actor, command.workspaceId, null, null, "support_membership_absent", { observedAt: membershipObservedAt });
        throw new AccountError(403, "workspace_access_required");
      }
      if (!target.groupDid && actor.did !== target.repositoryDid) throw new AccountError(403, "workspace_access_required");
      let projectCid: string | null = null;
      const run = (action: string, data: Record<string, unknown>) => store.command(actor, command.workspaceId, role, projectCid, action, data);
      if (command.action !== "support_withdraw") {
        const current = await projects.getProject(target.projectUri);
        if ((!current.ok && current.code === "not_found") || (current.ok && current.value.visibility !== "public")) {
          await run("support_project_ineligible", {});
          if (command.action === "support_review" || command.action === "support_publish")
            throw new AccountError(404, "project_not_found");
        } else if (current.ok) {
          const project = current.value;
          if (project.uri !== target.projectUri || project.repoDid !== target.repositoryDid ||
              (project.groupDid ?? null) !== target.groupDid) throw Error("invalid_support_project");
          projectCid = project.cid;
        } else if (command.action === "support_review" || command.action === "support_publish") {
          requireCertifiedProjectResult(current);
        }
      }
      if (command.action === "support_state") {
        let afterKind: SupportKind | null = null, afterEntryId: string | null = null;
        if (command.cursor) {
          try {
            const cursor: unknown = JSON.parse(Buffer.from(command.cursor, "base64url").toString("utf8"));
            if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== command.workspaceId ||
                (cursor[1] !== "need" && cursor[1] !== "offer") || !uuid(cursor[2])) return invalid();
            afterKind = cursor[1]; afterEntryId = cursor[2];
          } catch { return invalid(); }
        }
        const page = record(await run(command.action, { afterKind, afterEntryId }));
        if (!Array.isArray(page.listings) || page.listings.length > 100) throw Error("invalid_support_state_page");
        const listings = page.listings.map(publication);
        if (new Set(listings.map(item => `${item.kind}:${item.entryId}`)).size !== listings.length ||
            listings.some(item => item.record.projectUri !== target.projectUri)) throw Error("invalid_support_state_page");
        let nextCursor: string | null = null;
        if (page.next !== null) {
          const next = record(page.next), last = listings.at(-1);
          if (!last || next.kind !== last.kind || next.entryId !== last.entryId) throw Error("invalid_support_state_page");
          nextCursor = Buffer.from(JSON.stringify([command.workspaceId, last.kind, last.entryId])).toString("base64url");
        }
        return { workspaceId: command.workspaceId, listings, nextCursor };
      }
      if (command.action === "support_review") return run(command.action, { ...command });
      let state: SupportPublication;
      if (command.action === "support_publish" || command.action === "support_withdraw")
        state = publication(await run(command.action, { ...command }));
      else state = publication(await run("support_get", { kind: command.kind, entryId: command.entryId }));
      if (state.record.projectUri !== target.projectUri) throw Error("invalid_support_destination");
      let createClaimed = false;
      const checkpoint = async (event: string, data: Record<string, unknown> = {}) => {
        const result = await run("support_checkpoint", {
          kind: state.kind, entryId: state.entryId, operationId: state.operationId, event, ...data,
        });
        state = publication(result);
        if (event === "sending") createClaimed = record(result).claimed === true;
        return state;
      };
      const read = async () => {
        const result = await adapter.read(target, state.rkey);
        if (!result.ok) {
          await checkpoint("problem", { problem: result.code });
          return undefined;
        }
        const found = result.value;
        if (found && (!isDeepStrictEqual(found.value, state.record) || (state.cid && state.cid !== found.cid))) {
          await checkpoint("conflict", { problem: "public_record_changed" });
          return undefined;
        }
        return found;
      };
      let found = await read();
      if (found === undefined) return state;
      if (state.status === "published") return found ? state : checkpoint("external_withdrawn");
      if (state.status === "withdrawn" || state.status === "conflict") return state;
      if (state.status === "publish_pending") {
        if (found) return checkpoint("published", { cid: found.cid });
        // Every retry reads the same AT URI. Only one durable claim may send a create;
        // a second delayed create could resurrect a record after a confirmed withdrawal.
        await adapter.authorize(actor.did, target, "create");
        await checkpoint("sending");
        if (state.status !== "publish_pending" || !createClaimed) return state;
        const result = await adapter.create(actor.did, target, state.rkey, state.record);
        if (!result.ok) await checkpoint(["authorization_required", "forbidden", "invalid_input", "unsupported"].includes(result.code)
          ? "rejected" : "problem", { problem: result.code });
        found = await read();
        return found ? checkpoint("published", { cid: found.cid }) : state;
      }
      if (!found) {
        // An uncertain create can arrive late. Absence alone cannot settle that unobserved write.
        return state.cid || !state.attempted ? checkpoint("withdrawn") : checkpoint("problem", { problem: "unobserved_create" });
      }
      if (!state.cid) await checkpoint("observed", { cid: found.cid });
      try { await adapter.authorize(actor.did, target, "delete"); }
      catch (error) {
        if (!(error instanceof AccountError)) throw error;
        return checkpoint("problem", { problem: error.code });
      }
      const deleted = await adapter.delete(actor.did, target, state.rkey, found.cid);
      if (!deleted.ok) await checkpoint("problem", { problem: deleted.code });
      found = await read();
      return found === null ? checkpoint("withdrawn") : state;
    },
  };
}
