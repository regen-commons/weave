#!/usr/bin/env node
// Shell command guardrails shared by the Claude Code and Codex hooks.
// A guard for ordinary commands, not a shell interpreter or a security sandbox:
// normal permissions still apply. The scanner is adapted from Green Goods'
// scripts/harness/command-policy.mjs.
//
// Usage: node scripts/harness/command-policy.mjs claude|codex < hook-event.json
// "block" stops the command in both harnesses. "ask" asks the person in Claude Code
// and blocks in Codex, which has no confirmation step, so the person runs it there.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isSecretPath, SECRET_READ } from "./secrets.mjs";

/**
 * Splits shell source into simple commands, each a list of words. Commands inside
 * `$(...)`, backquotes and expanding heredoc bodies run too, so they are returned as
 * commands of their own; other heredoc bodies are data. Nothing is evaluated.
 */
function scan(source, start = 0, nested = false) {
  const commands = [];
  let cursor = start;

  const closingBackquote = (from) => {
    let index = from;
    while (index < source.length && source[index] !== "`") index += source[index] === "\\" ? 2 : 1;
    return Math.min(index, source.length);
  };

  // `$((...))` and `${...}` are skipped; `$(...)` is scanned to its closing parenthesis.
  function expansion() {
    if (source[cursor + 1] === "{" || source.startsWith("$((", cursor)) {
      const [open, close] = source[cursor + 1] === "{" ? ["{", "}"] : ["(", ")"];
      let depth = 0;
      cursor++;
      do {
        if (source[cursor] === open) depth++;
        else if (source[cursor] === close) depth--;
        cursor++;
      } while (depth > 0 && cursor < source.length);
      return;
    }
    const inner = scan(source, cursor + 2, true);
    commands.push(...inner.commands);
    cursor = inner.end;
  }

  function backquoted() {
    const close = closingBackquote(cursor + 1);
    commands.push(...scan(source.slice(cursor + 1, close).replace(/\\`/g, "`")).commands);
    cursor = close + 1;
  }

  function word() {
    let value = "";
    let quote = "";
    let quoted = false;
    let dynamic = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (!quote && /[\s;&|<>()]/.test(char)) break;
      if (char === "\\" && quote !== "'") {
        const next = source[cursor + 1];
        if (next === "\n") cursor += 2;
        else if (next === undefined) cursor++;
        else if (!quote || /[$`"\\]/.test(next)) { value += next; quoted = true; cursor += 2; }
        else { value += char; cursor++; }
      } else if (char === quote) { quote = ""; cursor++; }
      else if (!quote && (char === "'" || char === '"')) { quote = char; quoted = true; cursor++; }
      else if (quote !== "'" && char === "$" && /[({]/.test(source[cursor + 1] ?? "")) { expansion(); dynamic = true; }
      else if (quote !== "'" && char === "`") { backquoted(); dynamic = true; }
      else {
        if (quote !== "'" && char === "$") dynamic = true;
        value += char;
        cursor++;
      }
    }
    return { value, dynamic, quoted };
  }

  // A heredoc body is data, but an unquoted delimiter lets `$(...)` and backquotes in it run.
  function heredocBody({ delimiter, stripTabs, expands }) {
    while (cursor < source.length) {
      const end = source.indexOf("\n", cursor);
      const lineEnd = end < 0 ? source.length : end;
      const next = end < 0 ? source.length : end + 1;
      const line = source.slice(cursor, lineEnd);
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) {
        cursor = next;
        return;
      }
      for (let index = cursor; expands && index < lineEnd; index++) {
        if (source[index] === "\\") index++;
        else if (source.startsWith("$(", index) && !source.startsWith("$((", index)) {
          const inner = scan(source, index + 2, true);
          commands.push(...inner.commands);
          index = inner.end - 1;
        } else if (source[index] === "`") {
          const close = closingBackquote(index + 1);
          commands.push(...scan(source.slice(index + 1, close)).commands);
          index = close;
        }
      }
      cursor = next;
    }
  }

  let words = [];
  let depth = 0;
  const heredocs = [];
  const finish = () => {
    if (words.length) commands.push(words);
    words = [];
  };
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\n") {
      finish();
      cursor++;
      for (const heredoc of heredocs.splice(0)) heredocBody(heredoc);
    } else if (/\s/.test(char)) cursor++;
    else if (char === "#") {
      const end = source.indexOf("\n", cursor);
      cursor = end < 0 ? source.length : end;
    } else if (char === "(") {
      finish();
      depth++;
      cursor++;
    } else if (char === ")") {
      finish();
      cursor++;
      if (depth) depth--;
      else if (nested) return { commands, end: cursor };
    } else if (/[;&|]/.test(char)) {
      finish();
      cursor++;
    } else if (/^\d*[<>]/.test(source.slice(cursor, cursor + 12))) {
      const redirect = /^\d*(<<<|<<-|<<|>>|<>|[<>]&?)/.exec(source.slice(cursor, cursor + 16))[0];
      cursor += redirect.length;
      const operator = redirect.replace(/^\d+/, "");
      while (/[ \t]/.test(source[cursor] ?? "")) cursor++;
      const target = word();
      if (operator === "<<" || operator === "<<-") {
        heredocs.push({ delimiter: target.value, stripTabs: operator === "<<-", expands: !target.quoted });
      } else if (operator.startsWith("<") && operator !== "<<<" && target.value && !target.dynamic) {
        // An input redirect reads a file, whatever the executable is.
        words.push({ ...target, inputFile: true });
      }
    } else {
      const next = word();
      if (next.value || next.quoted || next.dynamic) words.push(next);
    }
  }
  finish();
  return { commands, end: cursor };
}

// Words that run the rest of the command, with the options that take a value.
const WRAPPERS = new Map([
  ["env", ["-u", "--unset", "-C", "--chdir"]],
  ["command", []],
  ["builtin", []],
  ["exec", ["-a"]],
  ["time", []],
  ["nohup", []],
  ["nice", ["-n", "--adjustment"]],
  ["timeout", ["-s", "--signal", "-k", "--kill-after"]],
  ["caffeinate", ["-t", "-w"]],
  ["sudo", ["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir", "-r", "--role", "-t", "--type", "-U", "--other-user", "-T", "--command-timeout"]],
  ["npx", ["-p", "--package", "-c", "--call", "-w", "--workspace"]],
  ["bunx", ["-p", "--package"]],
  ["bun x", ["-p", "--package"]],
  ["npm exec", ["-p", "--package", "-c", "--call", "-w", "--workspace"]],
  ["pnpm dlx", ["--package"]],
  ["pnpm exec", []],
  ["yarn dlx", ["-p", "--package"]],
  ["yarn exec", []],
]);
const PACKAGE_RUNNERS = new Set(["npx", "bunx", "bun x", "npm exec", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec"]);
const RESERVED = new Set(["!", "{", "}", "if", "then", "elif", "else", "fi", "do", "done", "while", "until", "for", "select", "case", "esac", "in"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z_0-9]*=/;

/** The words of the program a command really runs, after assignments, keywords, wrappers and package runners. */
function executableWords(words) {
  const args = words.filter((word) => !word.inputFile);
  for (;;) {
    while (args.length && ((RESERVED.has(args[0].value) && !args[0].quoted) || ASSIGNMENT.test(args[0].value))) args.shift();
    const wrapper = [`${args[0]?.value} ${args[1]?.value}`, args[0]?.value].find((name) => WRAPPERS.has(name));
    if (!wrapper) return args;
    args.splice(0, wrapper.split(" ").length);
    const valueOptions = WRAPPERS.get(wrapper);
    while (args.length && (args[0].value.startsWith("-") || (wrapper === "env" && ASSIGNMENT.test(args[0].value)))) {
      const [option] = args.splice(0, 1);
      if (option.value === "--") break;
      if (valueOptions.includes(option.value)) args.shift();
    }
    if (wrapper === "timeout") args.shift();
    // A package runner names a package, maybe with a version: `vercel@62.1.0` runs `vercel`.
    if (PACKAGE_RUNNERS.has(wrapper) && args[0]) args[0] = { ...args[0], value: args[0].value.replace(/^(@?[^@]+)@.*$/, "$1") };
  }
}

// Programs that name files without printing what is in them.
const NON_READING = new Set(["ls", "stat", "test", "[", "[[", "touch", "rm", "mv", "chmod", "chown", "ln", "file", "echo", "printf", "mkdir", "rmdir", "realpath", "readlink", "basename", "dirname", "wc", "du", "which", "type", "true", "false", "git", "gh"]);
const GREP_VALUES = ["-e", "--regexp", "-f", "--file", "-m", "--max-count", "-A", "--after-context", "-B", "--before-context", "-C", "--context", "-d", "--directories", "-D", "--devices", "--include", "--exclude", "--exclude-dir", "--label"];
// Programs whose first operand is a pattern or script, with the options that take a value.
const PATTERN_PROGRAMS = new Map([
  ["grep", GREP_VALUES],
  ["egrep", GREP_VALUES],
  ["fgrep", GREP_VALUES],
  ["rg", ["-e", "--regexp", "-f", "--file", "-g", "--glob", "--iglob", "-t", "--type", "-T", "--type-not", "--type-add", "-m", "--max-count", "-A", "--after-context", "-B", "--before-context", "-C", "--context", "-M", "--max-columns", "-j", "--threads", "-E", "--encoding", "-d", "--max-depth", "-r", "--replace", "--pre", "--pre-glob", "--sort", "--sortr"]],
  ["sed", ["-e", "--expression", "-f", "--file", "-l", "--line-length"]],
  ["awk", ["-f", "--file", "-v", "--assign", "-F", "--field-separator"]],
]);
const VALUE_OPTIONS = new Map([
  ["head", ["-n", "--lines", "-c", "--bytes"]],
  ["tail", ["-n", "--lines", "-c", "--bytes"]],
]);
const COPIES = new Set(["cp", "rsync", "scp", "install"]);

/** The files a command reads, as far as its words show. */
function filesRead(executable, args) {
  if (NON_READING.has(executable)) return [];
  const patternOptions = PATTERN_PROGRAMS.get(executable);
  const valueOptions = patternOptions ?? VALUE_OPTIONS.get(executable) ?? [];
  let needsProgram = Boolean(patternOptions);
  const operands = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (patternOptions && ["-e", "--regexp", "--expression", "-f", "--file"].includes(arg)) {
      needsProgram = false;
      if (["-f", "--file"].includes(arg)) operands.push(args[index + 1] ?? "");
      index++;
    } else if (patternOptions && /^--(regexp|expression)=|^-e./.test(arg)) needsProgram = false;
    else if (valueOptions.includes(arg)) index++;
    else if (!arg.startsWith("-")) operands.push(arg);
  }
  if (needsProgram) operands.shift();
  // A copy reads its sources, not its destination.
  if (COPIES.has(executable)) operands.pop();
  return operands.map((operand) => operand.replace(/^@/, ""));
}

const block = (message) => ({ action: "block", message });
const ask = (message) => ({ action: "ask", message });

// True when a short flag appears alone or in a group, as `f` does in `-fd`.
const hasShortFlag = (flags, letter) => flags.some((flag) => /^-[a-zA-Z]+$/.test(flag) && flag.includes(letter));
// Git's own options before the subcommand that take the next word as their value.
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"]);

function gitDecision(values) {
  let index = 1;
  while (values[index]?.startsWith("-")) index += GIT_VALUE_OPTIONS.has(values[index]) ? 2 : 1;
  const [subcommand, ...options] = values.slice(index);
  const flags = options.filter((arg) => arg.startsWith("-"));
  const operands = options.filter((arg) => arg && !arg.startsWith("-"));

  if (subcommand === "push") {
    // A mirror push rewrites every remote ref, main included, and deletes the rest.
    const mirror = flags.includes("--mirror");
    const forced = mirror || flags.some((arg) => /^--force(?:$|=|-with-lease)/.test(arg)) || hasShortFlag(flags, "f") || operands.some((arg) => arg.startsWith("+"));
    const toMain = mirror || operands.slice(1).some((arg) => /^(?:\+?[^:]*:)?\+?(?:refs\/heads\/)?(?:main|master)$/.test(arg));
    if (forced) return toMain ? block("Never force-push to main.") : ask("Force push: confirm the branch is yours alone before rewriting it.");
    const deletes = flags.includes("--delete") || hasShortFlag(flags, "d") || operands.slice(1).some((arg) => arg.startsWith(":"));
    return deletes ? ask("Deleting a remote branch can remove another session's work. Confirm the branch is yours.") : null;
  }
  if (subcommand === "add" && (flags.includes("--all") || flags.includes("--update") || hasShortFlag(flags, "A") || hasShortFlag(flags, "u") || operands.some((arg) => [".", "./", ":/", ":/.", "*"].includes(arg)))) {
    return ask("Broad staging can sweep in another session's work. Stage the task's paths by name instead.");
  }
  if (subcommand === "commit" && (flags.includes("--all") || hasShortFlag(flags, "a"))) {
    return ask("`git commit -a` stages every tracked change, including other sessions' work. Stage the task's paths by name, then commit.");
  }
  if (subcommand === "reset" && flags.includes("--hard")) return ask("`git reset --hard` discards uncommitted work, including other sessions' work.");
  if (subcommand === "clean" && (flags.includes("--force") || hasShortFlag(flags, "f"))) return ask("`git clean` deletes untracked files, including other sessions' new files.");
  if (subcommand === "checkout" && (options.includes("--") || operands.includes(".") || flags.includes("--force") || hasShortFlag(flags, "f"))) return ask("This `git checkout` discards uncommitted changes.");
  if (subcommand === "switch" && (flags.includes("--discard-changes") || flags.includes("--force") || hasShortFlag(flags, "f"))) return ask("This `git switch` discards uncommitted changes.");
  if (subcommand === "worktree" && operands[0] === "remove" && (flags.includes("--force") || hasShortFlag(flags, "f"))) {
    return ask("`git worktree remove --force` deletes the worktree's uncommitted changes, which may be another session's.");
  }
  if (subcommand === "restore") {
    const staged = flags.includes("--staged") || hasShortFlag(flags, "S");
    const worktree = flags.includes("--worktree") || hasShortFlag(flags, "W");
    if (!staged || worktree) return ask("`git restore` discards uncommitted changes.");
  }
  if (subcommand === "stash" && !["list", "show"].includes(operands[0])) return ask("The stash stack is shared by every worktree of this repository. Use a work-in-progress commit instead.");
  const deleting = flags.includes("--delete") || hasShortFlag(flags, "d");
  if (subcommand === "branch" && (hasShortFlag(flags, "D") || (deleting && (flags.includes("--force") || hasShortFlag(flags, "f"))))) {
    return ask("`git branch -D` deletes a branch whether or not it is merged.");
  }
  return null;
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** The script that `bash -c` or `eval` runs, when it is written out in the command. */
function nestedScript(executable, args) {
  if (executable === "eval") return args.slice(1).every((word) => !word.dynamic) ? args.slice(1).map((word) => word.value).join(" ") : undefined;
  if (!SHELLS.has(executable)) return undefined;
  const flag = args.findIndex((word, index) => index > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(word.value));
  const script = flag > 0 ? args[flag + 1] : undefined;
  return script && !script.dynamic ? script.value : undefined;
}

function commandDecision(executable, values, words) {
  if (executable === "bun" && values[1] === "test") {
    return block("Use `bun run test`, never `bun test`: the suites run under `node --test`.");
  }
  const inputRead = words.some((word) => word.inputFile && !word.dynamic && isSecretPath(word.value));
  if (inputRead || filesRead(executable, values.slice(1)).some(isSecretPath)) return block(SECRET_READ);
  if (executable === "git") return gitDecision(values);
  if (executable === "gh" && ((values[1] === "pr" && values[2] === "merge") || (values[1] === "api" && values.some((value) => /\/pulls\/\d+\/merge$/.test(value))))) {
    return ask("Merging needs the person's explicit approval for this pull request.");
  }
  if (executable === "vercel" && (values.includes("--prod") || values.includes("--target=production") || values.some((value, index) => value === "--target" && values[index + 1] === "production") ||
    ["promote", "rollback", "redeploy", "alias", "dns", "domains", "env", "remove", "rm"].includes(values[1]))) {
    return ask("This changes a live deployment, domain or project setting, which needs the person's explicit approval.");
  }
  // --linked and --db-url point a command at a hosted database instead of the local one.
  const hosted = values.includes("--linked") || values.some((value) => value === "--db-url" || value.startsWith("--db-url="));
  if (executable === "supabase" && (hosted || (values[1] === "db" && values[2] === "push") || values[1] === "link" || values[1] === "secrets" ||
    (values[1] === "projects" && values[2] === "create") || (values[1] === "functions" && values[2] === "deploy"))) {
    return ask("This touches a hosted Supabase project. Migrations reach it only through the website repository's release step.");
  }
  return null;
}

export function evaluateCommand(command, depth = 0) {
  const decisions = scan(command).commands.flatMap((words) => {
    const args = executableWords(words);
    const values = args.map((word) => (word.dynamic ? "" : word.value));
    const executable = basename(values[0] ?? "");
    const script = depth < 4 ? nestedScript(executable, args) : undefined;
    const nested = script ? evaluateCommand(script, depth + 1).decisions : [];
    const own = commandDecision(executable, values, words);
    return own ? [...nested, own] : nested;
  });
  return { decisions: [...new Map(decisions.map((decision) => [`${decision.action}:${decision.message}`, decision])).values()] };
}

function main() {
  const harness = process.argv[2];
  if (!["claude", "codex"].includes(harness)) {
    console.error("Command policy: expected claude or codex.");
    process.exitCode = 2;
    return;
  }
  let event;
  try { event = JSON.parse(readFileSync(0, "utf8")); }
  catch {
    console.error("Command policy: invalid event input; no policy decision. Normal permissions apply.");
    return;
  }
  const command = event?.tool_input?.command;
  if (typeof command !== "string") {
    console.error("Command policy: command unavailable; no policy decision. Normal permissions apply.");
    return;
  }
  const { decisions } = evaluateCommand(command);
  const blocked = decisions.filter((decision) => decision.action === "block" || harness === "codex");
  if (blocked.length) {
    for (const { action, message } of blocked) {
      console.error(`BLOCKED: ${message}${action === "ask" ? " If the person has asked for this, they can run it themselves." : ""}`);
    }
    process.exitCode = 2;
    return;
  }
  const asks = decisions.filter((decision) => decision.action === "ask");
  if (asks.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: asks.map(({ message }) => message).join(" "),
      },
    }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
