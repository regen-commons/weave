---
version: alpha
name: Regen Commons Website Dialect
description: How regencommons.com relates to the core system and how it can adopt it step by step.
extends: ../../DESIGN.md
surface: website
---

# Website dialect

The website is the brand's public face and the source of its values. This system keeps every website value, so nothing has to change. Adoption is a choice for website maintainers, one step at a time.

## What stays

Dark by default, pinned with `data-theme="dark"`. The hero's Fraunces display and italic accent. Organic blob buttons on marketing pages. The mycelium canvases and paper grain behind hero regions. Per-page accents. Warm 18 px reading text and botanical language.

## Adoption path

1. **Tokens.** Load `tokens.generated.css` beside or in place of `design-tokens.css`, and add `data-theme="dark"` to the root. Website names such as `--paper` and `--copper-rgb` still resolve. `--ink-dim` becomes the darker public value everywhere, which also fixes low contrast on the steward desk.
2. **Floors.** Raise eyebrows and buttons from 0.52-0.65 rem to the 12 px floor, with weight 600, about 0.08em tracking and at most three words. Move line height from 1.88 to 1.6.
3. **Motion.** Stop the canvases under reduced motion.
4. **Rhythm.** Use the spacing scale, with a 16 px gutter on phones and 56, 80, 112 px section rhythm instead of 8 rem. Bring the phone hero to 36-48 px.
5. **Breakpoints.** Rebuild from max-width to min-width queries as pages are touched.
6. **Patterns.** Import atoms last. Unlayered website CSS overrides the system's layers, so remove old rules as each pattern moves.

Do not copy website component CSS into products. It is desktop-first and about 40 percent of its selectors are unused.
