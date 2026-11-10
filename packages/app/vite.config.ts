import { join } from "node:path";
import { pathToFileURL } from "node:url";
import tokens from "@regen-commons/design-system/tokens.json" with { type: "json" };
import react from "@vitejs/plugin-react";
import {
  type Connect,
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
  type Plugin,
} from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { previewSecurityHeaders } from "./dev/security-headers.ts";
import { answerApiRequest, type LoadEntry } from "./dev/api-bridge.ts";
import { isolateFixtureProjectOAuth } from "./dev/fixture-oauth-isolation.ts";

/**
 * Answers /api/<name> from api/<name>.ts, the same entry files Vercel deploys, so the app
 * and its functions run from one server. The dev server loads the handlers' source;
 * `vite preview` imports the entries natively, so they load the compiled handlers in
 * packages/api/dist as deployed functions do.
 */
export function apiRoutes(): Plugin {
  const serve =
    (apiDir: string, load: LoadEntry): Connect.NextHandleFunction =>
    (request, response, next) => {
      answerApiRequest(request, response, apiDir, load).catch((error: unknown) => {
        if (response.headersSent) response.destroy();
        else next(error);
      });
    };
  return {
    name: "weave-api-routes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        "/api",
        serve(join(server.config.root, "api"), isolateFixtureProjectOAuth(process.env.WEAVE_ACCOUNT_FIXTURE === "1", async (name) => {
          if (["matching", "projects"].includes(name) && process.env.WEAVE_ACCOUNT_FIXTURE === "1") {
            const fixture = await server.ssrLoadModule("/dev/matching-fixture.ts");
            return { POST: name === "matching" ? fixture.matchingFixture
              : (request: Request) => fixture.projectEvidenceFixture(new URL(request.url).origin)(request) };
          }
          if (["account", "sign-in"].includes(name) && process.env.WEAVE_ACCOUNT_FIXTURE === "1") {
            const fixture = await server.ssrLoadModule("/dev/account-fixture.ts");
            return name === "account" ? fixture.accountFixture : {
              GET: (request: Request) => fixture.signInFixture(new URL(request.url).origin).GET(request),
              POST: (request: Request) => fixture.signInFixture(new URL(request.url).origin).POST(request),
            };
          }
          return server.ssrLoadModule(`/api/${name}.ts`);
        })),
      );
    },
    configurePreviewServer(server) {
      const apiDir = join(server.config.root, "api");
      server.middlewares.use(
        "/api",
        serve(apiDir, isolateFixtureProjectOAuth(process.env.WEAVE_ACCOUNT_FIXTURE === "1",
          (name) => import(pathToFileURL(join(apiDir, `${name}.ts`)).href))),
      );
    },
  };
}

/**
 * `--mode prototype` builds the app with its development examples for the review page in
 * docs/platform/prototype/preview: relative paths, routes in the URL fragment and no service
 * worker. Run it with NODE_ENV=development (`bun run prototype`) so the examples are included.
 */
export default defineConfig(({ mode }) => {
  const prototype = mode === "prototype";
  return {
    base: prototype ? "./" : "/",
    define: { __WEAVE_PROTOTYPE__: JSON.stringify(prototype) },
    build: prototype ? { outDir: "dist-prototype", emptyOutDir: true } : {},
    resolve: { conditions: ["source", ...defaultClientConditions] },
    preview: { headers: previewSecurityHeaders() },
    plugins: [
      react(),
      apiRoutes(),
      ...(prototype ? [] : [VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script",
        manifest: {
          name: "Weave",
          short_name: "Weave",
          description: "Find partners and funding for regenerative work.",
          lang: "en",
          start_url: "/",
          scope: "/",
          display: "standalone",
          // The manifest cannot read CSS, so its colours come from the generated tokens.
          background_color: tokens.themes.light.surface,
          theme_color: tokens.themes.light.surface,
          icons: [{ src: "/brand/logo/mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
        },
        workbox: {
          // The plugin turns these on for autoUpdate only when it injects the register
          // code itself; without them a new version waits until every tab is closed.
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ["**/*.{js,mjs,css,html,svg,woff2,webmanifest}", "assets/*.json"],
          // Only the imported public catalog release and screening assets, never device drafts.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
        },
      })]),
    ],
    // Workspace packages export their TypeScript source under the "source" condition, so
    // the dev server runs handlers from src/; deployed functions import the compiled files.
    ssr: {
      resolve: {
        conditions: ["source", ...defaultServerConditions],
        externalConditions: ["source", "node", "module-sync"],
      },
    },
  };
});
