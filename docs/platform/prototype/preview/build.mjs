// Builds the clickable preview prototype into build/, which Git ignores. The Weave app is
// built with its development examples (`bun run prototype` in packages/app) and becomes
// app.html. The review page shell.html becomes index.html and borrows the app's stylesheet,
// so the controls around the app use the design system. Publish every file in build/ to the
// Artifact at the same relative paths.
//
// Files the build only copies are left out: the funding catalog (the examples never load
// it) and the PDF reader (files stay unread in the prototype). The design system's fonts
// arrive inside the stylesheet as data: URIs, which Artifact pages allow. Their bytes are
// already there, so they use font-display: block: text waits the few milliseconds the
// browser takes to decode them and is drawn in Weave's own faces, never in a fallback
// first. The app's optional faces would keep the fallback, because they are decoded after
// the first paint (DL-057).
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const APP = path("../../../../packages/app/");
const OUT = path("build/");

execFileSync("bun", ["run", "prototype"], { cwd: APP, stdio: "inherit" });
rmSync(OUT, { recursive: true, force: true });
cpSync(APP + "dist-prototype/", OUT, { recursive: true });
renameSync(OUT + "index.html", OUT + "app.html");

for (const file of readdirSync(OUT + "assets")) {
  if (file.endsWith(".json") || file.startsWith("pdf")) rmSync(OUT + "assets/" + file);
  // A font file here would be blocked by the Artifact's policy; the build inlines them instead.
  else if (file.endsWith(".woff2")) throw new Error(`The prototype build emitted ${file} instead of inlining it.`);
  else if (file.endsWith(".css")) {
    const css = readFileSync(OUT + "assets/" + file, "utf8");
    let inlined = 0;
    const blocking = css.replace(/@font-face\{[^}]*\}/gu, (face) => {
      if (!face.includes("data:font/woff2")) return face;
      if (!face.includes("font-display:optional"))
        throw new Error(`${file} has an inlined face that is not font-display: optional; check DL-057 before changing this.`);
      inlined += 1;
      return face.replace("font-display:optional", "font-display:block");
    });
    if (inlined > 0) writeFileSync(OUT + "assets/" + file, blocking);
  }
}

const app = readFileSync(OUT + "app.html", "utf8");
const styles = app.match(/<link rel="stylesheet"[^>]*>/gu);
if (!styles) throw new Error("The app build has no stylesheet for the review page.");
const shell = readFileSync(path("shell.html"), "utf8");
if (!shell.includes("<!--APP-STYLES-->")) throw new Error("shell.html has lost its <!--APP-STYLES--> marker.");
writeFileSync(OUT + "index.html", shell.replace("<!--APP-STYLES-->", styles.join("\n  ")));

const count = readdirSync(OUT, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
console.log(`Built the preview prototype in ${OUT}: ${count} files.`);
