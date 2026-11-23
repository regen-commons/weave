// The faces a record's picture is drawn in, read from the repository's own files (assets/record-image,
// written from the design system's fonts by scripts/record-image-fonts.swift), never fetched. Each face
// says which characters it has and how wide a line of them is, so the picture lays out its own lines and
// draws only what its faces have: the renderer would otherwise fetch a missing character's font from
// Google at run time.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** One face: its data for the renderer, and what it can draw and how wide. */
export interface PictureFace {
  readonly name: string;
  readonly style: "normal" | "italic";
  readonly weight: 300 | 400;
  readonly data: Buffer;
  /** Whether the face has every character of the text. */
  covers(text: string): boolean;
  /** The text's width at this size, in pixels, from the face's own advances (kerning aside). */
  width(text: string, size: number): number;
}

/** The three faces: the title's, the labels' and the line under the title's. */
export interface PictureFaces {
  readonly title: PictureFace;
  readonly label: PictureFace;
  readonly line: PictureFace;
}

/** The files, at addresses fixed in the code, so the bundler ships them with the function. */
const FILES = {
  title: new URL("../assets/record-image/fraunces-italic-latin.ttf", import.meta.url),
  label: new URL("../assets/record-image/space-grotesk-latin.ttf", import.meta.url),
  line: new URL("../assets/record-image/source-serif-4-italic-latin.ttf", import.meta.url),
};

const fail = (why: string): never => { throw Error(`record_image_font: ${why}`); };

/** Each character the font maps, to its glyph, from its Unicode cmap (format 12, or 4). */
function characterMap(font: Buffer, cmap: number): Map<number, number> {
  const glyphs = new Map<number, number>();
  const count = font.readUInt16BE(cmap + 2);
  let format4: number | undefined, format12: number | undefined;
  for (let index = 0; index < count; index++) {
    const record = cmap + 4 + index * 8;
    const platform = font.readUInt16BE(record), encoding = font.readUInt16BE(record + 2);
    const table = cmap + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(table);
    if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) format12 ??= table;
    if (format === 4 && (platform === 0 || (platform === 3 && encoding === 1))) format4 ??= table;
  }
  if (format12 !== undefined) {
    const groups = font.readUInt32BE(format12 + 12);
    for (let group = 0; group < groups; group++) {
      const at = format12 + 16 + group * 12;
      const start = font.readUInt32BE(at), end = font.readUInt32BE(at + 4), first = font.readUInt32BE(at + 8);
      for (let code = start; code <= end; code++) glyphs.set(code, first + code - start);
    }
    return glyphs;
  }
  if (format4 === undefined) return fail("no Unicode cmap");
  const segments = font.readUInt16BE(format4 + 6) / 2;
  const ends = format4 + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment++) {
    const start = font.readUInt16BE(starts + segment * 2), end = font.readUInt16BE(ends + segment * 2);
    const delta = font.readInt16BE(deltas + segment * 2), range = font.readUInt16BE(ranges + segment * 2);
    for (let code = start; code <= end && code !== 0xffff; code++) {
      const glyph = range === 0 ? (code + delta) & 0xffff : font.readUInt16BE(ranges + segment * 2 + range + (code - start) * 2);
      if (glyph !== 0) glyphs.set(code, range === 0 ? glyph : (glyph + delta) & 0xffff);
    }
  }
  return glyphs;
}

/** Reads a TrueType file's character map and advances into a face. */
export function pictureFace(data: Buffer, name: string, style: PictureFace["style"], weight: PictureFace["weight"]): PictureFace {
  if (data.readUInt32BE(0) !== 0x0001_0000) fail(`${name} is not TrueType`);
  const tables = new Map<string, number>();
  for (let index = 0; index < data.readUInt16BE(4); index++) {
    const record = 12 + index * 16;
    tables.set(data.toString("latin1", record, record + 4), data.readUInt32BE(record + 8));
  }
  const table = (tag: string) => tables.get(tag) ?? fail(`${name} has no ${tag}`);
  const glyphs = characterMap(data, table("cmap"));
  const unitsPerEm = data.readUInt16BE(table("head") + 18);
  const metrics = data.readUInt16BE(table("hhea") + 34), hmtx = table("hmtx");
  const advance = (glyph: number) => data.readUInt16BE(hmtx + Math.min(glyph, metrics - 1) * 4);
  return {
    name, style, weight, data,
    covers: (text) => [...text].every((character) => glyphs.has(character.codePointAt(0)!)),
    width: (text, size) => [...text].reduce((sum, character) => sum + advance(glyphs.get(character.codePointAt(0)!) ?? 0), 0) / unitsPerEm * size,
  };
}

let loading: Promise<PictureFaces> | undefined;

/** The three faces, read once per instance. */
export function pictureFaces(): Promise<PictureFaces> {
  loading ??= (async () => {
    const [title, label, line] = await Promise.all([FILES.title, FILES.label, FILES.line].map((file) => readFile(fileURLToPath(file))));
    return {
      title: pictureFace(title!, "Fraunces", "italic", 400),
      label: pictureFace(label!, "Space Grotesk", "normal", 300),
      line: pictureFace(line!, "Source Serif 4", "italic", 400),
    };
  })().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
