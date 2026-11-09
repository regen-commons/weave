import { pathToFileURL } from "node:url";
import { readConfiguration } from "./certified/config.ts";
import { AuthStore, provisionSigningMaterial, replaceSigningMaterial } from "./certified/store.ts";
import { generateSigningMaterial, rotateSigningMaterial } from "./certified/keys.ts";

/** Operator action using an owner connection, never the runtime login. Prints no keys. */
export async function manageSigningKeys(action: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (!['provision','rotate'].includes(action)) throw new Error("invalid_key_operation");
  const { connect,cipher }=readConfiguration(env),sql=connect();
  try {
    if(action==='provision')await provisionSigningMaterial(sql,cipher,generateSigningMaterial());
    else {
      const current=await new AuthStore(sql,cipher).signingMaterial();
      await replaceSigningMaterial(sql,cipher,current,rotateSigningMaterial(current));
    }
  } finally { await sql.end(); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try { await manageSigningKeys(process.argv[2]??"",process.env);console.log("Signing material updated; restart bridge instances together."); }
  catch { console.error("certified_key_operation_failed");process.exitCode=1; }
}
