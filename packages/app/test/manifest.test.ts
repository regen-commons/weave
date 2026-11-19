// The installed app: what its icon opens, and the sections a long press on it offers (DL-092).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_SCREENSHOTS, APP_SHORTCUTS, SCREENSHOT_SIZE, appManifest } from "../dev/manifest.ts";
import { ROUTES, navLabel, pathTo } from "../src/routes.ts";

test("a long press on the app's icon offers the three sections beside Home, by the tab bar's names", () => {
  const sections = (["funding", "initiatives", "your-initiatives"] as const).map((name) => ({ name: navLabel(name), url: pathTo(name) }));
  assert.deepEqual(APP_SHORTCUTS.map(({ name, url }) => ({ name, url })), sections);
  for (const { url } of APP_SHORTCUTS) assert.ok(ROUTES.some((route) => route.path === url && route.section), `${url} is a section's page`);
  const { shortcuts = [] } = appManifest("#ffffff");
  assert.equal(shortcuts.length, 3);
  // Every shortcut opens inside the app, and has a picture a launcher can draw.
  for (const shortcut of shortcuts) {
    assert.ok(shortcut.url.startsWith("/"), shortcut.name);
    assert.deepEqual(shortcut.icons?.map((icon) => icon.sizes), ["192x192"]);
  }
});

test("the app keeps the identity it had, and takes its colours from the page's surface", () => {
  const manifest = appManifest("#f4efe4");
  // An app with no id is known by where it starts, so writing that down changes nothing for an installed copy.
  assert.equal(manifest.id, manifest.start_url);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#f4efe4");
  assert.equal(manifest.background_color, "#f4efe4");
  assert.deepEqual(manifest.icons?.map((icon) => icon.purpose), ["any", "any", "maskable", "any"]);
});

/** A JPEG's own width and height, read from its frame header. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  assert.deepEqual([bytes[0], bytes[1]], [0xff, 0xd8], "a JPEG file");
  for (let at = 2; at < bytes.length - 8; ) {
    assert.equal(bytes[at], 0xff, "a marker");
    const marker = bytes[at + 1]!;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    // The frame headers: baseline, extended and progressive.
    if (marker >= 0xc0 && marker <= 0xc2) return { height: (bytes[at + 5]! << 8) | bytes[at + 6]!, width: (bytes[at + 7]! << 8) | bytes[at + 8]! };
    at += 2 + length;
  }
  throw new Error("No frame header");
}

test("the install sheet shows three phone screens, each the size it says and all one shape", () => {
  const { screenshots = [] } = appManifest("#ffffff");
  assert.equal(screenshots.length, APP_SCREENSHOTS.length);
  assert.equal(screenshots.length, 3);
  for (const screen of screenshots) {
    const file = fileURLToPath(new URL(`../public${screen.src}`, import.meta.url));
    // A size the sheet is told that the picture does not have makes it leave the picture out.
    assert.deepEqual(jpegSize(readFileSync(file)), SCREENSHOT_SIZE, screen.src);
    assert.equal(screen.sizes, "720x1560");
    assert.equal(screen.type, "image/jpeg");
    assert.equal(screen.form_factor, "narrow");
    assert.ok(screen.label && screen.label.length > 10 && !/[\u2014\u2192]/u.test(screen.label), "it says what it shows, in the product's voice");
  }
  // Android's sheet wants every side from 320 to 3840 px, and no picture more than 2.3 times as long as it is wide.
  const { width, height } = SCREENSHOT_SIZE;
  assert.ok(width >= 320 && height <= 3840 && height / width <= 2.3);
  assert.equal(new Set(screenshots.map((screen) => screen.src)).size, 3);
});
