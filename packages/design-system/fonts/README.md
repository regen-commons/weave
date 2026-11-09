# Fonts

These are unmodified Latin WOFF2 faces from Google Fonts, copied from `regen-commons/website` at commit `34aca0c`. Each family is under the SIL Open Font License. The license files sit beside the fonts.

| Family | Files | Used for |
|---|---|---|
| Fraunces | `fraunces-latin.woff2`, `fraunces-italic-latin.woff2` | Titles |
| Source Serif 4 | `source-serif-4-latin.woff2`, `source-serif-4-italic-latin.woff2` | Reading text |
| Space Grotesk | `space-grotesk-latin.woff2` | Interface text and data |

[fonts.css](fonts.css) owns the face declarations and the metric-matched Georgia and Arial fallbacks. `font-display: optional` keeps text stable on slow first visits. A person may see the fallback for one page load, and the brand face after that. Preload the faces used above the fold.

Characters outside the Latin subset, such as the dotted vowels in Yoruba, fall back to the system face. [DL-009](../decision-log.md) tracks adding Latin Extended subsets.
