import { pathToFileURL } from "node:url";
import { checkCertifiedReadiness } from "./certified/readiness.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkCertifiedReadiness(process.env);
    console.log("certified_bridge_ready");
  } catch {
    // Configuration, database and protocol errors may contain secrets. Never serialize them.
    console.error("certified_bridge_not_ready");
    process.exitCode = 1;
  }
}
