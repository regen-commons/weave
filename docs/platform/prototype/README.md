# Weave interface prototype

A click-through prototype of Weave's first version, designed before the app was built. It has 22 screens, each with its states (empty, loading, offline, error, long content and its own), at phone and desktop widths, in both themes. The maker walked through it on 3 and 4 November 2026; version 4 answers both reviews, and [review-decisions.md](review-decisions.md) lists what they decided and where each decision belongs.

It is the design reference for building the interface in `packages/app`, not code to port. The content is invented, the assistant and the network are simulated, and nothing typed is sent or stored. The [implementation handover](../handover/03-interface-implementation.md) says how to build from it.

See [implementation status](implementation-status.md) for the app pull requests, browser proof and remaining launch work.

The published copy is the Artifact at https://claude.ai/artifact/797CzZQeSRsk7XsQ44CUBQ, which the maker shares by link. Its Notes button opens the design notes in [src/notes.html](src/notes.html).

## Run it

Build it, then serve the build folder with the repository's static server:

```bash
node docs/platform/prototype/build.mjs
```

```bash
SERVE_ROOT=docs/platform/prototype/build PORT=4199 bun serve.mjs
```

Open http://127.0.0.1:4199/. The control bar picks a screen and its state, the theme and the width (a 360 px phone frame or the full window). Reset walkthrough forgets the session. The product's own buttons and links work too, so you can walk through it as a person would.

The build copies the design system's `css/`, `tokens/` and `fonts/` unchanged from [packages/design-system](../../../packages/design-system/README.md), so the prototype always renders with the current system. It was last checked against `main` at `64b10f7`.

## Photos

Initiatives show ten credited photos from Unsplash (credits in `photos` in [src/proto-data.js](src/proto-data.js)). They are not in Git. Without them the page draws simple scenes instead. To show them, fetch them into `img/`, which Git ignores, and build again:

```bash
for p in springs:photo-1621698832676-2658780ef263 forest:photo-1781453641464-1bffa003c1bb seeds:photo-1598132393715-6538660246fa mapping:photo-1774175977586-5e9cfe25a325 lagoon:photo-1753818268536-b3227488c3f8 river:photo-1777373863588-4d27e258e624 mangrove:photo-1777000969195-3085ac53731d grassland:photo-1568153523383-a1389d3dc69a nursery:photo-1466692476868-aef1dfb1e735 planting:photo-1625758476104-f2ed6c81248f; do curl -sSL --create-dirs -o "docs/platform/prototype/img/${p%%:*}.jpg" "https://images.unsplash.com/${p#*:}?w=1200&q=62&fm=jpg&fit=crop&crop=entropy&ar=16:9"; done
```

## Files

| Path | Holds |
|---|---|
| `src/page.template.html` | The control bar, the phone frame, the notes panel and the one dialog. The build inlines the design system's icon sprite and the notes |
| `src/prototype.css` | `proto-` classes for the prototype's own chrome, which never move into the product, and `rcp-` classes for proposed patterns, each with a comment on why no existing pattern fits |
| `src/proto-data.js` | The invented content: one example initiative, partners, funds, the eight kinds of support with their tooltips, conversation scripts, photo credits and the proposed download sizes |
| `src/proto-screens.js`, `src/proto-screens-2.js` | One render function per screen, returning markup for the chosen state |
| `src/proto-app.js` | Navigation, the session, sheets and dialogs, menus and tooltips, simulated timers and the home backdrop |
| `src/notes.html` | The notes panel: both reviews, the download research, the design rules, screens and patterns, review results, proposals and the usability script |
| `src/audit.js` | An in-page check that renders every screen in every state and reports layout, labelling and contrast problems. It is not part of the page |
| `build.mjs` | Writes `build/` (ignored by Git): `weave-prototype.html`, the page to publish as an Artifact, and `index.html`, the same page in a document skeleton for local use |

## Check it

Open the local page, paste `src/audit.js` into the browser console, then run `await window.__audit()`. It returns the number of renders, the problems found and any runtime errors. Version 4 passed with no problems in six passes: 1280 px wide, the 360 px frame and a 375 px viewport, each in light and dark. Not yet checked: 200 percent zoom, forced colours, reduced motion by eye, and the native hint popover in a browser that supports it.

## Publish an update

Keep the same link. From a session with the Artifact tool, build, then publish `build/weave-prototype.html` to the URL above with the other files in `build/` at the same relative paths (`css/`, `tokens/`, `fonts/`, `prototype.css`, the four scripts, and `img/` if present). Record what changed in `src/notes.html`.
