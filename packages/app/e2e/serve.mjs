// Serves the production build the way Vercel serves the Weave project, for the interface checks.
// Usage: node e2e/serve.mjs [port]   (PORT may also be set; `vite preview` takes the next port)
// It reads vercel.json, so a change there reaches the checks:
// - a request for a file the build wrote is sent that file, as Vercel serves the filesystem first, and a
//   page address with an index.html of its own is sent that (/settings sends settings/index.html);
// - otherwise the first of vercel.json's rewrites that matches decides, such as /initiatives to its own
//   function and /funding/:id to the record page; the /api ones are left to the preview's bridge, which
//   reads the same file;
// - every response carries the headers vercel.json gives its address: the content security policy,
//   nosniff, the referrer policy and the cache rules;
// - text is compressed with gzip, as the CDN does, so Lighthouse sees realistic transfer sizes.
// `vite preview` answers what is left: built files and /api, through the app's compiled handlers.
// Adapted from the quality session's stand-in of 22 November 2026.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const app = fileURLToPath(new URL("..", import.meta.url));
const dist = join(app, "dist");
const port = Number(process.argv[2] ?? process.env.PORT ?? 4790);
const previewPort = port + 1;
const TEXT = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg)/u;

if (!existsSync(join(dist, "index.html"))) {
  console.error("No production build: run `bun run --filter @weave/api build` and `bun run --filter @weave/app build` first.");
  process.exit(1);
}

/** A vercel.json source as a regular expression: `:name` is one path segment, and groups stay as written. */
function pattern(source) {
  const names = [];
  const body = source.replace(/:([a-z]+)/giu, (_, name) => { names.push(name); return "([^/]+)"; });
  return { regex: new RegExp(`^${body}$`, "u"), names };
}
const config = JSON.parse(readFileSync(join(app, "vercel.json"), "utf8"));
const rewrites = (config.rewrites ?? [])
  // The /api rewrites are the preview bridge's (dev/api-bridge.ts), and the catch-all is the index fallback below.
  .filter(({ source }) => !source.startsWith("/api/") && source !== "/((?!api/).*)")
  .map(({ source, destination }) => ({ ...pattern(source), destination }));
const headerRules = (config.headers ?? []).map(({ source, headers }) => ({ ...pattern(source), headers }));
if (!rewrites.length || !headerRules.length) {
  console.error("vercel.json has no page rewrites or headers to serve with.");
  process.exit(1);
}

/** The headers Vercel adds to a response for this address, later rules winning, as Vercel applies them. */
function vercelHeaders(pathname) {
  const out = {};
  for (const rule of headerRules) if (rule.regex.test(pathname)) for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  return out;
}

/** The rewrite's destination for an address, with the request's own query after the destination's. */
function rewrite(url) {
  for (const rule of rewrites) {
    const match = rule.regex.exec(url.pathname);
    if (!match) continue;
    let destination = rule.destination;
    rule.names.forEach((name, i) => { destination = destination.replaceAll(`:${name}`, encodeURIComponent(decodeURIComponent(match[i + 1]))); });
    const target = new URL(destination, url);
    for (const [key, value] of url.searchParams) if (!target.searchParams.has(key)) target.searchParams.append(key, value);
    return `${target.pathname}${target.search}`;
  }
  return undefined;
}

/** A file the build wrote for this address: the file itself, or a page's own index.html. */
function builtFile(pathname) {
  if (pathname.startsWith("/api/")) return undefined;
  const trimmed = decodeURIComponent(pathname).replace(/\/+$/u, "");
  for (const candidate of [join(dist, trimmed), join(dist, trimmed, "index.html")]) {
    const file = normalize(candidate);
    if (file.startsWith(normalize(dist)) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return undefined;
}

// One loopback address for both sides: "localhost" can mean ::1 to Vite and 127.0.0.1 to Node, or the reverse.
const LOOPBACK = "127.0.0.1";
const preview = spawn(join(app, "node_modules", ".bin", "vite"), ["preview", "--host", LOOPBACK, "--port", String(previewPort), "--strictPort"], { cwd: app, stdio: ["ignore", "inherit", "inherit"] });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { preview.kill(signal); process.exit(0); });
preview.on("exit", (code) => { console.error(`vite preview stopped (${code}).`); process.exit(1); });

function send(request, response, pathname, status, headers, body) {
  const out = { ...headers, ...vercelHeaders(pathname) };
  delete out["content-length"];
  const gzip = TEXT.test(String(out["content-type"] ?? "")) && /\bgzip\b/u.test(String(request.headers["accept-encoding"] ?? "")) && !out["content-encoding"];
  if (gzip) { out["content-encoding"] = "gzip"; out.vary = "Accept-Encoding"; }
  response.writeHead(status, out);
  (gzip ? body.pipe(createGzip()) : body).pipe(response);
}

/** Waits for the preview server, so the first request a test makes is answered. */
async function ready() {
  for (let i = 0; i < 240; i++) {
    const up = await new Promise((resolve) => http.get({ host: LOOPBACK, port: previewPort, path: "/" }, (r) => { r.resume(); resolve(true); }).on("error", () => resolve(false)));
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error("vite preview did not start");
}
await ready();

const TYPES = { ".html": "text/html; charset=utf-8" };
http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const reading = request.method === "GET" || request.method === "HEAD";
  const file = reading ? builtFile(url.pathname) : undefined;
  if (file?.endsWith(".html")) {
    send(request, response, url.pathname, 200, { "content-type": TYPES[".html"] }, createReadStream(file));
    return;
  }
  if (!file) {
    const target = rewrite(url);
    if (target) request.url = target;
    else if (reading && !url.pathname.startsWith("/api/") && !/\.[a-z0-9]+$/iu.test(url.pathname)) {
      // vercel.json's last rewrite: every other address is the app's page.
      send(request, response, url.pathname, 200, { "content-type": TYPES[".html"] }, createReadStream(join(dist, "index.html")));
      return;
    }
  }
  // The page's own host goes on, so a same-origin check in a handler sees the address the browser used.
  const proxied = http.request({ host: LOOPBACK, port: previewPort, method: request.method, path: request.url, headers: { ...request.headers, "accept-encoding": "identity" } }, (answer) => {
    send(request, response, url.pathname, answer.statusCode ?? 502, answer.headers, answer);
  });
  proxied.on("error", () => { response.writeHead(502); response.end(); });
  request.pipe(proxied);
}).listen(port, () => console.log(`Weave production build, served as Vercel serves it, on http://localhost:${port}`));
