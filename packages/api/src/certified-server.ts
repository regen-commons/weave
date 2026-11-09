import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { readConfiguration } from "./certified/config.ts";
import { httpsIngress } from "./certified/https-ingress.ts";
import { openBridgeRuntime } from "./certified/runtime.ts";
import { createBridgeObserver, observeBridgeRequests, pruneExpiredState, type BridgeObserver } from "./certified/operations.ts";

export async function startCertifiedServer(env: NodeJS.ProcessEnv, observer: BridgeObserver = createBridgeObserver()) {
  const configuration = readConfiguration(env);
  const { config, port, ingress } = configuration;
  const { store, bridge, close } = await openBridgeRuntime(configuration, observer, 8);
  try {
    const handler = ingress === "render" ? httpsIngress(config.issuer, bridge, false) : bridge;
    const server = createServer({ headersTimeout: 10000, requestTimeout: 15000, keepAliveTimeout: 5000 },
      observeBridgeRequests(handler,observer));
    const host = ingress === "render" ? "0.0.0.0" : "127.0.0.1";
    await new Promise<void>((resolve,reject)=>{ server.once("error",reject);server.listen(port,host,resolve); });
    observer.event("started");
    const pruning = setInterval(() => { void pruneExpiredState(store,observer); },60000);
    pruning.unref();
    return { async close() {
      clearInterval(pruning);
      try {
        await new Promise<void>((resolve,reject)=>{
          server.close(e=>e?reject(e):resolve());
          server.closeAllConnections();
        });
      } finally { await close(); }
      observer.event("stopped");
    } };
  } catch (error) { await close();throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const observer = createBridgeObserver(line => console.log(line));
  try {
    const runtime=await startCertifiedServer(process.env,observer);
    let stopping=false;
    const stop=async()=>{
      if(stopping)return;
      stopping=true;
      try { await runtime.close();process.exitCode=0; }
      catch { observer.event("stop_failed");process.exitCode=1; }
    };
    process.once("SIGTERM",()=>{void stop();});process.once("SIGINT",()=>{void stop();});
  } catch { observer.event("start_failed");process.exitCode=1; }
}
