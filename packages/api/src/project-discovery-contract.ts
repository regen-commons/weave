import { record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import type { CertifiedProjectTarget } from "./certified-project-provider.ts";

export type ProjectDiscoveryCommand =
  | { action: "list_project_groups"; cursor?: string }
  | { action: "list_projects"; target: CertifiedProjectTarget; cursor?: string }
  | { action: "list_workspaces"; cursor?: string; setupGroupDid?: string; setupCursor?: string };

const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const web = new RegExp(`^did:web:(?:${label}\\.)+[a-z][a-z0-9-]{0,62}$`, "u");
export const discoveryDid = (value: unknown): value is string => typeof value === "string"
  && (/^did:plc:[a-z2-7]{24}$/u.test(value) || (value.length <= 261 && web.test(value)));

function invalid(): never { throw new AccountError(400, "invalid_project_command"); }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function cursor(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value)) invalid();
  return value;
}

/** Return undefined only for commands owned by another project capability. */
export function parseProjectDiscoveryCommand(value: Record<string, unknown>): ProjectDiscoveryCommand | undefined {
  if (value.action === "list_project_groups") {
    keys(value, ["action"], ["cursor"]);
    return { action: value.action, cursor: cursor(value.cursor) };
  }
  if (value.action === "list_projects") {
    keys(value, ["action", "target"], ["cursor"]);
    const target = record(value.target);
    if (target.kind === "personal") {
      keys(target, ["kind"]);
      return { action: value.action, target: { kind: "personal" }, cursor: cursor(value.cursor) };
    }
    keys(target, ["kind", "groupDid"]);
    if (target.kind !== "group" || !discoveryDid(target.groupDid)) invalid();
    return { action: value.action, target: { kind: "group", groupDid: target.groupDid }, cursor: cursor(value.cursor) };
  }
  if (value.action === "list_workspaces") {
    keys(value, ["action"], ["cursor", "setupGroupDid", "setupCursor"]);
    if ((value.setupGroupDid !== undefined && !discoveryDid(value.setupGroupDid))
      || (value.setupCursor !== undefined && value.setupGroupDid === undefined)) invalid();
    return { action: value.action, cursor: cursor(value.cursor),
      setupGroupDid: value.setupGroupDid as string | undefined, setupCursor: cursor(value.setupCursor) };
  }
  return undefined;
}
