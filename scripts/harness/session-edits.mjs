// The files each agent session edits, recorded by the edit hook so that the stop check
// names only that session's changes in a checkout several sessions share.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the hooks keep per-session state. Tests point it at a temporary directory. */
export const stateDir = () => process.env.HOOK_STATE_DIR ?? join(tmpdir(), "funding-commons-hooks");

export const sessionFile = (prefix, sessionId) => join(stateDir(), `${prefix}-${String(sessionId ?? "session").replace(/[^\w-]/g, "")}`);

/** Adds absolute file paths to the session's record of edits. */
export function recordEdits(sessionId, files) {
  if (!files.length) return;
  mkdirSync(stateDir(), { recursive: true });
  appendFileSync(sessionFile("edits", sessionId), files.map((file) => `${file}\n`).join(""));
}

/** The absolute paths the session has edited, or none when nothing was recorded. */
export function sessionEdits(sessionId) {
  try {
    return [...new Set(readFileSync(sessionFile("edits", sessionId), "utf8").split("\n").filter(Boolean))];
  } catch {
    return [];
  }
}
