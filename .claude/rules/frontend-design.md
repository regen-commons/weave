---
paths:
  - "DESIGN.md"
  - "packages/design-system/**"
  - "packages/app/**"
---

# Frontend design rules

Use the [design skill](../skills/design/SKILL.md) for the workflow. These are the
mistakes agents make most often here:

- **Raw values.** Use role tokens such as `--surface`, `--action` and `--space-4`.
  No hex, `rgb()` or pixel values in CSS, inline styles or component props.
- **One-off components.** Reuse a pattern from
  [COMPONENTS.md](../../packages/design-system/COMPONENTS.md) before writing markup.
  A React component renders the pattern's markup and `rc-` classes; it owns no CSS.
- **Colour as the only signal.** Pair colour with a word, an icon, a shape or a
  position.
- **Hover-only actions.** Every action works by tap and by keyboard, with a visible
  focus ring.
- **Unlabeled inputs.** Every field has a visible label above it. Hints go between
  the label and the control, never in a placeholder.
- **Invented vocabulary.** Labels use the plain names in
  [VOICE.md](../../packages/design-system/brand/VOICE.md): "Partners for you", not
  "matches"; "kind of support", not "form of capital".
- **Controls that do not work yet.** Show an honest empty state instead.

Generated files in `packages/design-system/tokens/` come from `DESIGN.md` through
`bun run design:tokens`. Never edit them by hand.
