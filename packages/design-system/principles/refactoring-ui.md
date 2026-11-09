# Refactoring UI in this product

This book supplies the tactics behind our scales and screens. [DESIGN.md](../../../DESIGN.md) holds the resulting values.

## Starting

- **Start from a real feature,** such as the need form, not the app shell (8-10). Stay in low fidelity and greyscale until the hierarchy works (12-13).
- **Do not build what cannot ship yet.** A microphone button stays hidden until voice works (18-19).
- **Personality comes from typeface, colour, corner radius and wording** (20-26). Ours is an elegant serif, an earth-and-gold palette, small corners and warm second-person copy. A neutral sans carries the tasks.
- **Pick from fixed scales** for type, space, shadow, radius and colour, and test a guess against its neighbours (28-32).

## Hierarchy

- **Decide what matters on each screen and quiet the rest** (36-37, 46-47). Use weight and colour before size (38-39). Each screen gets two weights and three text colours (40-41).
- **Soften labels, or remove them.** "3 needs, 2 offers" beats "Needs: 3". A fact with its unit beats a label and a value (48-52).
- **Heading tags follow structure and sizes follow hierarchy.** Section titles in an app are small (54-55).
- **Rank actions:** solid primary, outlined secondary, link-style tertiary. Reserve the danger fill for the confirming step (60-62).
- **On coloured surfaces,** pick a same-hue secondary text, not grey or opacity (42-44).

## Space and layout

- **Start with too much space, then remove it** (66-69). Density is a deliberate choice, tighter on the steward desk.
- **Take every gap from the scale,** with neighbours at least 25 percent apart (70-74).
- **Give elements only the width they need.** Design the phone first and add columns instead of stretching (76-82). Prefer fixed limits to percentage columns (84-90).
- **Sizes do not scale in proportion.** Large type shrinks faster than small type. Button padding need not follow font size (92-95).
- **Put more space around a group than inside it** (96-99). A label sits 8 px above its field, and fields sit 24 px apart.

## Text

- **Hand-pick the type scale** (102-107). Use neutral sans for interface text and families with many weights (108-112).
- **Keep prose to 45 to 75 characters** (114-116), left-aligned (128-131). Line height grows with line length and shrinks with size (122-125).
- **Align mixed sizes on the baseline** (118-120). Right-align numbers (130).
- **Adjust tracking only to tighten large headlines or loosen capitals** (132-134).
- **In link-heavy screens,** mark links with weight or shape, not only colour (126-127).

## Colour

- **Plan ramps in advance:** warm greys, a primary and accents, each with fixed steps. Never lighten on the fly (138-151). Saturation rises toward both ends of a ramp (152-157).
- **Dark text on a pale tint beats white on a mid-tone** (162-165). This is the capital tag recipe.
- **Colour never carries meaning alone.** Add a word or an icon (166-168).

## Depth

- **Lighter reads closer and darker reads recessed.** Cards are lighter than the page, and inputs are darker (190-192, 177-178).
- **Keep about five shadow levels,** tied to distance from the page, each made of a tight shadow and a soft one (180-189).
- **Use fewer borders.** Space, a fill difference or a shadow often work better (238-241). Faint borders get thicker before they get darker (58-59).

## Finishing

- **Treat empty states as first screens:** a headline, one line, one action, and no filters (234-236).
- **Make icons work at their size.** Enclose small ones in a shape or use them at their intended size (208-213). Crop images to fixed ratios with a faint inner outline (214-217). Keep text over images readable at its worst pixel (202-206).
- **Rethink stock components:** selectable cards instead of bare radios, merged table cells instead of many columns (242-246).
- **Decorate sparingly.** Grain and canvas stay away from anything people read closely (228-232).

## Where we differ from the website

The website uses tiny tracked capitals, hairlines everywhere, airy 1.88 line height and one button style. This book argues against all of them. The website can adopt the changes gradually. See the [website dialect](../dialects/website.md).
