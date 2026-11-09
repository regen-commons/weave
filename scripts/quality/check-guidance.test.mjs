import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkGuidance } from "./check-guidance.mjs";

const SKILL = "---\nname: plan\ndescription: Plan multi-step work.\n---\n\n# Plan\n";
const GUIDE = "# Guide\n\n## Checks\n\nRun `bun run test`.\n\n| Package | Guide |\n|---|---|\n| x | [guide](packages/x/AGENTS.md) |\n\n| Skill | Link |\n|---|---|\n| plan | [plan](.claude/skills/plan/SKILL.md) |\n";

/** A minimal repository that passes, with `changes` applied: a string writes a file, null leaves it out. */
function fixture(changes = {}, { symlink = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "guidance-"));
  const files = {
    "AGENTS.md": GUIDE,
    "CLAUDE.md": "@AGENTS.md\n",
    "package.json": JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "node --test" } }),
    ".claude/skills/plan/SKILL.md": SKILL,
    ".claude/rules/frontend.md": "---\npaths:\n  - \"packages/x/**\"\n---\n\n# Rules\n",
    "packages/x/package.json": JSON.stringify({ name: "@t/x", scripts: { test: "node --test" } }),
    "packages/x/AGENTS.md": "# Package x\n\nSee the [root guide](../../AGENTS.md#checks). Run `bun run --filter @t/x test`.\n",
    "docs/notes.md": "# Notes\n\n```bash\nbun run --filter '*' test\n```\n",
    ...changes,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  if (symlink) {
    mkdirSync(join(root, ".agents"), { recursive: true });
    symlinkSync("../.claude/skills", join(root, ".agents/skills"));
  }
  execFileSync("git", ["-C", root, "init", "-q"]);
  return root;
}

function failuresWith(changes, options) {
  const root = fixture(changes, options);
  try {
    return checkGuidance(root).failures;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a consistent repository passes", () => {
  assert.deepEqual(failuresWith({}), []);
});

const cases = [
  ["a link to a missing file", { "docs/notes.md": "See [the plan](plan.md).\n" }, /docs\/notes\.md: link to a missing file: plan\.md/],
  ["a link to a missing heading", { "docs/notes.md": "See [checks](../AGENTS.md#tests).\n" }, /link to a missing heading: \.\.\/AGENTS\.md#tests/],
  ["a titled link to a missing file", { "docs/notes.md": "See [the plan](plan.md \"Plan\").\n" }, /link to a missing file: plan\.md/],
  ["a reference link to a missing file", { "docs/notes.md": "See [the plan][plan].\n\n[plan]: plan.md\n" }, /link to a missing file: plan\.md/],
  ["an unknown root script", { "docs/notes.md": "Run `bun run lint`.\n" }, /`bun run lint` is not a root package\.json script/],
  ["an unknown package", { "packages/x/AGENTS.md": "Run `bun run --filter @t/y test`.\n" }, /`bun run --filter @t\/y` names no workspace package/],
  ["an unknown package script", { "packages/x/AGENTS.md": "Run `bun run --filter @t/x build`.\n" }, /is not a script in packages\/x\/package\.json/],
  ["a placeholder for a script no package has", { "docs/notes.md": "Run `bun run --filter <package> lint`.\n" }, /no workspace package has a `lint` script/],
  ["a skill whose name differs from its folder", { ".claude/skills/plan/SKILL.md": SKILL.replace("name: plan", "name: planning") }, /frontmatter name must be "plan"/],
  ["a skill without a description", { ".claude/skills/plan/SKILL.md": "---\nname: plan\n---\n\n# Plan\n" }, /needs a description/],
  ["a skill longer than the limit", { ".claude/skills/plan/SKILL.md": SKILL + "line\n".repeat(300) }, /move detail into linked files/],
  ["a skill missing from the skills table", { "AGENTS.md": GUIDE.replace("| plan | [plan](.claude/skills/plan/SKILL.md) |\n", "") }, /does not link \.claude\/skills\/plan\/SKILL\.md/],
  ["a rule without paths", { ".claude/rules/frontend.md": "# Rules\n" }, /frontend\.md: frontmatter needs a paths list/],
  ["CLAUDE.md with its own policy", { "CLAUDE.md": "@AGENTS.md\n\nAlways use tabs.\n" }, /CLAUDE\.md must contain only @AGENTS\.md/],
  ["a copied skills folder instead of the symlink", { ".agents/skills/plan/SKILL.md": SKILL }, /\.agents\/skills must be a symlink/, { symlink: false }],
  ["a package without a guide", { "packages/x/AGENTS.md": null }, /packages\/x\/AGENTS\.md: every package needs a guide/],
  ["a package guide missing from the routing table", { "AGENTS.md": GUIDE.replace("| x | [guide](packages/x/AGENTS.md) |\n", "") }, /routing table does not link packages\/x\/AGENTS\.md/],
];
for (const [name, changes, expected, options] of cases) {
  test(`fails on ${name}`, () => {
    const failures = failuresWith(changes, options);
    assert.ok(failures.some((failure) => expected.test(failure)), failures.join("\n") || "no failures");
  });
}

test("heading anchors follow GitHub's slugs", () => {
  const notes = "# Notes\n\n## Elevation & Depth\n\nSee [depth](#elevation--depth).\n";
  assert.deepEqual(failuresWith({ "docs/notes.md": notes }), []);
  assert.ok(failuresWith({ "docs/notes.md": notes.replace("--", "-") }).some((failure) => /missing heading/.test(failure)));
});

test("files beside the skill folders, footnotes and Windows line endings pass", () => {
  const crlf = (text) => text.replace(/\n/g, "\r\n");
  const changes = {
    ".claude/skills/.DS_Store": "",
    ".claude/skills/plan/SKILL.md": crlf(SKILL),
    ".claude/rules/frontend.md": crlf("---\npaths:\n  - \"packages/x/**\"\n---\n\n# Rules\n"),
    "docs/notes.md": "A claim.[^1]\n\n[^1]: Source note, not a link.\n",
  };
  assert.deepEqual(failuresWith(changes), []);
});

test("code spans, fenced blocks and external links are not read as relative links", () => {
  const notes = "Use `[x](missing.md)` and [the site](https://example.org/missing.md).\n\n```md\n[y](missing.md)\n```\n";
  assert.deepEqual(failuresWith({ "docs/notes.md": notes }), []);
});
