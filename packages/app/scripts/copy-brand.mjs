// Copies the brand files the app serves at fixed URLs (the favicon, the manifest icon
// and the icon sprite) from the design system into public/brand/, so there is one
// source. The copies are ignored by Git and rewritten on every dev start and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["icons.svg", "weave-threads.svg", "logo/favicon.svg", "logo/mark.svg"];

for (const file of FILES) {
  const source = fileURLToPath(import.meta.resolve(`@regen-commons/design-system/brand/${file}`));
  const target = fileURLToPath(new URL(`../public/brand/${file}`, import.meta.url));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
