#!/usr/bin/env node
// Reprints the essential rules after a context compaction, for Claude Code and Codex.
// The text comes from AGENTS.md itself, so there is no second copy to drift.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SECTIONS = ["Essential rules", "Shared checkout safety"];

/** The named second-level sections of an AGENTS.md, in order, with their headings. */
export function essentialRules(guide) {
  return SECTIONS.map((title) => {
    const match = new RegExp(`^## ${title}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(guide);
    return match ? `## ${title}\n${match[1].trim()}` : "";
  }).filter(Boolean).join("\n\n");
}

function main() {
  const path = resolve(ROOT, "AGENTS.md");
  if (!existsSync(path)) return;
  const rules = essentialRules(readFileSync(path, "utf8"));
  if (!rules) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Reminder after compaction, from AGENTS.md:\n\n${rules}`,
    },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
