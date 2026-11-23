// A record's link picture (1200 x 630), drawn like the section pictures (packages/app/scripts/share-
// images/card.html, DL-068): the mycelium on the right, seeded by the record's address so a record always
// gets the same pattern, the mark and WEAVE at the top, the record's section, name and one line about it
// on the left, and "Part of Regen Commons." with the site's address at the foot. The pattern, the mark
// and the rule are one SVG; every word is a text node the renderer draws in the given faces, never
// markup, and the lines are laid out here from the faces' own widths so the renderer does not wrap them.
import type { PictureFace, PictureFaces } from "./record-image-fonts.ts";

export const PICTURE_WIDTH = 1200;
export const PICTURE_HEIGHT = 630;

/** What a record's picture says, and the address that seeds its pattern. */
export interface RecordImageWords {
  readonly section: "funding" | "initiatives";
  /** The record's page path, such as /funding/some-fund?program=some-program. */
  readonly path: string;
  readonly title: string;
  /** One line under the title: the fund a program belongs to, or who shared an initiative. May be empty. */
  readonly subtitle: string;
}

/** A node the renderer draws: an element with its style and children, never parsed from markup. */
export interface PictureNode {
  readonly type: string;
  readonly props: { readonly style?: Readonly<Record<string, string | number>>; readonly src?: string; readonly width?: number; readonly height?: number; readonly children?: string | readonly PictureNode[] };
}

const W = PICTURE_WIDTH, H = PICTURE_HEIGHT, PAD = 80;
const INK = "#E2DAC8", INK_MID = "#B8AE96", COPPER = "#C47838", PAPER = "#0D100A";
/** The room the words have beside the pattern. */
const TEXT_WIDTH = 720;
const EYEBROW: Record<RecordImageWords["section"], string> = { funding: "FUNDING", initiatives: "INITIATIVE" };
export const SITE = "WEAVE.REGENCOMMONS.COM";
export const FOOT = "Part of Regen Commons.";

/** The words that are always drawn, so a face that lacks one of them is found before any record is. */
export const FIXED_WORDS = { label: `WEAVE${SITE}${EYEBROW.funding}${EYEBROW.initiatives}`, line: FOOT };

/**
 * A seeded generator (mulberry32), so a record's pattern never changes. The seed is the text's hash kept
 * to 32 bits at every step: summed as the section pictures do, a record's long address would pass 2^53
 * and every record would get the same pattern.
 */
export function seeded(text: string): () => number {
  let seed = [...text].reduce((sum, character) => (Math.imul(sum, 31) + character.charCodeAt(0)) >>> 0, 7);
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value: number) => Math.round(value * 10) / 10;
const COLORS = ["122,170,106", "142,196,114", "196,120,56", "72,184,144", "212,160,48"];

/** The mycelium, the mark and the foot's rule, as one SVG behind the words. */
export function pictureFrame(seedText: string): string {
  const random = seeded(seedText);
  const parts: string[] = [];
  const grow = (x: number, y: number, angle: number, length: number, depth: number, color: string): void => {
    const points = [`M${n(x)} ${n(y)}`];
    const steps = Math.max(4, Math.round(length / 14));
    const branches: [number, number, number][] = [];
    for (let step = 0; step < steps; step++) {
      angle += (random() - 0.5) * 0.5;
      x += Math.cos(angle) * 14;
      y += Math.sin(angle) * 14;
      points.push(`L${n(x)} ${n(y)}`);
      if (depth > 0 && random() < 0.18) branches.push([x, y, angle + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.6)]);
    }
    const alpha = 0.16 + depth * 0.1;
    parts.push(`<path d="${points.join("")}" fill="none" stroke="rgba(${color},${n(alpha * 100) / 100})" stroke-width="${n(0.8 + depth * 0.45)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(1.6 + depth * 0.6)}" fill="rgba(${color},${n((alpha + 0.15) * 100) / 100})"/>`);
    for (const [bx, by, ba] of branches) grow(bx, by, ba, length * 0.6, depth - 1, color);
  };
  const cx = 955, cy = 290;
  for (let root = 0; root < 11; root++) grow(cx, cy, (root / 11) * Math.PI * 2 + random() * 0.4, 150 + random() * 120, 3, COLORS[root % COLORS.length]!);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">`,
    `<stop offset="0" stop-color="${PAPER}" stop-opacity="1"/><stop offset="0.52" stop-color="${PAPER}" stop-opacity="1"/><stop offset="0.66" stop-color="${PAPER}" stop-opacity="0"/>`,
    `</linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
    ...parts,
    `<circle cx="${cx}" cy="${cy}" r="26" fill="rgba(196,120,56,0.1)"/><circle cx="${cx}" cy="${cy}" r="7" fill="#C9956B"/>`,
    // The pattern fades out behind the words.
    `<rect width="${W}" height="${H}" fill="url(#fade)"/>`,
    // The mark, as the section pictures draw it at 52 px.
    `<g transform="translate(${PAD} 72) scale(${n((52 / 48) * 1000) / 1000})">`,
    `<circle cx="24" cy="24" r="24" fill="#141810"/>`,
    `<path d="M24 24 12 11m12 13L37 11M24 24l-1 17m1-17L7 27m17-3 17 6M17 17l1-9m13 9 9 1M23 33l-8 5" fill="none" stroke="#a6b878" stroke-width="2" stroke-linecap="round"/>`,
    `<circle cx="24" cy="24" r="4" fill="#c9956b"/></g>`,
    `<rect x="${PAD}" y="${H - 118}" width="${W - PAD * 2}" height="1" fill="rgba(196,120,56,0.28)"/>`,
    `</svg>`,
  ].join("");
}

/**
 * Breaks the text into lines no wider than `width` at this size, a word at a time; a word wider than a
 * line is cut. Returns the lines, the last ending in an ellipsis when the text runs past `max` lines.
 */
export function lineBreak(face: PictureFace, text: string, size: number, width: number, max: number): { lines: string[]; cut: boolean } {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (face.width(next, size) <= width) { current = next; continue; }
    if (current) lines.push(current);
    current = word;
    while (face.width(current, size) > width && current.length > 1) {
      let fit = current.length - 1;
      while (fit > 1 && face.width(current.slice(0, fit), size) > width) fit--;
      lines.push(current.slice(0, fit));
      current = current.slice(fit);
    }
  }
  if (current) lines.push(current);
  if (lines.length <= max) return { lines, cut: false };
  const kept = lines.slice(0, max);
  const ellipsis = face.covers("…") ? "…" : "...";
  let last = kept[max - 1]!;
  while (last && face.width(`${last}${ellipsis}`, size) > width) last = last.slice(0, last.lastIndexOf(" ") > 0 ? last.lastIndexOf(" ") : last.length - 1);
  kept[max - 1] = `${last.replace(/[\s,.;:]+$/u, "")}${ellipsis}`;
  return { lines: kept, cut: true };
}

/** The title's size and lines: the largest size from 84 px down whose lines fit the room, in at most three lines. */
export function titleLines(face: PictureFace, title: string, room: number): { size: number; lines: string[] } {
  for (let size = 84; size >= 44; size -= 4) {
    const { lines, cut } = lineBreak(face, title, size, TEXT_WIDTH, 3);
    if (!cut && lines.length * size * 1.1 <= room) return { size, lines };
  }
  const size = 44;
  return { size, lines: lineBreak(face, title, size, TEXT_WIDTH, Math.max(1, Math.min(3, Math.floor(room / (size * 1.1))))).lines };
}

const text = (face: PictureFace, size: number, color: string, words: string, style: Record<string, string | number> = {}): PictureNode => ({
  type: "div",
  props: { style: { display: "flex", fontFamily: face.name, fontStyle: face.style, fontWeight: face.weight, fontSize: size, lineHeight: 1.1, color, whiteSpace: "nowrap", ...style }, children: words },
});

const at = (left: number, top: number, child: PictureNode, extra: Record<string, string | number> = {}): PictureNode => ({
  type: "div", props: { style: { position: "absolute", left, top, display: "flex", ...extra }, children: [child] },
});

/** Whether the faces have every character of the record's words, so drawing them needs nothing fetched. */
export const drawable = (faces: PictureFaces, words: RecordImageWords): boolean =>
  faces.title.covers(words.title) && faces.line.covers(words.subtitle);

/** The picture as nodes for the renderer: the frame, then each word in its place. */
export function recordImageNodes(faces: PictureFaces, words: RecordImageWords): PictureNode {
  const top = 212, bottom = H - 118 - 34;
  const subtitle = words.subtitle ? lineBreak(faces.line, words.subtitle, 28, TEXT_WIDTH, 1).lines[0]! : "";
  const title = titleLines(faces.title, words.title, bottom - top - (subtitle ? 58 : 0));
  const frame = Buffer.from(pictureFrame(words.path)).toString("base64");
  const children: PictureNode[] = [
    { type: "img", props: { src: `data:image/svg+xml;base64,${frame}`, width: W, height: H, style: { position: "absolute", left: 0, top: 0 } } },
    at(PAD + 70, 88, text(faces.label, 17, INK, "WEAVE", { letterSpacing: 5.4 })),
    at(PAD, 166, text(faces.label, 16, COPPER, EYEBROW[words.section], { letterSpacing: 3.5 })),
    at(PAD, top, {
      type: "div",
      props: { style: { display: "flex", flexDirection: "column" }, children: title.lines.map((line) => text(faces.title, title.size, INK, line)) },
    }),
    ...(subtitle ? [at(PAD, top + title.lines.length * title.size * 1.1 + 22, text(faces.line, 28, INK_MID, subtitle))] : []),
    at(PAD, H - 92, text(faces.line, 26, INK_MID, FOOT)),
    at(0, H - 84, text(faces.label, 16, COPPER, SITE, { letterSpacing: 3.5 }), { width: W - PAD, justifyContent: "flex-end" }),
  ];
  return { type: "div", props: { style: { display: "flex", position: "relative", width: W, height: H, background: PAPER }, children } };
}
