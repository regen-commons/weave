// Serves the production build the way Vercel serves the Weave project, for the interface checks.
// Usage: node e2e/serve.mjs [port]   (PORT and PREVIEW_PORT may also be set)
// - It starts `vite preview` on PREVIEW_PORT for assets and /api, which loads the compiled handlers.
// - A page address with a file of its own is sent that file (/settings sends settings/index.html), as
//   Vercel serves the filesystem before rewrites; Vite's preview server would send index.html instead.
// - /funding/:id and /initiatives/:id go to /api/router?__route=record-page, as vercel.json rewrites them.
// - Text is compressed with gzip, as the CDN does, so Lighthouse sees realistic transfer sizes.
// Adapted from the quality session's stand-in of 22 November 2026.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const app = fileURLToPath(new URL("..", import.meta.url));
const dist = join(app, "dist");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4790);
const previewPort = Number(process.env.PREVIEW_PORT ?? port + 1);
const TEXT = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg)/u;

if (!existsSync(join(dist, "index.html"))) {
  console.error("No production build: run `bun run --filter @weave/api build` and `bun run --filter @weave/app build` first.");
  process.exit(1);
}

const preview = spawn(join(app, "node_modules", ".bin", "vite"), ["preview", "--port", String(previewPort), "--strictPort"], { cwd: app, stdio: ["ignore", "inherit", "inherit"] });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { preview.kill(signal); process.exit(0); });
preview.on("exit", (code) => { console.error(`vite preview stopped (${code}).`); process.exit(1); });

function pageFile(pathname) {
  if (/\.[a-z0-9]+$/iu.test(pathname) || pathname.startsWith("/api/")) return undefined;
  const trimmed = pathname.replace(/\/+$/u, "");
  const own = normalize(join(dist, trimmed, "index.html"));
  if (!own.startsWith(normalize(dist))) return undefined;
  if (trimmed && existsSync(own) && statSync(own).isFile()) return own;
  return join(dist, "index.html");
}

function send(request, response, status, headers, body) {
  const type = String(headers["content-type"] ?? "");
  const gzip = TEXT.test(type) && /\bgzip\b/u.test(String(request.headers["accept-encoding"] ?? "")) && !headers["content-encoding"];
  const out = { ...headers };
  delete out["content-length"];
  if (gzip) { out["content-encoding"] = "gzip"; out.vary = "Accept-Encoding"; }
  response.writeHead(status, out);
  (gzip ? body.pipe(createGzip()) : body).pipe(response);
}

/** Waits for the preview server, so the first request a test makes is answered. */
async function ready() {
  for (let i = 0; i < 120; i++) {
    const up = await new Promise((resolve) => http.get({ host: "localhost", port: previewPort, path: "/" }, (r) => { r.resume(); resolve(true); }).on("error", () => resolve(false)));
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error("vite preview did not start");
}
await ready();

http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const record = /^\/(funding|initiatives)\/([^/]+)\/?$/u.exec(url.pathname);
  if (record && request.method === "GET") {
    const query = new URLSearchParams(url.search);
    query.set("__route", "record-page");
    query.set("kind", record[1] === "funding" ? "funding" : "initiative");
    query.set("id", decodeURIComponent(record[2]));
    request.url = `/api/router?${query}`;
  }
  const file = request.method === "GET" && !record ? pageFile(url.pathname) : undefined;
  if (file) {
    send(request, response, 200, { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" }, createReadStream(file));
    return;
  }
  // The page's own host goes on, so a same-origin check in a handler sees the address the browser used.
  const proxied = http.request({ host: "localhost", port: previewPort, method: request.method, path: request.url, headers: { ...request.headers, "accept-encoding": "identity" } }, (answer) => {
    send(request, response, answer.statusCode ?? 502, answer.headers, answer);
  });
  proxied.on("error", () => { response.writeHead(502); response.end(); });
  request.pipe(proxied);
}).listen(port, () => console.log(`Weave production build, served as Vercel serves it, on http://localhost:${port}`));
