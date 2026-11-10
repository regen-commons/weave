import { AccountError } from "./account-provider.ts";
import { CERTIFIED_ISSUER, identitySubject } from "./certified/identity.ts";
import type { ProjectActor } from "./project-commands.ts";

export function createProjectPilot(value: string | undefined) {
  const entries = value?.split(",").map(did => did.trim()) ?? [];
  const testers = new Set(entries);
  if (entries.length !== 2 || testers.size !== 2) throw Error("invalid_project_pilot");
  for (const did of testers) identitySubject(CERTIFIED_ISSUER, did, { did });
  const allowsDid = (did: string) => testers.has(did);
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
