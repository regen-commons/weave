#!/usr/bin/env node
// Checks that agent guidance still matches the repository: Markdown links and heading
// anchors resolve, documented `bun run` scripts exist, skills have valid frontmatter
// and are routed from AGENTS.md, path-scoped rules declare their paths, every package
// has a guide, CLAUDE.md only imports AGENTS.md, and .agents/skills is the symlink.
//
// Usage: node scripts/quality/check-guidance.mjs [root]
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL_LINE_LIMIT = 300;
// Inline links, with or without a title, and reference definitions. Footnotes are not links.
const INLINE_LINK = /\]\((?!#\s)([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
const REFERENCE_LINK = /^ {0,3}\[(?!\^)[^\]]+\]:\s*<?([^\s>]+)>?/gm;
const DESCRIPTION_LIMIT = 1024;
// Files whose commands agents follow. Older catalog reports may name retired scripts.
const COMMAND_SOURCES = /(^|\/)(AGENTS|CLAUDE|SKILL|README)\.md$|^\.claude\/|^docs\//;

/** GitHub's heading anchors: closing hashes and punctuation dropped, lower case, each space a hyphen. */
export const slug = (heading) => heading.replace(/\s+#+\s*$/, "").trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");

const read = (root, path) => readFileSync(join(root, path), "utf8");
const readJson = (root, path) => JSON.parse(read(root, path));

function markdownFiles(root) {
  const listed = execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "--", "*.md"], { encoding: "utf8" });
  return listed.split("\n").filter((path) => path && !path.startsWith(".claude/worktrees/") && existsSync(join(root, path))).sort();
}

function frontMatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!block) return null;
  const fields = {};
  let current;
  for (const line of block[1].split(/\r?\n/)) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field) {
      current = field[1];
      fields[current] = field[2].trim() ? field[2].trim().replace(/^["']|["']$/g, "") : [];
    } else if (current && Array.isArray(fields[current]) && /^\s+-\s+/.test(line)) {
      fields[current].push(line.replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, ""));
    }
  }
  return fields;
}

function checkLinks(root, files) {
  const failures = [];
  const headings = new Map();
  const anchorsOf = (path) => {
    if (!headings.has(path)) headings.set(path, new Set([...readFileSync(path, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1]))));
    return headings.get(path);
  };
  for (const file of files) {
    const body = read(root, file).replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    const links = [...body.matchAll(INLINE_LINK), ...body.matchAll(REFERENCE_LINK)].map((match) => match[1]);
    for (const link of links.filter((target) => !/^(?:https?|mailto):/.test(target))) {
      const [path, anchor] = link.split("#");
      const target = path ? resolve(root, dirname(file), decodeURI(path)) : join(root, file);
      if (!existsSync(target)) failures.push(`${file}: link to a missing file: ${link}`);
      else if (anchor && target.endsWith(".md") && !anchorsOf(target).has(anchor)) failures.push(`${file}: link to a missing heading: ${link}`);
    }
  }
  return failures;
}

function checkCommands(root, files) {
  const failures = [];
  const rootScripts = readJson(root, "package.json").scripts ?? {};
  const packages = new Map();
  if (existsSync(join(root, "packages"))) {
    for (const dir of readdirSync(join(root, "packages"))) {
      const manifest = join(root, "packages", dir, "package.json");
      if (existsSync(manifest)) {
        const { name, scripts = {} } = JSON.parse(readFileSync(manifest, "utf8"));
        packages.set(name, { dir, scripts });
      }
    }
  }
  for (const file of files.filter((path) => COMMAND_SOURCES.test(path))) {
    const text = read(root, file);
    // Commands live in code: fenced blocks and inline code spans.
    const code = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1])
      .concat([...text.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map((match) => match[1]));
    for (const snippet of code) {
      for (const [, filter, script] of snippet.matchAll(/\bbun run(?:\s+--filter\s+(\S+))?\s+([\w:.][\w:.-]*)/g)) {
        const name = filter?.replace(/^['"]|['"]$/g, "");
        if (!filter) {
          if (!rootScripts[script]) failures.push(`${file}: \`bun run ${script}\` is not a root package.json script`);
        } else if (name.includes("*") || /^<[\w-]+>$/.test(name)) {
          // A glob or a placeholder such as <package>: some package must have the script.
          if (![...packages.values()].some((pkg) => pkg.scripts[script])) failures.push(`${file}: no workspace package has a \`${script}\` script`);
        } else if (!packages.has(name)) failures.push(`${file}: \`bun run --filter ${name}\` names no workspace package`);
        else if (!packages.get(name).scripts[script]) failures.push(`${file}: \`bun run --filter ${name} ${script}\` is not a script in packages/${packages.get(name).dir}/package.json`);
      }
    }
  }
  return failures;
}

function checkSkills(root) {
  const failures = [];
  const skillsDir = join(root, ".claude/skills");
  const guide = existsSync(join(root, "AGENTS.md")) ? read(root, "AGENTS.md") : "";
  if (!existsSync(skillsDir)) return failures;
  for (const name of readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const path = `.claude/skills/${name}/SKILL.md`;
    if (!existsSync(join(root, path))) {
      failures.push(`.claude/skills/${name}: missing SKILL.md`);
      continue;
    }
    const text = read(root, path);
    const fields = frontMatter(text);
    if (!fields) failures.push(`${path}: missing frontmatter`);
    else {
      if (fields.name !== name) failures.push(`${path}: frontmatter name must be "${name}"`);
      if (typeof fields.description !== "string" || !fields.description) failures.push(`${path}: frontmatter needs a description`);
      else if (fields.description.length > DESCRIPTION_LIMIT) failures.push(`${path}: description is over ${DESCRIPTION_LIMIT} characters`);
    }
    const lines = text.split("\n").length;
    if (lines > SKILL_LINE_LIMIT) failures.push(`${path}: ${lines} lines; move detail into linked files (limit ${SKILL_LINE_LIMIT})`);
    if (!guide.includes(`(${path})`)) failures.push(`AGENTS.md: the skills table does not link ${path}`);
  }
  return failures;
}

function checkRules(root) {
  const dir = join(root, ".claude/rules");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md")).flatMap((name) => {
    const paths = frontMatter(read(root, `.claude/rules/${name}`))?.paths;
    return Array.isArray(paths) && paths.length ? [] : [`.claude/rules/${name}: frontmatter needs a paths list`];
  });
}

function checkHarness(root) {
  const failures = [];
  if (!existsSync(join(root, "CLAUDE.md")) || read(root, "CLAUDE.md").trim() !== "@AGENTS.md") failures.push("CLAUDE.md must contain only @AGENTS.md");
  const link = join(root, ".agents/skills");
  if (!existsSync(link) || !lstatSync(link).isSymbolicLink()) failures.push(".agents/skills must be a symlink to ../.claude/skills");
  else if (realpathSync(link) !== realpathSync(join(root, ".claude/skills"))) failures.push(".agents/skills must point at .claude/skills");
  const guide = existsSync(join(root, "AGENTS.md")) ? read(root, "AGENTS.md") : "";
  if (existsSync(join(root, "packages"))) {
    for (const dir of readdirSync(join(root, "packages"))) {
      if (!existsSync(join(root, "packages", dir, "package.json"))) continue;
      const path = `packages/${dir}/AGENTS.md`;
      if (!existsSync(join(root, path))) failures.push(`${path}: every package needs a guide`);
      else if (!guide.includes(`(${path})`)) failures.push(`AGENTS.md: the routing table does not link ${path}`);
    }
  }
  return failures;
}

export function checkGuidance(root) {
  const files = markdownFiles(root);
  return {
    files,
    failures: [...checkLinks(root, files), ...checkCommands(root, files), ...checkSkills(root), ...checkRules(root), ...checkHarness(root)],
  };
}

function main() {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../../", import.meta.url)));
  const { files, failures } = checkGuidance(root);
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    console.error(`Guidance check failed: ${failures.length} problem${failures.length === 1 ? "" : "s"}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Guidance check passed: ${files.length} Markdown files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
