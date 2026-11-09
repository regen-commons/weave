---
version: alpha
name: Regen Commons Field Notebook
description: Shared visual language for Regen Commons products. Warm paper and ink, botanical accents, plain task screens and a phone-first layout.
colors:
  primary: "{colors.forest-700}"
  secondary: "{colors.copper-700}"
  tertiary: "{colors.gold-700}"
  neutral: "{colors.soil-100}"
  soil-50: "#F6F1E6"
  soil-100: "#EDE5D4"
  soil-150: "#E2DAC8"
  soil-200: "#E0D6C0"
  soil-300: "#D2C5AA"
  soil-400: "#B8AE96"
  soil-500: "#A49A87"
  soil-600: "#86765D"
  soil-700: "#5D503B"
  soil-800: "#4A3E2C"
  soil-900: "#1A1408"
  loam-850: "#1C2118"
  loam-900: "#141810"
  loam-950: "#0D100A"
  forest-100: "#EEF7E8"
  forest-300: "#A8CD98"
  forest-400: "#7AAA6A"
  forest-700: "#1E3A10"
  forest-800: "#142C0B"
  forest-900: "#0B1D06"
  moss-100: "#F0F9E6"
  moss-300: "#B4DD9A"
  moss-400: "#8EC472"
  moss-700: "#3C6618"
  moss-800: "#274C10"
  moss-900: "#153209"
  circuit-100: "#E9F6EF"
  circuit-300: "#99C4A8"
  circuit-400: "#6A9A78"
  circuit-700: "#4A7A58"
  circuit-800: "#32593E"
  circuit-900: "#1E3B27"
  sage-400: "#A5C490"
  sage-700: "#7A9A60"
  copper-100: "#FCF2E4"
  copper-300: "#E1AC77"
  copper-400: "#C47838"
  copper-700: "#944818"
  copper-800: "#6E2F0F"
  copper-900: "#481A08"
  gold-100: "#FCF7E3"
  gold-300: "#EAC973"
  gold-400: "#D4A030"
  gold-700: "#A87010"
  gold-800: "#7A4B0A"
  gold-900: "#4E2D06"
  amber-100: "#FCF2E3"
  amber-300: "#EFAD73"
  amber-400: "#E07830"
  amber-700: "#C05210"
  amber-800: "#8B340B"
  amber-900: "#591D07"
  signal-100: "#E4F8FB"
  signal-300: "#8CCEE3"
  signal-400: "#5AACCC"
  signal-700: "#2A6888"
  signal-800: "#1C4965"
  signal-900: "#102C42"
  teal-100: "#E6FAF5"
  teal-300: "#83D8BE"
  teal-400: "#48B890"
  teal-700: "#1A7860"
  teal-800: "#115945"
  teal-900: "#0A3B2B"
  madder-300: "#F0B3A2"
  madder-400: "#E58A72"
  madder-700: "#8F2A1C"
  madder-800: "#6E1D12"
typography:
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.45
  body-sm:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  title-sm:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  button:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.25
  code:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.12em
  reading-md:
    fontFamily: Source Serif 4
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  reading-lg:
    fontFamily: Source Serif 4
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  headline-sm:
    fontFamily: Fraunces
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.25
  headline-md:
    fontFamily: Fraunces
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.15
  headline-lg:
    fontFamily: Fraunces
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-display:
    fontFamily: Fraunces
    fontSize: 48px
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: -0.03em
  headline-hero:
    fontFamily: Fraunces
    fontSize: 64px
    fontWeight: 300
    lineHeight: 1
    letterSpacing: -0.03em
rounded:
  sm: 2px
  md: 4px
  lg: 8px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 24px
  "6": 32px
  "7": 40px
  "8": 56px
  "9": 80px
  "10": 112px
  "11": 160px
  gutter: clamp(1rem, 4.44vw, 3rem)
  pad: clamp(1.8rem, 6vw, 5rem)
  form-width: 448px
  prose-width: 576px
  card-min-width: 288px
  tile-card-min-width: 240px
  list-width: 640px
  page-width: 1120px
components:
  surface: { backgroundColor: "{colors.soil-100}", textColor: "{colors.soil-900}" }
  surface-dark: { backgroundColor: "{colors.loam-950}", textColor: "{colors.soil-150}" }
  surface-raised: { backgroundColor: "{colors.soil-50}", textColor: "{colors.soil-900}" }
  surface-raised-dark: { backgroundColor: "{colors.loam-900}", textColor: "{colors.soil-150}" }
  surface-overlay: { backgroundColor: "{colors.soil-50}", textColor: "{colors.soil-900}" }
  surface-overlay-dark: { backgroundColor: "{colors.loam-850}", textColor: "{colors.soil-150}" }
  surface-tint: { backgroundColor: "{colors.soil-200}", textColor: "{colors.soil-900}" }
  surface-tint-dark: { backgroundColor: "{colors.loam-850}", textColor: "{colors.soil-150}" }
  field: { backgroundColor: "{colors.soil-200}", textColor: "{colors.soil-900}" }
  field-dark: { backgroundColor: "{colors.loam-950}", textColor: "{colors.soil-150}" }
  text-secondary: { textColor: "{colors.soil-800}" }
  text-secondary-dark: { textColor: "{colors.soil-400}" }
  text-muted: { textColor: "{colors.soil-700}" }
  text-muted-dark: { textColor: "{colors.soil-500}" }
  text-accent: { textColor: "{colors.copper-700}" }
  text-accent-dark: { textColor: "{colors.copper-400}" }
  text-danger: { textColor: "{colors.madder-800}" }
  text-danger-dark: { textColor: "{colors.madder-300}" }
  link: { textColor: "{colors.forest-700}" }
  link-dark: { textColor: "{colors.forest-400}" }
  link-hover: { textColor: "{colors.forest-800}" }
  link-hover-dark: { textColor: "{colors.forest-300}" }
  link-visited: { textColor: "{colors.copper-800}" }
  link-visited-dark: { textColor: "{colors.copper-300}" }
  action: { backgroundColor: "{colors.forest-700}", textColor: "{colors.soil-100}" }
  action-dark: { backgroundColor: "{colors.forest-400}", textColor: "{colors.loam-950}" }
  action-hover: { backgroundColor: "{colors.forest-800}", textColor: "{colors.soil-100}" }
  action-hover-dark: { backgroundColor: "{colors.forest-300}", textColor: "{colors.loam-950}" }
  danger: { backgroundColor: "{colors.madder-700}", textColor: "{colors.soil-100}" }
  danger-dark: { backgroundColor: "{colors.madder-400}", textColor: "{colors.loam-950}" }
  danger-hover: { backgroundColor: "{colors.madder-800}", textColor: "{colors.soil-100}" }
  danger-hover-dark: { backgroundColor: "{colors.madder-300}", textColor: "{colors.loam-950}" }
  selected: { backgroundColor: "{colors.forest-100}", textColor: "{colors.forest-800}" }
  selected-dark: { backgroundColor: "{colors.forest-900}", textColor: "{colors.forest-300}" }
  control-line: { backgroundColor: "{colors.soil-600}" }
  control-line-dark: { backgroundColor: "{colors.soil-600}" }
  focus: { backgroundColor: "{colors.gold-800}" }
  focus-dark: { backgroundColor: "{colors.gold-400}" }
  state-success: { backgroundColor: "{colors.moss-700}" }
  state-success-dark: { backgroundColor: "{colors.moss-400}" }
  state-warning: { backgroundColor: "{colors.gold-800}" }
  state-warning-dark: { backgroundColor: "{colors.gold-400}" }
  state-danger: { backgroundColor: "{colors.madder-700}" }
  state-danger-dark: { backgroundColor: "{colors.madder-400}" }
  state-info: { backgroundColor: "{colors.signal-700}" }
  state-info-dark: { backgroundColor: "{colors.signal-400}" }
  stage-seed: { backgroundColor: "{colors.gold-800}" }
  stage-seed-dark: { backgroundColor: "{colors.gold-400}" }
  stage-sprout: { backgroundColor: "{colors.moss-700}" }
  stage-sprout-dark: { backgroundColor: "{colors.moss-400}" }
  stage-flowering: { backgroundColor: "{colors.forest-700}" }
  stage-flowering-dark: { backgroundColor: "{colors.forest-400}" }
  stage-tree: { backgroundColor: "{colors.teal-700}" }
  stage-tree-dark: { backgroundColor: "{colors.teal-400}" }
  capital-living: { backgroundColor: "{colors.forest-100}", textColor: "{colors.forest-800}" }
  capital-living-dark: { backgroundColor: "{colors.forest-900}", textColor: "{colors.forest-300}" }
  capital-material: { backgroundColor: "{colors.moss-100}", textColor: "{colors.moss-800}" }
  capital-material-dark: { backgroundColor: "{colors.moss-900}", textColor: "{colors.moss-300}" }
  capital-intellectual: { backgroundColor: "{colors.circuit-100}", textColor: "{colors.circuit-800}" }
  capital-intellectual-dark: { backgroundColor: "{colors.circuit-900}", textColor: "{colors.circuit-300}" }
  capital-experiential: { backgroundColor: "{colors.teal-100}", textColor: "{colors.teal-800}" }
  capital-experiential-dark: { backgroundColor: "{colors.teal-900}", textColor: "{colors.teal-300}" }
  capital-social: { backgroundColor: "{colors.copper-100}", textColor: "{colors.copper-800}" }
  capital-social-dark: { backgroundColor: "{colors.copper-900}", textColor: "{colors.copper-300}" }
  capital-financial: { backgroundColor: "{colors.amber-100}", textColor: "{colors.amber-800}" }
  capital-financial-dark: { backgroundColor: "{colors.amber-900}", textColor: "{colors.amber-300}" }
  capital-cultural: { backgroundColor: "{colors.gold-100}", textColor: "{colors.gold-800}" }
  capital-cultural-dark: { backgroundColor: "{colors.gold-900}", textColor: "{colors.gold-300}" }
  capital-spiritual: { backgroundColor: "{colors.signal-100}", textColor: "{colors.signal-800}" }
  capital-spiritual-dark: { backgroundColor: "{colors.signal-900}", textColor: "{colors.signal-300}" }
  paper: { backgroundColor: "{colors.soil-100}" }
  paper-dark: { backgroundColor: "{colors.loam-950}" }
  parchment: { backgroundColor: "{colors.soil-200}" }
  parchment-dark: { backgroundColor: "{colors.loam-900}" }
  vellum: { backgroundColor: "{colors.soil-300}" }
  vellum-dark: { backgroundColor: "{colors.loam-850}" }
  ink: { textColor: "{colors.soil-900}" }
  ink-dark: { textColor: "{colors.soil-150}" }
  ink-mid: { textColor: "{colors.soil-800}" }
  ink-mid-dark: { textColor: "{colors.soil-400}" }
  ink-dim: { textColor: "{colors.soil-700}" }
  ink-dim-dark: { textColor: "{colors.soil-500}" }
  forest: { backgroundColor: "{colors.forest-700}" }
  forest-dark: { backgroundColor: "{colors.forest-400}" }
  moss: { backgroundColor: "{colors.moss-700}" }
  moss-dark: { backgroundColor: "{colors.moss-400}" }
  circuit: { backgroundColor: "{colors.circuit-700}" }
  circuit-dark: { backgroundColor: "{colors.circuit-400}" }
  sage: { backgroundColor: "{colors.sage-700}" }
  sage-dark: { backgroundColor: "{colors.sage-400}" }
  copper: { backgroundColor: "{colors.copper-700}" }
  copper-dark: { backgroundColor: "{colors.copper-400}" }
  gold: { backgroundColor: "{colors.gold-700}" }
  gold-dark: { backgroundColor: "{colors.gold-400}" }
  amber: { backgroundColor: "{colors.amber-700}" }
  amber-dark: { backgroundColor: "{colors.amber-400}" }
  signal: { backgroundColor: "{colors.signal-700}" }
  signal-dark: { backgroundColor: "{colors.signal-400}" }
  teal: { backgroundColor: "{colors.teal-700}" }
  teal-dark: { backgroundColor: "{colors.teal-400}" }
  control: { typography: "{typography.button}", height: 48px, padding: "{spacing.4}", rounded: "{rounded.md}" }
  control-sm: { height: 44px, padding: "{spacing.3}" }
  control-lg: { height: 56px, padding: "{spacing.5}" }
  card: { padding: "{spacing.4}", rounded: "{rounded.sm}" }
  sheet: { padding: "{spacing.5}", rounded: "{rounded.lg}" }
  chip: { typography: "{typography.body-sm}", height: 44px, padding: "{spacing.3}", rounded: "{rounded.sm}" }
  tag: { typography: "{typography.body-sm}", height: 28px, padding: "{spacing.2}", rounded: "{rounded.sm}" }
  tile: { typography: "{typography.label-md}", size: 28px, rounded: "{rounded.sm}" }
  icon: { size: 20px }
  icon-sm: { size: 16px }
  icon-lg: { size: 24px }
---

# Regen Commons design system

This file is the single source for Regen Commons design tokens and the reasoning behind them. Coding agents and people read it first. The generator turns the tokens above into [tokens.generated.css](packages/design-system/tokens/tokens.generated.css) and [tokens.generated.json](packages/design-system/tokens/tokens.generated.json). Never edit those by hand.

The rest of the system lives in [packages/design-system/](packages/design-system/README.md): the CSS, fonts, brand guide, voice guide, pattern library and decision log. Every value that already exists on [regencommons.com](https://regencommons.com) is carried over exactly. A test compares them with a pinned copy of the website's tokens.

## Overview

Regen Commons is a home for shared regenerative work. The interface feels like a field notebook kept by a community: warm paper, dark ink, pencil marks that become ink once someone confirms them, and small specimen labels for what each group holds and seeks.

Two layers carry that feeling.

- **The task layer is plain.** Forms, lists, navigation and errors use a neutral sans face, full sentences and solid, obvious controls. Someone on a cheap phone with a weak connection should never have to decode anything.
- **The personality layer is small and specific.** Fraunces titles, Source Serif reading text, the warm palette, the mycelium mark and the capital tiles carry the brand. They sit around tasks, never in the way of them.

The system has one memorable idea. Capital tiles show what a group needs and offers at a glance, and pencil turns to ink as a person confirms what the assistant suggested. Spend boldness there and keep everything else quiet.

## Colors

Colours are defined in three tiers. Use the highest tier that fits.

1. **Roles** are what components use: `--surface`, `--on-surface`, `--action`, `--text-muted`, `--capital-living`. They switch with the theme.
2. **Brand names** are the website's vocabulary: `--paper`, `--ink`, `--forest`, `--copper`. Website pages keep using them. New components do not.
3. **Ramp steps** are fixed values: `--soil-100`, `--forest-700`. Only role definitions reference them.

Every role in the front matter has a `-dark` twin. The twin supplies the dark theme value, and the linter checks both. The generator validates that each pair exists.

### Ramps

The website's dark theme colours are step 400 and its light theme colours are step 700, so nothing existing changes. The steps that are not in the front matter are reserved. Promote one by copying it from this table into the front matter when a role needs it. Never lighten or darken a colour on the fly.

```text ramp
soil 50:#F6F1E6 100:#EDE5D4 150:#E2DAC8 200:#E0D6C0 300:#D2C5AA 400:#B8AE96 500:#A49A87 600:#86765D 700:#5D503B 800:#4A3E2C 900:#1A1408
loam 700:#3A4330 800:#2E3626 850:#1C2118 900:#141810 950:#0D100A
forest 100:#EEF7E8 200:#D7EBCC 300:#A8CD98 400:#7AAA6A 500:#578F42 600:#3A6926 700:#1E3A10 800:#142C0B 900:#0B1D06
moss 100:#F0F9E6 200:#D9F0C7 300:#B4DD9A 400:#8EC472 500:#6EB941 600:#56922A 700:#3C6618 800:#274C10 900:#153209
circuit 100:#E9F6EF 200:#CFE8D8 300:#99C4A8 400:#6A9A78 500:#5E906D 600:#548462 700:#4A7A58 800:#32593E 900:#1E3B27
sage 100:#F1F8E8 200:#DBECCB 300:#C1DAAC 400:#A5C490 500:#97B87F 600:#88AA6F 700:#7A9A60 800:#547242 900:#334B28
copper 100:#FCF2E4 200:#F5DEC2 300:#E1AC77 400:#C47838 500:#B5662B 600:#A65721 700:#944818 800:#6E2F0F 900:#481A08
gold 100:#FCF7E3 200:#F8EABF 300:#EAC973 400:#D4A030 500:#C99121 600:#B98118 700:#A87010 800:#7A4B0A 900:#4E2D06
amber 100:#FCF2E3 200:#F8DCBF 300:#EFAD73 400:#E07830 500:#DE6A1C 600:#D05D15 700:#C05210 800:#8B340B 900:#591D07
signal 100:#E4F8FB 200:#C3EAF4 300:#8CCEE3 400:#5AACCC 500:#3D9BC3 600:#3382A6 700:#2A6888 800:#1C4965 900:#102C42
teal 100:#E6FAF5 200:#C6F1E5 300:#83D8BE 400:#48B890 500:#36A582 600:#279073 700:#1A7860 800:#115945 900:#0A3B2B
madder 100:#FCEDE8 200:#F7D5CB 300:#F0B3A2 400:#E58A72 500:#D2664C 600:#B2442F 700:#8F2A1C 800:#6E1D12 900:#4A120A
```

Soil and loam are the warm greys. Soil-600 is the only value that replaces a website value: the old `--ink-dim` failed text contrast, so the darker public values became `--ink-dim`, and soil-600 serves as the control boundary. Madder is new, added for destructive actions and errors, because the website had no error hue.

### Rules

- Text meets 4.5:1 on its rendered background. Large text and icons meet 3:1. Tests check every role pair in both themes.
- Copper hairlines (`--line`, `--line-subtle`) are decoration at about 1.3:1. Anything a person must see to use a control uses `--control-line`, which meets 3:1.
- Light theme gold, amber, circuit, teal and sage fail as small text. Use `--text-accent` or a capital pair instead of a bare hue.
- Colour never carries meaning alone. Pair it with a word, an icon, a shape or a position.
- Cards are lighter than the page in both themes, so they read as closer.

### Forms of capital

Eight forms of capital use one recipe: a pale tint with a same-hue dark word and a glyph tile. Colour only groups them. The word and glyph identify them, because several pairs look alike under colour blindness.

Use each form's framework name as its title, the plain meaning beneath, and examples in a tooltip. Compact tags use that title with the meaning in help. This places review decision 10 and DL-026; the eight names and meanings remain paired in [VOICE.md](packages/design-system/brand/VOICE.md#plain-names).

| Form and title | Glyph | Hue | Plain meaning |
|---|---|---|---|
| Living | Li | forest | Land and living things |
| Material | Ma | moss | Tools and equipment |
| Intellectual | In | circuit | Knowledge |
| Experiential | Ex | teal | Skills and know-how |
| Social | So | copper | Relationships |
| Financial | Fi | amber | Money |
| Cultural | Cu | gold | Culture and story |
| Spiritual | Sp | signal | Care and spirit |

### Themes

The theme follows the operating system by default. `data-theme="light"` or `data-theme="dark"` pins it, on the root element or on any section. The website pins dark on its root, so it looks the same as today. A theme control belongs in settings, with System, Light and Dark options. It does not sit in the page header of the app.

Tokens are generated into explicit theme blocks instead of using `light-dark()`. The website relies on RGB triplets and non-colour theme values that `light-dark()` cannot express, and these blocks also work on older phones. Generation removes the cost of repeating values.

## Typography

| Token | Size | Face and weight | Line height | Use |
|---|---|---|---|---|
| `label-sm` | 12 | Space Grotesk 600, +0.08em | 1.4 | Factual record label, sentence case |
| `label-md` | 14 | Space Grotesk 600 | 1.45 | Field labels, tile glyphs |
| `body-sm` | 14 | Space Grotesk 400 | 1.45 | Hints, meta, table cells |
| `body-md` | 16 | Space Grotesk 400 | 1.5 | Interface text, inputs |
| `title-sm` | 16 | Space Grotesk 600 | 1.4 | Row titles, small section titles |
| `button` | 16 | Space Grotesk 600 | 1.25 | Controls |
| `code` | 28 | Space Grotesk 500, +0.12em | 1.2 | The sign-in code field only |
| `reading-md` | 16 | Source Serif 4 400 | 1.55 | Card summaries |
| `reading-lg` | 18 | Source Serif 4 400 | 1.6 | Prose, assistant messages, match reasons |
| `headline-sm` | 22 | Fraunces 500 | 1.25 | Card titles and section titles |
| `headline-md` | 28 | Fraunces 400 | 1.15 | Page titles on phones |
| `headline-lg` | 36 | Fraunces 400, -0.02em | 1.1 | Empty states, page titles on wider screens |
| `headline-display` | 48 | Fraunces 300, -0.03em | 1.05 | Public hero on phones |
| `headline-hero` | 64 | Fraunces 300, -0.03em | 1 | Public hero from 768 px |

- 12 px is the floor. Nothing is smaller, including on the website when it adopts this scale.
- Each screen uses two weights in the task layer: 400 and 600. Fraunces uses its own weights in titles. Weight 300 appears only from 48 px up.
- Space Grotesk is for tasks and data. Source Serif is for reading, from 16 px up. Fraunces is for titles, never for controls.
- Buttons and labels use sentence case. No decorative labels above headings; a factual label stays only when the heading cannot carry it (DL-028).
- Prose stays within 45 to 75 characters per line (`--prose-width`). Left-align text. Centre three lines at most. Right-align numbers.
- Fonts are subset to Latin. Yoruba and Vietnamese marks fall back to the system face until [latin-ext subsets](packages/design-system/decision-log.md) are added.

## Layout

Spacing comes from one scale: 4, 8, 12, 16, 24, 32, 40, 56, 80, 112, 160 px, as `--space-1` to `--space-11`. Neighbouring steps differ by at least 25 percent, so a choice is never subtle.

- Design for 360 px first. Partners, Funding and Initiatives use card grids on wide screens, with columns at least `--card-min-width` (18 rem). Cards in a row share a height and keep actions at the bottom.
- Every page shares the logo's left edge. Only home heroes and empty states may centre; narrow tasks stay at that edge.
- Prefer container queries, so a pattern adapts to its slot. Use `--form-width`, `--prose-width`, `--list-width` and `--page-width` as limits, not percentages.
- Put more space around a group than inside it. Inside a group use `--space-2`. Between groups use `--space-5` or more.
- Page gutter is `--gutter`, 16 px at 360. Section rhythm is 56, 80 and 112 px by width.
- Controls are 48 px high. 44 px is the smallest target, for dense toolbars. A field and its paired button both use `--control-lg-height` (56 px). Keep the steps of a flow at a steady height.
- Text must survive 200 percent zoom and the largest browser text size without clipping.

## Elevation & Depth

There are five levels, tied to distance from the page. Light themes use shadows in warm ink, not black, each made of a tight dark shadow and a soft wide one. Dark themes lean on lighter surfaces, and only higher levels add shadow.

| Level | Token | Use |
|---|---|---|
| 0 | none | Rows, inline chips |
| 1 | `--shadow-1` | Resting cards |
| 2 | `--shadow-2` | Hover, sticky bars |
| 3 | `--shadow-3` | Popovers, sheets |
| 4 | `--shadow-4` | Dialogs |

Inputs use `--shadow-inset` to read as recessed. Use space or a surface step before reaching for a border, and keep hairlines under five per screen. The website's paper grain and mycelium canvas stay behind one hero region at most, never behind inputs or rows, and they stop under reduced motion.

### Motion

Motion explains what changed: pages cross-fade, cards arrive together and linked cards lift on hover. Use `--duration-fast`, `--duration-base`, `--duration-slow` and `--ease-out`. All animation and transitions stop under reduced motion. The home woven-thread backdrop is the only decorative motion and becomes still. Start a new page at the top with its heading focused; keep phone heroes short (DL-029).

## Shapes

Corners are small and consistent, in the manner of index cards.

- `--radius-sm` (2 px): cards, chips, tags, tiles, images.
- `--radius-md` (4 px): buttons and inputs.
- `--radius-lg` (8 px): sheets and dialogs.
- `--radius-full`: avatars and dots only. No pill buttons.

Border widths mean something: 1 px divides, 2 px marks selection or emphasis, 3 px is an accent edge. Dashed borders mean pencil: a value the assistant suggested that no person has confirmed. Solid means ink. The website's organic blob buttons stay on its marketing pages and never sit beside square controls.

## Components

[COMPONENTS.md](packages/design-system/COMPONENTS.md) lists every pattern with its level, status, parts and content limits. The [pattern library](packages/design-system/patterns/index.html) shows them running. CSS lives in [packages/design-system/css](packages/design-system/css/) and uses cascade layers: `tokens`, `base`, `atoms`, `molecules`, `organisms`, `templates`.

- **Buttons** rank actions. One solid primary per region, an outlined secondary, a link-style quiet action. The danger fill appears only on the confirming step of a destructive action.
- **Fields** put the label above the control, the hint between them and the error below, using an icon, words and a 2 px edge. Hints are never placeholders.
- **Cards** have one bold element, the title. Initiative, need, offer, opportunity, partner and partnership differ only in which slots they fill.
- **Proposals** show values the assistant suggested in pencil. Nothing derived is applied without a person confirming it.
- **Conversation** asks one short thing at a time. A large local Speak action comes first when available, with typing and attachments below. The card fills in beside the conversation on wide screens and follows it on phones. Build my card opens review: four public fields and derived details with Keep, Change and Remove. Confirmed corrections stay fixed across builds; Remove offers Undo. Full words remain on the device even when the public description is shortened.
- **Needs and offers** use the same Ask card, with all applicable kinds of support shown alike. Keep, Change and Remove are explicit decisions. Each list has a counter and at most five active cards; overflow stays in the source words and is named. Undo respects the same limit. Finish brings funding, a count-only Share card and the person's checked card together; unavailable feeds keep their counts unknown.
- **Local assistant choices** explain privacy before asking for a tap. A download needs an exact size, cancellation, resumption and removal. Keyword and manual entry remain usable meanwhile. An unavailable service is shown only as a labelled development example, never as a working production choice.
- **Empty states** act as a first screen: a short headline, one line of guidance, one action, and no filters.
- **Funding** keeps thematic fit apart from readiness and research priority. Visitors browse without invented fit. Program source dates, unknowns and eligibility checks remain visible. Team slots show requirements and count distinct asks and selected initiatives; private initiatives see counts only. Example coverage never establishes eligibility or changes the solo rubric.

Names describe structure, not content. `Card`, not NeedCard. Product words live in variants and pages.

## Interface Principles

UI work follows three books. Page numbers are PDF pages of the editions the team holds. The PDFs are not in this repository. The [principles folder](packages/design-system/principles/README.md) has fuller notes on how each applies here, and the [review checklist](packages/design-system/principles/ui-review-checklist.md) turns them into checks.

### How people use what we build

From *Don't Make Me Think, Revisited* by Steve Krug.

- A person should understand a screen without stopping to puzzle over it. Each unneeded question in their head is a defect (29-38).
- People scan and take the first reasonable option, so make that tap correct and backing out cheap (39-47).
- Follow conventions unless a change is clearly better. Prominence and grouping should mirror importance (48-62).
- Make choices mindless. Labels predict their destination, and options never overlap, as sign in, create account and join do (70-76).
- Cut the words, then cut them again. Delete welcome talk and any instruction the design can replace (77-80).
- Every page names itself, echoing the label that led there, and shows where the person is with more than one cue (92-113).
- Home says what this is and where to start, on one phone screen (119-130).
- People arrive with limited goodwill. Hiding things and asking for more than the task needs drains it, while saving steps and owning errors refills it (204-211).
- Persuade honestly: no pre-checked opt-ins and no half-hidden choices (231-233).
- Watch three people every month. Fix the worst problems first, and prefer removing to adding (141-172).

### How a screen shows what matters

From *Refactoring UI* by Adam Wathan and Steve Schoger.

- Start from one concrete feature, in low fidelity, before the shell (8-13).
- Pick from fixed scales for type, space, colour, shadow and radius (28-32, 70-74, 102-107, 138-151).
- Create hierarchy with weight and colour before size. Quiet competitors instead of shouting (36-47).
- Merge labels into values where the format explains them (48-52).
- Rank actions: solid, outlined, link-style (60-62).
- Begin with too much space, and put more around groups than inside them (66-69, 96-99).
- Keep prose to a readable measure, tighten line height as size grows, and left-align (114-116, 122-125, 128-131).
- Dark text on a pale tint beats white on a mid-tone. Colour never works alone (162-168).
- Lighter reads closer. Keep shadows on a few levels, and use fewer borders (172-192, 238-241).
- Treat an empty state as a first screen (234-236).

### How the system stays whole

From *Atomic Design* by Brad Frost.

- Think in five levels at once: atoms, molecules, organisms, templates and pages (41-56).
- Larger patterns include smaller ones and never copy their markup, so one fix reaches every use (66-70).
- Patterns take content as input, and variants are data changes. Show worst cases beside best cases (73-80).
- Pages test the system. Fix a failure at the lowest level that caused it (51-54, 57-58).
- Inspect patterns across a continuous range of widths (81-84).
- Keep usage notes and lineage on each pattern (84-90).
- Treat good design as more than looks: accessible, fast and resilient (107-111).
- Add a shared pattern on its second real use. Retire with notice and a named replacement (152-156).
- Name patterns by structure: blur the content to find the name (173-174).
- Run this as a living product with named owners and one code source (140-162).

### How we follow them

Run this five-minute review on any UI change, on a rendered page at 360 px and again at a wide width.

1. **Squint.** In greyscale, the primary action, the page name and the key data stand out.
2. **Pretend you just arrived.** Say what the page is, where you are and what to do next, without reading any instructions.
3. **Find the first tap.** The first plausible tap is the right one, or it is cheap to undo.
4. **Cut.** Remove one thing and half the words. If nothing is lost, keep it out.
5. **Check the tokens.** Sizes, gaps, colours, radii and shadows come from this file. Every element traces to a named pattern.
6. **Fill it badly.** Try empty, one, many, a very long name, Portuguese, an error and offline.
7. **Use the keyboard.** Tab through it, then try both themes, 200 percent text size and reduced motion.

Report the result in the handoff. The [checklist](packages/design-system/principles/ui-review-checklist.md) has the full list for larger changes.

## Voice

[VOICE.md](packages/design-system/brand/VOICE.md) owns product language: the voice, the tone map, the plain-name vocabulary and the words to avoid. Warm botanical language lives in titles, empty states and the website. Errors, consent, privacy and money always use exact, plain words.

## Do's and Don'ts

- Do use role tokens. Don't use hex values, ramp steps or brand names in component CSS.
- Do give each region one solid primary action. Don't let two solid buttons compete.
- Do follow the system theme by default. Don't hardcode a default theme or add a header toggle to the app.
- Do show pencil for anything the assistant suggested. Don't apply a derived value without confirmation.
- Do ask for an email only when it does something for the person. Don't put a wall, a modal or a pre-checked box in front of value.
- Do write labels in sentence case with plain words. Don't use tiny tracked capitals on buttons.
- Do use the capital tile and word together. Don't use colour alone to tell capitals, stages, needs or offers apart.
- Do show empty, loading, error and offline states. Don't show controls that do not work yet.
- Don't use streaks, countdowns, leaderboards or invented urgency. People come here to do shared work, not to be hooked.
- Don't copy website component CSS. It is desktop-first. Take its tokens, fonts and voice.

## Extended Tokens

The DesignMD format has no groups for fonts, motion, layers, shadows or border widths. They live in this block. The generator reads it, so they share one source with everything above. `shared` values are the same in both themes. `derived` values reference other tokens and are recalculated inside themed sections.

```text extended-tokens
shared:
  font-serif: "'Source Serif 4', 'Source Serif 4 Fallback', Georgia, serif"
  font-display: "'Fraunces', 'Fraunces Fallback', Georgia, serif"
  font-sans: "'Space Grotesk', 'Space Grotesk Fallback', system-ui, sans-serif"
  font-mono: "'Courier New', Courier, monospace"
  duration-fast: 120ms
  duration-base: 200ms
  duration-slow: 320ms
  ease-out: cubic-bezier(.25, 1, .5, 1)
  layer-sticky: 10
  layer-overlay: 100
  layer-toast: 200
  border-thin: 1px
  border-thick: 2px
  border-edge: 3px
light:
  shadow-1: 0 1px 2px rgba(26, 20, 8, .18), 0 2px 4px rgba(26, 20, 8, .10)
  shadow-2: 0 1px 3px rgba(26, 20, 8, .14), 0 4px 8px rgba(26, 20, 8, .12)
  shadow-3: 0 2px 4px rgba(26, 20, 8, .08), 0 8px 16px rgba(26, 20, 8, .14)
  shadow-4: 0 4px 8px rgba(26, 20, 8, .04), 0 20px 40px rgba(26, 20, 8, .20)
  shadow-inset: inset 0 1px 2px rgba(26, 20, 8, .14)
  backdrop: rgba(26, 20, 8, .45)
  forest-glow: rgba(30, 58, 16, 0.12)
  grain-blend: multiply
  grain-opacity: 0.35
dark:
  shadow-1: 0 0 0 1px rgba(226, 218, 200, .10)
  shadow-2: 0 2px 6px rgba(0, 0, 0, .45)
  shadow-3: 0 8px 20px rgba(0, 0, 0, .50)
  shadow-4: 0 16px 48px rgba(0, 0, 0, .55)
  shadow-inset: inset 0 1px 2px rgba(0, 0, 0, .50)
  backdrop: rgba(0, 0, 0, .65)
  forest-glow: rgba(122, 170, 106, 0.10)
  grain-blend: screen
  grain-opacity: 0.12
derived:
  line: rgba(var(--copper-rgb), 0.25)
  line-subtle: rgba(var(--copper-rgb), 0.12)
rgb:
  - copper
  - forest
  - gold
  - teal
```
