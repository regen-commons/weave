import { pathToFileURL } from "node:url";
import { checkCertifiedReadiness } from "./certified/readiness.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { recoveryOrigin } = await checkCertifiedReadiness(process.env);
    console.log("certified_bridge_ready");
    // A validated public origin, not a secret. A preview bridge without its own origin names production here.
    console.log(`certified_bridge_recovery_origin=${recoveryOrigin}`);
  } catch {
    // Configuration, database and protocol errors may contain secrets. Never serialize them.
    console.error("certified_bridge_not_ready");
    process.exitCode = 1;
  }
}
