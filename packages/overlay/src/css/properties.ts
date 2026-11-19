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
   * - "percent": 0–100, shown without the % (opacity, like the color
   *   editor's): `50` or `50%` write `50%`, a fraction (`0.5`, `.25`) is
   *   that share of 100, kept within 0–100. The page's `0.5` shows as 50.
   *   Steps by whole numbers.
   * - "idents": names, comma-separated (will-change: `opacity, transform`),
   *   lowercase, joined with ", ", checked by the browser. Not stepped.
   */
  kind?:
    | "length"
    | "integer"
    | "number"
    | "line-height"
    | "font-family"
    | "grid-line"
    | "grid-span"
    | "ratio"
    | "percent"
    | "idents";
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

/** text-align's options, in menu order (each has an icon). */
export const TEXT_ALIGN_VALUES = ["left", "center", "right", "justify"] as const;

/** visibility's options, in menu order. */
export const VISIBILITY_VALUES = ["visible", "hidden", "collapse"] as const;

/** overflow's options, in menu order. */
export const OVERFLOW_VALUES = ["visible", "hidden", "clip", "scroll", "auto"] as const;

/** object-fit's options, in menu order. */
export const OBJECT_FIT_VALUES = ["fill", "contain", "cover", "none", "scale-down"] as const;

/** isolation's options, in menu order. */
export const ISOLATION_VALUES = ["auto", "isolate"] as const;

/** box-sizing's options, in menu order. */
export const BOX_SIZING_VALUES = ["border-box", "content-box"] as const;

/** overscroll-behavior's options, in menu order. */
export const OVERSCROLL_VALUES = ["auto", "contain", "none"] as const;

/** font-variant-numeric's options, in menu order (one each; a combination set another way is still shown). */
export const FONT_VARIANT_NUMERIC_VALUES = [
  "normal",
  "tabular-nums",
  "proportional-nums",
  "lining-nums",
  "oldstyle-nums",
  "slashed-zero",
  "ordinal",
  "diagonal-fractions",
  "stacked-fractions",
] as const;

/** text-overflow's options, in menu order. */
export const TEXT_OVERFLOW_VALUES = ["clip", "ellipsis"] as const;

/** text-wrap's options, in menu order. */
export const TEXT_WRAP_VALUES = ["wrap", "nowrap", "balance", "pretty"] as const;

/** white-space's options, in menu order. */
export const WHITE_SPACE_VALUES = ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"] as const;

/** The blend modes, for background-blend-mode (mix-blend-mode adds the plus- ones), in menu order. */
export const BLEND_MODE_VALUES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

/** mix-blend-mode's options, in menu order. */
export const MIX_BLEND_MODE_VALUES = [...BLEND_MODE_VALUES, "plus-darker", "plus-lighter"] as const;

/** cursor's options, in menu order. */
export const CURSOR_VALUES = [
  "auto",
  "default",
  "pointer",
  "text",
  "move",
  "grab",
  "grabbing",
  "not-allowed",
  "wait",
  "progress",
  "help",
  "crosshair",
  "zoom-in",
  "zoom-out",
  "copy",
  "alias",
  "context-menu",
  "cell",
  "vertical-text",
  "no-drop",
  "all-scroll",
  "col-resize",
  "row-resize",
  "n-resize",
  "e-resize",
  "s-resize",
  "w-resize",
  "ne-resize",
  "nw-resize",
  "se-resize",
  "sw-resize",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "none",
] as const;

/** pointer-events' options, in menu order. */
export const POINTER_EVENTS_VALUES = ["auto", "none"] as const;

/** user-select's options, in menu order. */
export const USER_SELECT_VALUES = ["auto", "text", "all", "none"] as const;

/** appearance's options, in menu order. */
export const APPEARANCE_VALUES = ["auto", "none"] as const;

/** will-change's presets, in menu order (Tailwind's; custom takes any other). */
export const WILL_CHANGE_VALUES = ["auto", "scroll-position", "contents", "transform"] as const;

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
  "object-fit": { initial: "fill", keywords: [...OBJECT_FIT_VALUES], negative: false },
  overflow: { initial: "visible", keywords: [...OVERFLOW_VALUES], negative: false },
  isolation: { initial: "auto", keywords: [...ISOLATION_VALUES], negative: false },
  ...sides((side) => `padding-${side}`, { initial: "0", keywords: [], negative: false }),
  ...sides((side) => `margin-${side}`, { initial: "0", keywords: ["auto"], negative: true }),
  position: { initial: "static", keywords: [...POSITION_VALUES], negative: false },
  "z-index": { initial: "auto", keywords: ["auto"], negative: true, kind: "integer" },
  visibility: { initial: "visible", keywords: [...VISIBILITY_VALUES], negative: false },
  "border-radius": { initial: "0", keywords: [], negative: false },
  opacity: { initial: "1", keywords: [], negative: false, kind: "percent" },
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
  "text-align": { initial: "start", keywords: ["start", "end", ...TEXT_ALIGN_VALUES], negative: false },
  // Edited by its own editor (css/colors.ts), not as a length.
  color: { initial: "canvastext", keywords: ["currentcolor", "transparent"], negative: false },
  "background-color": { initial: "transparent", keywords: ["currentcolor", "transparent"], negative: false },
  "box-sizing": { initial: "content-box", keywords: [...BOX_SIZING_VALUES], negative: false },
  "overscroll-behavior": { initial: "auto", keywords: [...OVERSCROLL_VALUES], negative: false },
  "font-variant-numeric": { initial: "normal", keywords: [...FONT_VARIANT_NUMERIC_VALUES], negative: false },
  // line-clamp, as browsers support it: with display: -webkit-box and
  // -webkit-box-orient: vertical (editors/line-clamp).
  "-webkit-line-clamp": { initial: "none", keywords: ["none"], negative: false, kind: "integer" },
  "-webkit-box-orient": { initial: "horizontal", keywords: ["horizontal", "vertical"], negative: false },
  "text-overflow": { initial: "clip", keywords: [...TEXT_OVERFLOW_VALUES], negative: false },
  "text-wrap": { initial: "wrap", keywords: [...TEXT_WRAP_VALUES], negative: false },
  "text-indent": { initial: "0", keywords: [], negative: true },
  "white-space": { initial: "normal", keywords: [...WHITE_SPACE_VALUES], negative: false },
  "mix-blend-mode": { initial: "normal", keywords: [...MIX_BLEND_MODE_VALUES], negative: false },
  "background-blend-mode": { initial: "normal", keywords: [...BLEND_MODE_VALUES], negative: false },
  cursor: { initial: "auto", keywords: [...CURSOR_VALUES], negative: false },
  "pointer-events": { initial: "auto", keywords: [...POINTER_EVENTS_VALUES], negative: false },
  "user-select": { initial: "auto", keywords: [...USER_SELECT_VALUES], negative: false },
  appearance: { initial: "none", keywords: [...APPEARANCE_VALUES], negative: false },
  "will-change": { initial: "auto", keywords: [...WILL_CHANGE_VALUES], negative: false, kind: "idents" },
  // SVG paint, edited like colors (css/colors.ts); `none` paints nothing.
  fill: { initial: "black", keywords: ["none", "currentcolor", "transparent"], negative: false },
  stroke: { initial: "none", keywords: ["none", "currentcolor", "transparent"], negative: false },
  "stroke-width": { initial: "1px", keywords: [], negative: false },
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
