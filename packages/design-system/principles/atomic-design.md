# Atomic Design in this product

This book shapes how the system is organised and kept alive. [COMPONENTS.md](../COMPONENTS.md) applies it.

## The levels

We think at five levels at once. They are a way of seeing, not a sequence of phases (41, 55-56).

| Level | Meaning here | CSS layer | Example |
|---|---|---|---|
| Atoms | The smallest parts that still work (42-43) | `atoms` | Button, input, tile |
| Molecules | Small groups with one job. Split anything that has two (43-45) | `molecules` | Field, proposal, card |
| Organisms | Distinct sections (45-47) | `organisms` | App header, code panel |
| Templates | Layouts that state content structure and limits (48-50) | `templates` | Conversation step |
| Pages | Templates with representative content (51-54) | none | The files in [patterns/pages](../patterns/pages/) |

Tokens sit underneath as foundations. The book predates design tokens and does not cover them.

## Rules we keep

- **Compose by inclusion.** A larger pattern embeds a smaller one and never copies it, so one fix reaches every use (66-70). In React this means importing. The static pages repeat some markup only because HTML has no includes. They are a preview.
- **Separate structure from data.** Patterns take content as input. A variant is a data change: a flag, a long string, a missing image (73-80).
- **Show worst cases beside best cases:** empty, first time, crowded, very long text, a privileged user (54, 77-80).
- **Pages test the system.** Whatever cannot be assembled, or breaks under real content, is a gap. Fix it at the lowest level that caused it, and rebuild the page (51-54, 57-58).
- **Check a continuous range of widths,** not three device sizes (81-84).
- **Keep notes and lineage on the pattern:** what it is, when to use it, its limits, what it contains and where it appears (84-90).
- **Keep the library's own chrome plain,** so nobody mistakes it for product style (64-65, 90).

## Adding and changing patterns

Follow the procedure in [COMPONENTS.md](../COMPONENTS.md#add-or-change-a-pattern). The book's core rules:

- Add a shared pattern on its second real use. Keep a one-off with its feature until then (155-156).
- When a screen shows a bug or a request, ask whether the pattern should change, and change it there (141-143).
- Name by structure, not by page, content or look. Blur the content and describe what remains (173-174).
- Retire with notice and a named replacement (155-156).

## Keeping it alive

- **It is a living product,** with a roadmap and a backlog, not a one-time deliverable (140-144).
- **Name who makes and who uses it,** with feedback both ways. A small team can be both, if the owner has authority (147-152). Agents are users, and they propose changes through pull requests.
- **Write governance down** (152-155). The [README](../README.md#how-it-changes) has ours.
- **Keep one code source** for library and production, so upkeep stays cheap. Where full sharing is out of reach, share styles first (156-162). So the website and desk take tokens first and patterns later.
- **Start with an interface inventory** before a rebuild: one capture of each unique pattern, then keep, merge or drop (95-103). The website survey served as a first pass. Repeat it properly before migrating the desk.
- **Good design includes** accessibility, speed and resilience, not only looks (107-111).

## Where we go past the book

The book is from 2016. Its includes map to React imports. Container queries, which it treats as future, now ship. Tokens, theming, WCAG technique, email rendering and AI output of varying length are ours to work out. We use real extraction output as page content, including low-confidence proposals.
