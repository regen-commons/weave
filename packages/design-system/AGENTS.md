# Design-system package

Use the [root guide](../../AGENTS.md) for shared workflow and the
[design skill](../../.claude/skills/design/SKILL.md) for any design work. This package,
`@regen-commons/design-system`, holds the layered CSS, generated tokens, fonts, brand
and voice guides, the pattern library and its example pages. The tokens themselves
live in [DESIGN.md](../../DESIGN.md) at the repository root. The
[package README](README.md) is the map of what is here.

## Boundaries

- Change a token in `DESIGN.md`, then run `bun run design:tokens`. Never edit
  `tokens/`, which is generated.
- CSS uses role tokens only, inside the cascade layers `tokens`, `base`, `atoms`,
  `molecules`, `organisms` and `templates`. Classes start with `rc-`; variants use data
  attributes and ARIA state (DL-012).
- Every class is documented in [COMPONENTS.md](COMPONENTS.md) and shown in the
  [pattern library](patterns/index.html). The inventory's "Used in" column must match
  the example pages. Follow
  [the steps for adding a pattern](COMPONENTS.md#add-or-change-a-pattern).
- The website's values are preserved and compared with the pinned copy in `source/`.
  Do not edit that copy except to refresh it from the website, as its README says.
- This package is framework-free so the website, the steward desk and email can use
  it. React components belong in the app, in `packages/app/src/ui`.
- Consumers import the CSS by package name: `@regen-commons/design-system/css`. The
  `exports` in [package.json](package.json) are the public surface; other paths may
  move.
- Example pages use invented content until real hub rows and assistant output exist.
  Keep it plain and synthetic: no real people, contact details or private records.

## Checks

| When | Run |
|---|---|
| Any change here or in `DESIGN.md` | `bun run design:check` and `bun run --filter @regen-commons/design-system test` |
| A pattern or page | Also `bun run design:serve` and open http://localhost:4173/patterns/index.html at 360 px and a wide width, in both themes, with the keyboard |

The tests check generated tokens, the DesignMD linter, website values, contrast in
both themes, raw values in CSS, classes against the inventory and pages, copy rules,
fonts and icons, and the links in the design documents.
