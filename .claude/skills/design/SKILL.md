---
name: design
description: Design or change any Regen Commons screen, component, CSS or product copy using the design system and the three books it follows. Use for new screens, pattern changes, token changes, UI polish, copy edits and design reviews in packages/app, packages/design-system or DESIGN.md.
---

# Design with the Regen Commons system

UI work follows three books: *Don't Make Me Think* for how people use it, *Refactoring
UI* for how a screen shows what matters, and *Atomic Design* for how the system stays
whole. [DESIGN.md](../../../DESIGN.md) applies them and owns every token. The
[notes on each book](../../../packages/design-system/principles/README.md) say how
they apply here, with page references.

Read before starting: [DESIGN.md](../../../DESIGN.md), the
[component inventory](../../../packages/design-system/COMPONENTS.md),
[VOICE.md](../../../packages/design-system/brand/VOICE.md) for any words people read,
and the [dialect](../../../packages/design-system/dialects/README.md) for the surface:
the app, the website, the steward desk or email.

## Workflow

1. **Start from the feature, not the layout.** Design the smallest useful version
   first, with real content and worst-case content: a long name, Portuguese, many
   items, none.
2. **Find the existing pattern.** Check the inventory and reuse what is there. If
   nothing fits, record why in the pull request before making something new.
3. **Place it.** Name its level (atom, molecule, organism, template or page) and add
   it to the [pattern library](../../../packages/design-system/patterns/index.html) in
   the same change, following
   [the steps for adding a pattern](../../../packages/design-system/COMPONENTS.md#add-or-change-a-pattern).
4. **Use only tokens.** Sizes, gaps, colours, radii and shadows come from `DESIGN.md`.
   A value outside the scales is drift. To change a token, edit `DESIGN.md` and run
   `bun run design:tokens`; never edit `packages/design-system/tokens/`.
5. **Design every state.** Empty, loading, partial, error, offline, long content and
   first use. Do not show controls that do not work yet.
6. **Run the [five-minute review](../../../DESIGN.md#how-we-follow-them)** on a rendered
   page at 360 px and at a wide width, in both themes, and report the result in the
   handoff. Larger changes use the
   [review checklist](../../../packages/design-system/principles/ui-review-checklist.md).
7. **Record decisions.** A settled question goes in the
   [decision log](../../../packages/design-system/decision-log.md), so the next session
   does not reopen it.

## Rules that hold everywhere

- React components in `packages/app/src/ui` stay thin: they render the system's
  markup and `rc-` classes and own no visual CSS (DL-015). Name them by structure,
  such as `Card`, never by content.
- The theme follows the operating system. A theme control belongs in settings, never
  in the app header.
- Colour never carries meaning alone. Pair it with a word, an icon, a shape or a
  position, as the capital tiles do.
- Anything the assistant suggested shows in pencil until a person confirms it.
- Copy uses the plain names in VOICE.md, sentence case, and no em dashes or arrows.

## Checks

Run `bun run design:check` and `bun run --filter @regen-commons/design-system test`.
The tests fail on stale tokens, contrast below AA in either theme, raw values in CSS,
undocumented or unused classes, broken links and copy that breaks the voice rules.
Label rendered proof with its class and browser, as the
[root guide](../../../AGENTS.md#checks) says, and include the widths and themes you
checked.
