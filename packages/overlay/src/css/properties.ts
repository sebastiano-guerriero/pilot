/**
 * What Pilot knows about the CSS properties its editors write: the default
 * (its initial value; not shown, fields show a dash when unset), the keywords it accepts
 * beyond lengths, and whether negative lengths are valid. Add an entry when an
 * editor starts writing a new property.
 */

/**
 * Length units Pilot accepts, most common first (the order a unit picker
 * would show them in).
 */
export const LENGTH_UNITS = [
  "px",
  "%",
  "em",
  "rem",
  "ch",
  "lh",
  "vw",
  "vh",
  "svw",
  "svh",
  "lvw",
  "lvh",
  "dvw",
  "dvh",
  "vmin",
  "vmax",
  "rlh",
  "ex",
  "cqw",
  "cqh",
  "cqi",
  "cqb",
  "cqmin",
  "cqmax",
  "cm",
  "mm",
  "in",
  "pt",
  "pc",
] as const;

export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** Keywords every property accepts. */
export const GLOBAL_KEYWORDS = ["inherit", "initial", "unset", "revert", "revert-layer"] as const;

export interface CssPropertyInfo {
  /** CSS's initial value, e.g. "auto": shown dimmed while no value is set. */
  initial: string;
  /** Keywords accepted besides lengths (global keywords are always accepted). */
  keywords: string[];
  /** Negative values are valid (margins, order, grid lines), or not (width, padding). */
  negative: boolean;
  /**
   * What the value is (css/values.ts parses, shows and steps each kind):
   * - "length" (the default): `120` is px, units, math (width, padding…);
   * - "integer": a whole number, no unit (order);
   * - "number": a number, no unit, decimals allowed (flex-grow, flex-shrink);
   * - "line-height": a bare number stays unitless (`1.5`); lengths and
   *   percentages as usual. Unitless values step by tenths.
   * - "font-family": a list of font names, as typed (case kept). Not stepped.
   * - "grid-line": a line number (not 0), `span 2`, or `auto` (grid-column-start/end);
   * - "grid-span": how many columns an item spans, for the grid-column
   *   shorthand: `3` writes `span 3 / span 3` (Tailwind's col-span-3), `full`
   *   writes `1 / -1` (first line to last). Shown back as `3` and `full`.
   * - "ratio": a width / height ratio (aspect-ratio): `16/9`, `16 / 9` or
   *   `16:9` write `16 / 9`; one number (`1.5`) is that ratio to 1. Not stepped.
   */
  kind?: "length" | "integer" | "number" | "line-height" | "font-family" | "grid-line" | "grid-span" | "ratio";
}

const SIZE_KEYWORDS = ["auto", "fit-content", "min-content", "max-content", "stretch"];

/**
 * The display values Pilot offers, in menu order. Grid shows the grid rows
 * (columns, gap) in the display editor.
 */
export const DISPLAY_VALUES = [
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "contents",
  "none",
] as const;

/** The justify-content values Pilot offers, in menu order (each has an icon). */
export const JUSTIFY_CONTENT_VALUES = ["start", "end", "center", "space-between", "space-around", "space-evenly"] as const;

/** The align-items values Pilot offers, in menu order (each has an icon). */
export const ALIGN_ITEMS_VALUES = ["start", "center", "end", "stretch", "baseline"] as const;

/** flex-direction's options, in menu order. */
export const FLEX_DIRECTION_VALUES = ["row", "row-reverse", "column", "column-reverse"] as const;

/** flex-wrap's options, in menu order. */
export const FLEX_WRAP_VALUES = ["nowrap", "wrap", "wrap-reverse"] as const;

/** position's options, in menu order. */
export const POSITION_VALUES = ["static", "relative", "absolute", "fixed", "sticky"] as const;

/** font-style's options, in menu order. */
export const FONT_STYLE_VALUES = ["normal", "italic", "oblique"] as const;

/** The font weights the select offers, thin to black. */
export const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;

/** visibility's options, in menu order. */
export const VISIBILITY_VALUES = ["visible", "hidden", "collapse"] as const;

export const CSS_PROPERTIES: Record<string, CssPropertyInfo> = {
  display: { initial: "inline", keywords: [...DISPLAY_VALUES], negative: false },
  "grid-template-columns": { initial: "none", keywords: ["none"], negative: false },
  gap: { initial: "normal", keywords: ["normal"], negative: false },
  "row-gap": { initial: "normal", keywords: ["normal"], negative: false },
  "column-gap": { initial: "normal", keywords: ["normal"], negative: false },
  "justify-content": { initial: "normal", keywords: ["normal", ...JUSTIFY_CONTENT_VALUES], negative: false },
  "align-items": { initial: "normal", keywords: ["normal", ...ALIGN_ITEMS_VALUES], negative: false },
  "flex-direction": { initial: "row", keywords: [...FLEX_DIRECTION_VALUES], negative: false },
  "flex-wrap": { initial: "nowrap", keywords: [...FLEX_WRAP_VALUES], negative: false },
  order: { initial: "0", keywords: [], negative: true, kind: "integer" },
  "flex-grow": { initial: "0", keywords: [], negative: false, kind: "number" },
  "flex-shrink": { initial: "1", keywords: [], negative: false, kind: "number" },
  "flex-basis": { initial: "auto", keywords: ["content", ...SIZE_KEYWORDS], negative: false },
  "grid-column": { initial: "auto", keywords: ["auto"], negative: false, kind: "grid-span" },
  "grid-column-start": { initial: "auto", keywords: ["auto"], negative: true, kind: "grid-line" },
  "grid-column-end": { initial: "auto", keywords: ["auto"], negative: true, kind: "grid-line" },
  width: { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "min-width": { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "max-width": { initial: "none", keywords: ["none", ...SIZE_KEYWORDS.filter((k) => k !== "auto")], negative: false },
  height: { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "min-height": { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "max-height": { initial: "none", keywords: ["none", ...SIZE_KEYWORDS.filter((k) => k !== "auto")], negative: false },
  "aspect-ratio": { initial: "auto", keywords: ["auto"], negative: false, kind: "ratio" },
  ...sides((side) => `padding-${side}`, { initial: "0", keywords: [], negative: false }),
  ...sides((side) => `margin-${side}`, { initial: "0", keywords: ["auto"], negative: true }),
  position: { initial: "static", keywords: [...POSITION_VALUES], negative: false },
  "z-index": { initial: "auto", keywords: ["auto"], negative: true, kind: "integer" },
  visibility: { initial: "visible", keywords: [...VISIBILITY_VALUES], negative: false },
  "border-radius": { initial: "0", keywords: [], negative: false },
  "font-family": { initial: "", keywords: [], negative: false, kind: "font-family" },
  "font-size": {
    initial: "medium",
    keywords: ["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large", "smaller", "larger"],
    negative: false,
  },
  "font-style": { initial: "normal", keywords: [...FONT_STYLE_VALUES], negative: false },
  "font-weight": { initial: "normal", keywords: ["normal", "bold", "bolder", "lighter"], negative: false, kind: "number" },
  "line-height": { initial: "normal", keywords: ["normal"], negative: false, kind: "line-height" },
  "letter-spacing": { initial: "normal", keywords: ["normal"], negative: true },
  // inset's sides: the offsets of a positioned element.
  ...sides((side) => side, { initial: "auto", keywords: ["auto"], negative: true }),
};

/** The same info for the four sides of a box property. */
function sides(name: (side: string) => string, info: CssPropertyInfo): Record<string, CssPropertyInfo> {
  return Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [name(side), info]));
}

/** The property's info; unknown properties get a permissive fallback. */
export function cssProperty(name: string): CssPropertyInfo {
  return CSS_PROPERTIES[name] ?? { initial: "", keywords: [], negative: true };
}
