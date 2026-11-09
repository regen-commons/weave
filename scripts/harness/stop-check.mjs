#!/usr/bin/env node
// When an agent stops with uncommitted changes to files it edited, names the checks
// that the ladder in AGENTS.md asks for. It asks once for each set of changes: Claude
// Code gets a block with the reason, so the agent reports its validation; Codex gets a
// message. Several sessions can share a checkout, so only this session's edits count.
//
// Usage: node scripts/harness/stop-check.mjs claude|codex < hook-event.json
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sessionEdits, sessionFile, stateDir } from "./session-edits.mjs";

const CATALOG = /^(research\/|tests\/|dist\/data\/|scripts\/(import-data\.py|collect-sources\.py|build-ai\.mjs|check\.mjs|research-validation\.mjs)$)/;
const LIVE_SITE = /^(dist\/|src\/|serve\.mjs$)/;
const GUIDANCE = /(^|\/)(AGENTS|CLAUDE)\.md$|^\.claude\/|^\.agents\/|^docs\/.*\.md$|^README\.md$/;
const HARNESS = /^\.claude\/settings\.json$|^\.codex\/|^scripts\/(harness|quality)\//;
const MANIFESTS = /(^|\/)(package\.json|bun\.lock|bunfig\.toml|vercel\.json)$|^\.github\/workflows\//;

/** The rows of the check ladder in AGENTS.md, by their "When" cell, and the changes each covers. */
export const LADDER_ROWS = [
  ["Any change", () => true],
  ["Catalog data or the importer", (path) => CATALOG.test(path)],
  ["The live site's interface", (path) => LIVE_SITE.test(path) && !CATALOG.test(path)],
  ["Tokens or the design system", (path) => path === "DESIGN.md" || path.startsWith("packages/design-system/")],
  ["A workspace package", (path) => /^packages\/[^/]+\//.test(path)],
  ["The app's interface", (path) => /^packages\/app\/(src\/|index\.html$)/.test(path)],
  ["Docs, guidance, skills or rules", (path) => GUIDANCE.test(path)],
  ["Hooks or checkers in `scripts/harness/` and `scripts/quality/`", (path) => HARNESS.test(path)],
  ["Before push (what CI runs)", (path) => MANIFESTS.test(path)],
];

/** The ladder table in the "Checks" section of AGENTS.md, from each "When" cell to its "Run" cell. */
export function checkLadder(guide) {
  const section = /^## Checks\r?\n([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/m.exec(guide)?.[1] ?? "";
  const rows = new Map();
  for (const line of section.split("\n")) {
    const cells = line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 2 && cells[0] !== "When" && !/^-+$/.test(cells[0])) rows.set(cells[0], cells[1]);
  }
  return rows;
}

/** The ladder's checks for repository-relative changed paths, with each package's name filled in. */
export function checksFor(paths, ladder, packageName = (dir) => `packages/${dir}`) {
  if (!paths.length) return [];
  return LADDER_ROWS.flatMap(([when, covers]) => {
    const covered = paths.filter(covers);
    const run = ladder.get(when);
    if (!covered.length || !run) return [];
    if (!run.includes("<package>")) return [`${when}: ${run}`];
    const names = [...new Set(covered.map((path) => packageName(path.split("/")[1])))];
    return names.map((name) => `${when} (${name}): ${run.replaceAll("<package>", name)}`);
  });
}

function changedPaths(root) {
  // --no-optional-locks: a stop must never hold the index lock that another session's commit needs.
  const status = execFileSync("git", ["--no-optional-locks", "-C", root, "status", "--porcelain=v1", "-uall"], { encoding: "utf8" });
  return status.split("\n").filter(Boolean).map((line) => line.slice(3).split(" -> ").at(-1).replace(/^"|"$/g, ""));
}

// Recorded paths and Git's paths can differ by symlinks, such as /tmp and /private/tmp.
function physicalPath(file) {
  try { return realpathSync(file); }
  catch {
    try { return join(realpathSync(dirname(file)), basename(file)); } catch { return file; }
  }
}

function main() {
  const harness = process.argv[2];
  if (!["claude", "codex"].includes(harness)) {
    console.error("Stop check: expected claude or codex.");
    process.exitCode = 2;
    return;
  }
  let event = {};
  try { event = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}
  if (event.stop_hook_active) return;

  let root;
  let paths;
  try {
    root = realpathSync(execFileSync("git", ["-C", event.cwd ?? process.cwd(), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());
    const edited = new Set(sessionEdits(event.session_id).map((file) => relative(root, physicalPath(file)).split(sep).join("/")));
    paths = changedPaths(root).filter((path) => edited.has(path));
  } catch {
    return;
  }
  if (!paths.length) return;

  // Ask once per set of changes, so a second stop with the same edits goes through.
  const stamp = paths.map((path) => {
    try { return `${path}:${statSync(join(root, path)).mtimeMs}`; } catch { return `${path}:gone`; }
  });
  const fingerprint = createHash("sha256").update(stamp.sort().join("\n")).digest("hex");
  const stateFile = sessionFile("stop", event.session_id);
  if (existsSync(stateFile) && readFileSync(stateFile, "utf8") === fingerprint) return;
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(stateFile, fingerprint);

  const guide = join(root, "AGENTS.md");
  const ladder = checkLadder(existsSync(guide) ? readFileSync(guide, "utf8") : "");
  const packageName = (dir) => {
    try { return JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")).name; } catch { return `packages/${dir}`; }
  };
  const shown = paths.slice(0, 8).map((path) => `- ${path}`).join("\n");
  const more = paths.length > 8 ? `\n- and ${paths.length - 8} more` : "";
  const message = `${paths.length} uncommitted ${paths.length === 1 ? "change" : "changes"} from this session:\n${shown}${more}\n\n`
    + "Before finishing, run the checks that match, or say which already ran and what they showed:\n"
    + checksFor(paths, ladder, packageName).map((check) => `- ${check}`).join("\n");
  process.stdout.write(JSON.stringify(harness === "claude" ? { decision: "block", reason: message } : { systemMessage: message }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
