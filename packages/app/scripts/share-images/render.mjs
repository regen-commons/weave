#!/usr/bin/env node
// Renders the link-preview pictures (1200 x 630, DL-068) and the home-screen icons (DL-067).
//
// Run from packages/app after changing a template here or a preview's headline in
// dev/link-previews.ts:   node scripts/share-images/render.mjs
//
// Needs a Chromium-based browser (set BROWSER to its binary; Chrome, Brave and Chromium are found
// in /Applications). It runs headless with a throwaway profile and is driven over its DevTools
// connection, which every Chromium answers; the --screenshot flag is not used because some builds
// ignore it. The pictures are committed; nothing renders them in a build.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LINK_PREVIEWS } from "../../dev/link-previews.ts";
import { PUBLIC_ORIGIN } from "../../src/public-origin.ts";

const here = dirname(fileURLToPath(import.meta.url));
const share = join(here, "../../public/share");
const logo = join(here, "../../../design-system/brand/logo");
const browser =
  process.env.BROWSER ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].find((candidate) => existsSync(candidate));
if (!browser) throw new Error("No Chromium-based browser found; set BROWSER to its binary.");

const profile = mkdtempSync(join(tmpdir(), "weave-share-images-"));
const chrome = spawn(
  browser,
  ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--allow-file-access-from-files", "--force-color-profile=srgb", "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const giveUp = setTimeout(() => finish(new Error("The browser took too long.")), 120_000);

function finish(error) {
  clearTimeout(giveUp);
  chrome.kill("SIGKILL");
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // The browser may still hold its profile for a moment; the folder is in the system's temp space.
  }
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.exit(0);
}

/** The address the browser prints once its DevTools connection is open. */
const endpoint = await new Promise((resolve, reject) => {
  let log = "";
  chrome.stderr.on("data", (chunk) => {
    log += chunk;
    const found = /DevTools listening on (ws:\/\/\S+)/.exec(log);
    if (found) resolve(found[1]);
  });
  chrome.on("exit", (code) => reject(new Error(`The browser exited with ${code} before it could be driven.`)));
}).catch(finish);

const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = () => reject(new Error("Could not connect to the browser."));
}).catch(finish);
let lastId = 0;
const waiting = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const call = waiting.get(message.id);
  if (!call) return;
  waiting.delete(message.id);
  if (message.error) call.reject(new Error(message.error.message));
  else call.resolve(message.result);
};
function send(method, params = {}, sessionId) {
  const id = ++lastId;
  socket.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens one of the templates here at a size, waits until it says it is drawn, and saves the picture. */
async function shoot(page, query, width, height, out) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const tab = (method, params) => send(method, params, sessionId);
  await tab("Page.enable");
  await tab("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await tab("Page.navigate", { url: `${pathToFileURL(join(here, page))}?${new URLSearchParams(query)}` });
  const ready = `document.readyState === "complete" && (document.body.dataset.ready === "true" || !document.querySelector("canvas"))`;
  for (let tries = 0; tries < 80; tries++) {
    const { result } = await tab("Runtime.evaluate", { expression: ready, returnByValue: true });
    if (result.value === true) break;
    if (tries === 79) throw new Error(`${page} never finished drawing.`);
    await pause(125);
  }
  const { data } = await tab("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(out, Buffer.from(data, "base64"));
  await send("Target.closeTarget", { targetId });
  console.log(`rendered ${out.slice(out.indexOf("packages/"))}`);
}

try {
  mkdirSync(share, { recursive: true });
  const host = new URL(PUBLIC_ORIGIN).host;
  for (const { image, headline } of LINK_PREVIEWS)
    await shoot("card.html", { name: image, lines: headline.lines.join("|"), accent: headline.accent.join("|"), host }, 1200, 630, join(share, `${image}.png`));

  // The mark at each size a phone asks for. A maskable icon keeps more of its edge clear, because
  // a phone may cut it to a circle.
  await shoot("icon.html", { inset: "0.16" }, 512, 512, join(logo, "icon-512.png"));
  await shoot("icon.html", { inset: "0.16" }, 192, 192, join(logo, "icon-192.png"));
  await shoot("icon.html", { inset: "0.16" }, 180, 180, join(logo, "apple-touch-icon.png"));
  await shoot("icon.html", { inset: "0.24" }, 512, 512, join(logo, "icon-maskable-512.png"));
  finish();
} catch (error) {
  finish(error);
}
