import { createContext, useContext } from "react";

/**
 * The heading level a record's sections start at. In a sheet they sit under its title, an `h2`, so they
 * are `h3`; on a record's own page they sit under its `h1`, so they are `h2`. Anywhere else a section
 * keeps the `h3` it always had.
 */
export type SectionLevel = 2 | 3;
export const SectionLevelContext = createContext<SectionLevel>(3);

export type SectionTag = "h2" | "h3" | "h4" | "h5";

/** The tag for a heading `depth` levels inside sections that start at `level`. */
export const sectionTag = (level: SectionLevel, depth = 0): SectionTag => `h${Math.min(level + depth, 5)}` as SectionTag;

/** The tag for a heading `depth` levels inside the record's sections it is drawn in. */
export const useSectionTag = (depth = 0): SectionTag => sectionTag(useContext(SectionLevelContext), depth);
