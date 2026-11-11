/**
 * What Pilot knows about the CSS properties its editors write: the default
 * (shown as the placeholder when no value is set), the keywords it accepts
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
  /** Negative lengths are valid (margins), or not (width, padding). */
  negative: boolean;
}

const SIZE_KEYWORDS = ["auto", "fit-content", "min-content", "max-content", "stretch"];

export const CSS_PROPERTIES: Record<string, CssPropertyInfo> = {
  width: { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "min-width": { initial: "auto", keywords: SIZE_KEYWORDS, negative: false },
  "max-width": { initial: "none", keywords: ["none", ...SIZE_KEYWORDS.filter((k) => k !== "auto")], negative: false },
  ...sides((side) => `padding-${side}`, { initial: "0", keywords: [], negative: false }),
  ...sides((side) => `margin-${side}`, { initial: "0", keywords: ["auto"], negative: true }),
  ...sides((side) => `border-${side}-width`, { initial: "medium", keywords: ["thin", "medium", "thick"], negative: false }),
};

/** The same info for the four sides of a box property. */
function sides(name: (side: string) => string, info: CssPropertyInfo): Record<string, CssPropertyInfo> {
  return Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [name(side), info]));
}

/** The property's info; unknown properties get a permissive fallback. */
export function cssProperty(name: string): CssPropertyInfo {
  return CSS_PROPERTIES[name] ?? { initial: "", keywords: [], negative: true };
}
