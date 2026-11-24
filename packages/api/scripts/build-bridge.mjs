// Builds the identity bridge (auth.regencommons.com) as Vercel Build Output, for `vercel deploy --prebuilt`.
//
// The bridge used to rely on Vercel finding `packages/api/server.ts` as a Node server. On 24 November 2026 a
// CLI deploy of `develop` built without error but served no function at all (Vercel's own 404 on every
// path), so the bridge is no longer left to detection. This writes one Node function that serves every path
// with the same request listener `server.ts` uses, bundled with its libraries so nothing is installed or
// detected on Vercel's side. The project's environment variables still reach it at run time.
//
// Usage: node packages/api/scripts/build-bridge.mjs <output-directory>
// Writes <output-directory>/.vercel/output. Nothing secret is read or written.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: node packages/api/scripts/build-bridge.mjs <output-directory>");
  process.exit(2);
}
/** The Node runtime the bridge runs on. Production has run Node 26 since 16 November 2026. */
const BRIDGE_RUNTIME = "nodejs26.x";

const output = join(resolve(target), ".vercel", "output");
const fn = join(output, "functions", "index.func");
await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

const result = await build({
  stdin: {
    // The same listener server.ts serves, read from the environment once per instance, as there.
    contents: 'import { createVercelBridge } from "./src/certified-vercel.ts";\nexport default createVercelBridge(process.env);\n',
    resolveDir: api, sourcefile: "bridge-entry.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", target: "node24",
  outfile: join(fn, "index.mjs"),
  // Some dependencies still call require(); give the ES module one.
  banner: { js: 'import { createRequire as __bridgeRequire } from "node:module"; const require = __bridgeRequire(import.meta.url);' },
  // esbuild throws on any error, so a failed bundle stops here with its messages.
  legalComments: "none", logLevel: "warning", metafile: true,
});

await writeFile(join(fn, ".vc-config.json"), JSON.stringify({
  runtime: BRIDGE_RUNTIME, handler: "index.mjs", launcherType: "Nodejs",
  // The bridge reads raw Node requests itself (oidc-provider parses its own bodies).
  shouldAddHelpers: false, supportsResponseStreaming: true,
}, null, 2) + "\n");
// Every path goes to the one function, which checks host, protocol and path itself.
await writeFile(join(output, "config.json"), JSON.stringify({
  version: 3, routes: [{ src: "/(.*)", dest: "/index" }],
}, null, 2) + "\n");

const bytes = Object.values(result.metafile.outputs).reduce((sum, item) => sum + item.bytes, 0);
console.log(`bridge built: ${output} (${Math.round(bytes / 1024)} KiB, ${BRIDGE_RUNTIME})`);
