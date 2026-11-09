import { createCertifiedClient } from "./adapters.ts";
import { createBridge } from "./bridge.ts";
import { readConfiguration } from "./config.ts";
import type { BridgeObserver } from "./operations.ts";
import { assertBridgeRuntimeRole } from "./runtime-access.ts";
import { AuthStore } from "./store.ts";

export async function openBridgeRuntime(
  configuration: ReturnType<typeof readConfiguration>,
  observer: BridgeObserver,
  connections: number,
) {
  const { config, cipher, connect } = configuration;
  const sql = connect(connections);
  try {
    await assertBridgeRuntimeRole(sql);
    const store = new AuthStore(sql, cipher);
    const signing = await store.signingMaterial();
    const client = await createCertifiedClient(store, signing, config.issuer);
    const bridge = await createBridge(config, store, client, observer);
    return { store, bridge, close: () => sql.end({ timeout: 5 }) };
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}
