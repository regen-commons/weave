// Builds the interface prototype into build/, which Git ignores. The page is
// src/page.template.html with the design system's icon sprite and src/notes.html
// inlined. Beside it go the prototype's own CSS and scripts and unchanged copies of the
// design system's css/, tokens/ and fonts/, so there is one source for each. Photos in
// img/ (also ignored) are copied when present; without them the page draws its scenes.
//
// weave-prototype.html is the page to publish as an Artifact, whose host adds the
// document skeleton. index.html wraps the same page in that skeleton for local use.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const SOURCE = path("src/");
const DESIGN_SYSTEM = path("../../../packages/design-system/");
const OUT = path("build/");
const SCRIPTS = ["proto-data.js", "proto-screens.js", "proto-screens-2.js", "proto-app.js"];
const SKELETON = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const dir of ["css", "fonts"]) cpSync(DESIGN_SYSTEM + dir, OUT + dir, { recursive: true });
mkdirSync(OUT + "tokens");
cpSync(DESIGN_SYSTEM + "tokens/tokens.generated.css", OUT + "tokens/tokens.generated.css");
for (const file of ["prototype.css", ...SCRIPTS]) cpSync(SOURCE + file, OUT + file);
if (existsSync(path("img/"))) cpSync(path("img/"), OUT + "img", { recursive: true });

const icons = readFileSync(DESIGN_SYSTEM + "brand/icons.svg", "utf8").trim();
const notes = readFileSync(SOURCE + "notes.html", "utf8").trim();
const page = readFileSync(SOURCE + "page.template.html", "utf8").replace("<!--ICONS-->", icons).replace("<!--NOTES-->", notes);
writeFileSync(OUT + "weave-prototype.html", page);
writeFileSync(OUT + "index.html", SKELETON + page + "</body></html>");
console.log(`Built the prototype in ${OUT}`);
