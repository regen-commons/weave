import { AccountError } from "./account-provider.ts";
import { CERTIFIED_ISSUER, identitySubject } from "./certified/identity.ts";
import type { ProjectActor } from "./project-commands.ts";

/** Rollout eligibility never replaces Certified identity or workspace authority. */
export function createProjectAccess(mode: string | undefined, pilotDids: string | undefined) {
  if (mode === "authenticated") {
    if (pilotDids?.trim()) throw Error("conflicting_project_access_configuration");
    return projectAccess(did => {
      try { identitySubject(CERTIFIED_ISSUER, did, { did }); return true; }
      catch { return false; }
    });
  }
  if (mode !== undefined && mode !== "pilot") throw Error("invalid_project_access_mode");
  return createProjectPilot(pilotDids);
}

export function createProjectPilot(value: string | undefined) {
  const entries = value?.split(",").map(did => did.trim()) ?? [];
  const testers = new Set(entries);
  if (entries.length !== 2 || testers.size !== 2) throw Error("invalid_project_pilot");
  for (const did of testers) identitySubject(CERTIFIED_ISSUER, did, { did });
  return projectAccess(did => testers.has(did));
}

function projectAccess(allowsDid: (did: string) => boolean) {
  return {
    allowsDid,
    restrict(resolveActor: (request: Request) => Promise<ProjectActor>) {
      return async (request: Request) => {
        const actor = await resolveActor(request);
        if (!allowsDid(actor.did)) throw new AccountError(403, "project_pilot_restricted");
        return actor;
      };
    },
  };
}
