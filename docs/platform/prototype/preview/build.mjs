// Builds the clickable preview prototype into build/, which Git ignores. The Weave app is
// built with its development examples (`bun run prototype` in packages/app) and becomes
// app.html. The review page shell.html becomes index.html and borrows the app's stylesheet,
// so the controls around the app use the design system. Publish every file in build/ to the
// Artifact at the same relative paths.
//
// Files the build only copies are left out: the funding catalog (the examples never load
// it), the PDF reader (files stay unread in the prototype) and the font files, which load
// from Google Fonts instead, as Artifact pages allow.
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const APP = path("../../../../packages/app/");
const OUT = path("build/");
const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,400&family=Space+Grotesk:wght@300..700&display=swap">';

execFileSync("bun", ["run", "prototype"], { cwd: APP, stdio: "inherit" });
rmSync(OUT, { recursive: true, force: true });
cpSync(APP + "dist-prototype/", OUT, { recursive: true });
renameSync(OUT + "index.html", OUT + "app.html");

for (const file of readdirSync(OUT + "assets")) {
  if (/\.(json|woff2)$/u.test(file) || file.startsWith("pdf")) rmSync(OUT + "assets/" + file);
  else if (file.endsWith(".css")) {
    const css = readFileSync(OUT + "assets/" + file, "utf8");
    writeFileSync(OUT + "assets/" + file, css.replace(/@font-face\{[^}]*\.woff2[^}]*\}/gu, ""));
  }
}

const app = readFileSync(OUT + "app.html", "utf8");
const styles = app.match(/<link rel="stylesheet"[^>]*>/gu);
if (!styles) throw new Error("The app build has no stylesheet for the review page.");
writeFileSync(OUT + "app.html", app.replace(styles[0], `${FONTS}\n    ${styles[0]}`));
const shell = readFileSync(path("shell.html"), "utf8");
if (!shell.includes("<!--APP-STYLES-->")) throw new Error("shell.html has lost its <!--APP-STYLES--> marker.");
writeFileSync(OUT + "index.html", shell.replace("<!--APP-STYLES-->", [FONTS, ...styles].join("\n  ")));

const count = readdirSync(OUT, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
console.log(`Built the preview prototype in ${OUT}: ${count} files.`);
