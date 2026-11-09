#!/usr/bin/env node
// Generates the design tokens from DESIGN.md. Run with --check to fail when the output is stale.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const DESIGN_PATH = join(ROOT, "DESIGN.md");
export const CSS_PATH = join(ROOT, "packages/design-system/tokens/tokens.generated.css");
export const JSON_PATH = join(ROOT, "packages/design-system/tokens/tokens.generated.json");

const DARK_SUFFIX = "-dark";
const FONT_ROLES = { "Space Grotesk": "font-sans", "Source Serif 4": "font-serif", Fraunces: "font-display" };
const SIZE_PROPERTIES = { typography: "font", height: "height", width: "width", size: "size", padding: "padding", rounded: "radius" };

export function readDesign(source) {
  const front = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!front) throw new Error("DESIGN.md must start with YAML front matter.");
  const extended = /```text extended-tokens\n([\s\S]*?)```/.exec(source);
  if (!extended) throw new Error("DESIGN.md must contain a text extended-tokens block.");
  return { design: parse(front[1]), extended: parse(extended[1]) };
}

/** Parses the ramp table in the Colors section, so tests can hold front matter values to it. */
export function readRamps(source) {
  const block = /```text ramp\n([\s\S]*?)```/.exec(source);
  if (!block) throw new Error("DESIGN.md must contain a text ramp block.");
  const ramps = {};
  for (const line of block[1].trim().split("\n")) {
    const [hue, ...steps] = line.trim().split(/\s+/);
    for (const step of steps) {
      const [level, hex] = step.split(":");
      ramps[`${hue}-${level}`] = hex;
    }
  }
  return ramps;
}

const toRem = (value) => {
  const match = /^(-?\d*\.?\d+)px$/.exec(String(value));
  return match ? `${Number(match[1]) / 16}rem` : String(value);
};

const referencePath = (value) => {
  const match = /^\{([a-z]+)\.([\w-]+)\}$/.exec(String(value));
  return match ? { group: match[1], key: match[2] } : null;
};

const hexToTriplet = (hex) => {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)).join(", ");
};

function splitComponents(components) {
  const base = {};
  const dark = {};
  for (const [name, entry] of Object.entries(components)) {
    if (name.endsWith(DARK_SUFFIX)) dark[name.slice(0, -DARK_SUFFIX.length)] = entry;
    else base[name] = entry;
  }
  for (const [name, entry] of Object.entries(base)) {
    const coloured = entry.backgroundColor || entry.textColor;
    if (coloured && !dark[name]) throw new Error(`components.${name} has colours but no ${name}${DARK_SUFFIX} twin.`);
    if (!coloured && dark[name]) throw new Error(`components.${name}${DARK_SUFFIX} has no colours to switch.`);
  }
  for (const name of Object.keys(dark)) {
    if (!base[name]) throw new Error(`components.${name}${DARK_SUFFIX} has no light entry.`);
    if (Boolean(base[name].backgroundColor) !== Boolean(dark[name].backgroundColor) || Boolean(base[name].textColor) !== Boolean(dark[name].textColor))
      throw new Error(`components.${name} and its dark twin must define the same colours.`);
  }
  return { base, dark };
}

function colourRoles(entries, colors) {
  const custom = {};
  const hex = {};
  const stepOf = (value, name) => {
    const ref = referencePath(value);
    if (!ref || ref.group !== "colors" || !colors[ref.key]) throw new Error(`components.${name} must reference a defined colour, got ${value}.`);
    return ref.key;
  };
  for (const [name, entry] of Object.entries(entries)) {
    const { backgroundColor: bg, textColor: fg } = entry;
    if (bg && fg) {
      custom[name] = `var(--${stepOf(bg, name)})`;
      custom[`on-${name}`] = `var(--${stepOf(fg, name)})`;
      hex[name] = colors[stepOf(bg, name)];
      hex[`on-${name}`] = colors[stepOf(fg, name)];
    } else if (bg || fg) {
      custom[name] = `var(--${stepOf(bg || fg, name)})`;
      hex[name] = colors[stepOf(bg || fg, name)];
    }
  }
  return { custom, hex };
}

function sizeTokens(entries, spacing) {
  const out = {};
  const resolve = (value, name, property) => {
    const ref = referencePath(value);
    if (!ref) return toRem(value);
    if (ref.group === "typography") return `var(--type-${ref.key})`;
    if (ref.group === "rounded") return `var(--radius-${ref.key})`;
    if (ref.group === "spacing") {
      if (spacing[ref.key] === undefined) throw new Error(`components.${name}.${property} references a missing spacing step.`);
      return `var(--${spaceName(ref.key)})`;
    }
    throw new Error(`components.${name}.${property} cannot reference ${value}.`);
  };
  for (const [name, entry] of Object.entries(entries)) {
    for (const [property, suffix] of Object.entries(SIZE_PROPERTIES)) {
      if (entry[property] !== undefined) out[`${name}-${suffix}`] = resolve(entry[property], name, property);
    }
  }
  return out;
}

const spaceName = (key) => (/^\d+$/.test(key) ? `space-${key}` : key);

function typeTokens(typography) {
  const out = {};
  for (const [name, type] of Object.entries(typography)) {
    const role = FONT_ROLES[type.fontFamily];
    if (!role) throw new Error(`typography.${name} uses an unknown family: ${type.fontFamily}.`);
    const size = toRem(type.fontSize);
    out[`size-${name}`] = size;
    out[`type-${name}`] = `${type.fontWeight} ${size}/${type.lineHeight} var(--${role})`;
    if (type.letterSpacing) out[`type-${name}-tracking`] = type.letterSpacing;
  }
  return out;
}

const declarations = (tokens, indent = "  ") =>
  Object.entries(tokens)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join("\n");

export function buildTokens(source) {
  const { design, extended } = readDesign(source);
  const ramp = Object.fromEntries(Object.entries(design.colors).filter(([, value]) => !referencePath(value)));
  const { base, dark } = splitComponents(design.components);
  const light = colourRoles(base, ramp);
  const darkRoles = colourRoles(dark, ramp);
  const sizes = sizeTokens(base, design.spacing);
  const type = typeTokens(design.typography);
  const spacing = Object.fromEntries(Object.entries(design.spacing).map(([key, value]) => [spaceName(key), toRem(value)]));
  const radii = Object.fromEntries(Object.entries(design.rounded).map(([key, value]) => [`radius-${key}`, toRem(value)]));

  const triplets = (hex) => Object.fromEntries(extended.rgb.map((name) => {
    if (!hex[name]) throw new Error(`extended rgb names an unknown role: ${name}.`);
    return [`${name}-rgb`, hexToTriplet(hex[name])];
  }));

  const lightBlock = { ...light.custom, ...triplets(light.hex), ...extended.light };
  const darkBlock = { ...darkRoles.custom, ...triplets(darkRoles.hex), ...extended.dark };
  const missing = Object.keys(lightBlock).filter((name) => !(name in darkBlock));
  if (missing.length) throw new Error(`Tokens missing a dark value: ${missing.join(", ")}.`);

  const css = `/* Generated from DESIGN.md by packages/design-system/scripts/generate-tokens.mjs. Edit DESIGN.md, then run: bun run design:tokens */
:root {
  color-scheme: light dark;

  /* Ramp steps. Only role definitions below use these. */
${declarations(ramp)}

  /* Type */
${declarations(type)}

  /* Space and width */
${declarations(spacing)}

  /* Radius */
${declarations(radii)}

  /* Fonts, motion, layers, borders */
${declarations(extended.shared)}

  /* Component sizes */
${declarations(sizes)}
}

/* Light roles: the default, and any section pinned to light. */
:root,
[data-theme="light"] {
${declarations(lightBlock)}
}

[data-theme="light"] {
  color-scheme: light;
}

/* Dark roles, when pinned. */
[data-theme="dark"] {
  color-scheme: dark;
${declarations(darkBlock)}
}

/* Dark roles, when the system asks and nothing pins light. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${declarations(darkBlock, "    ")}
  }
}

/* Values built from other tokens, recalculated inside themed sections. */
:root,
[data-theme] {
${declarations(extended.derived)}
}
`;

  const json = `${JSON.stringify({
    source: "DESIGN.md",
    name: design.name,
    ramp,
    themes: {
      light: { ...light.hex, ...triplets(light.hex), ...extended.light },
      dark: { ...darkRoles.hex, ...triplets(darkRoles.hex), ...extended.dark },
    },
    derived: extended.derived,
    typography: design.typography,
    spacing,
    radii,
    shared: extended.shared,
    sizes,
  }, null, 2)}\n`;

  return { css, json };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { css, json } = buildTokens(readFileSync(DESIGN_PATH, "utf8"));
  if (process.argv.includes("--check")) {
    const stale = [[CSS_PATH, css], [JSON_PATH, json]].filter(([path, expected]) => {
      try {
        return readFileSync(path, "utf8") !== expected;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(`Design tokens are stale. Run: bun run design:tokens\n${stale.map(([path]) => path).join("\n")}`);
      process.exit(1);
    }
    console.log("Design tokens are current.");
  } else {
    mkdirSync(dirname(CSS_PATH), { recursive: true });
    writeFileSync(CSS_PATH, css);
    writeFileSync(JSON_PATH, json);
    console.log("Design tokens written.");
  }
}
