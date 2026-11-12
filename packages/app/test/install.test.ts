import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { INSTALL_STEPS, installCase, installQr, type InstallSignals } from "../src/install/guidance.ts";
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";
import { ICON_NAMES } from "../src/ui/icons.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const MAC = IPAD;
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const signals = (userAgent: string, more: Partial<InstallSignals> = {}): InstallSignals => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  canPrompt: false,
  ...more,
});

test("a device hears only the steps for itself (DL-067)", () => {
  assert.equal(installCase(signals(IPHONE, { maxTouchPoints: 5 })), "ios");
  assert.equal(installCase(signals(IPAD, { maxTouchPoints: 5 })), "ios", "an iPad calls itself a Mac, and its touch points tell them apart");
  assert.equal(installCase(signals(MAC)), "desktop");
  assert.equal(installCase(signals(WINDOWS)), "desktop");
  assert.equal(installCase(signals(ANDROID, { maxTouchPoints: 5 })), "android");
  assert.equal(installCase(signals(ANDROID, { canPrompt: true })), "prompt", "a browser that offers to install gets one button");
});

test("a computer is sent to a phone even when its browser could install Weave itself", () => {
  assert.equal(installCase(signals(WINDOWS, { canPrompt: true })), "desktop");
});

test("running from the home screen needs no guide, whatever the device", () => {
  for (const userAgent of [IPHONE, ANDROID, WINDOWS])
    assert.equal(installCase(signals(userAgent, { standalone: true, canPrompt: true })), "installed");
});

test("a browser inside another app is told to leave it first, because it cannot install", () => {
  const instagram = `${IPHONE} Instagram 350.0.0.0`;
  const facebook = `${ANDROID.replace("Mobile Safari", "Mobile Safari")} [FBAN/FB4A;FBAV/480.0.0.0;]`;
  const webview = ANDROID.replace("Pixel 9)", "Pixel 9; wv)");
  for (const userAgent of [instagram, facebook, webview])
    assert.equal(installCase(signals(userAgent, { maxTouchPoints: 5, canPrompt: true })), "in-app", userAgent.slice(-40));
  assert.equal(installCase(signals(`${WINDOWS} Twitter`)), "desktop", "a computer is never an in-app browser");
});

test("every set of steps is short, names what to tap, and shows a sign the sprite holds", () => {
  for (const [device, steps] of Object.entries(INSTALL_STEPS)) {
    assert.equal(steps.length, 2, `${device}: two things to do, no more`);
    for (const step of steps) {
      assert.ok(ICON_NAMES.includes(step.icon), `${device}: ${step.icon}`);
      assert.ok(step.title.split(" ").length <= 5, `${device}: "${step.title}" is a short instruction`);
      assert.match(step.title, /^(Tap|Open|Choose) /, `${device}: "${step.title}" starts with what to do`);
      assert.ok(step.note.length <= 90, `${device}: the note stays one line or two`);
      assert.doesNotMatch(`${step.title} ${step.note}`, /[—→]/);
    }
  }
});

test("the QR code is drawn for the public address and shows nowhere else", () => {
  assert.equal(installQr("http://localhost:5173"), null, "a local or preview address gets its own address in words");
  assert.equal(installQr("https://weave-private-preview.vercel.app"), null);
  const qr = installQr(PUBLIC_ORIGIN);
  assert.ok(qr);
  assert.equal(qr.address, new URL(PUBLIC_ORIGIN).host);
  const file = new URL(`../public${qr.src}`, import.meta.url);
  assert.ok(existsSync(file), `${qr.src} must be drawn again when the public address changes`);
  const svg = readFileSync(file, "utf8");
  assert.match(svg, new RegExp(`aria-label="QR code for ${qr.address.replaceAll(".", "\\.")}"`));
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/, "dark on light in both themes, with its clear margin");
});
