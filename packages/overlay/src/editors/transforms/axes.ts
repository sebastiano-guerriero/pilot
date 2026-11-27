import { closeParens, parseValue } from "../../css/values.ts";
import { splitTopLevel } from "../../dom/declared.ts";

/**
 * translate and scale, as one value (the property: `10px 20px`, `1.5`,
 * `none`) or split into their axes, each its own entry so it can change on
 * its own at a width or in a state (hover: only Y). As rotate's, the axes
 * are variables (`--pilot-translate-x`); unlike rotate's, the property itself
 * combines them, since it takes all three (Tailwind's way:
 * `translate: var(--tw-translate-x) var(--tw-translate-y)`). An axis Pilot
 * doesn't set falls back to the page's own (Tailwind's `--tw-translate-y`,
 * a plain `0 8px`'s 8px), so editing X keeps the page's Y.
 */

export const AXES = ["x", "y", "z"] as const;
export type Axis = (typeof AXES)[number];

export type TransformProperty = "translate" | "scale";

/** An axis's variable: `--pilot-translate-x`. */
export const axisVar = (property: TransformProperty, axis: Axis) => `--pilot-${property}-${axis}`;

/** Whether a value is the one the axes write (so it isn't the page's). */
export const isAxesValue = (property: TransformProperty, value: string) => value.includes(`--pilot-${property}-`);

/** What an axis is when nothing sets it: no move, no scaling. */
const NEUTRAL: Record<TransformProperty, string> = { translate: "0px", scale: "1" };

/**
 * The page's value of `property` split into its axes (what each falls back
 * to): `translate: 8px` is 8px 0 0; `scale: 1.5` is 1.5 on X and Y, 1 on Z;
 * `none` or nothing, the neutral values.
 */
export function pageAxes(property: TransformProperty, pageValue: string): Record<Axis, string> {
  const value = pageValue.trim();
  const parts = value && value !== "none" ? splitTopLevel(value, " ").map((p) => p.trim()).filter(Boolean) : [];
  const neutral = NEUTRAL[property];
  const x = parts[0] ?? neutral;
  // One part: translate moves on X only; scale scales X and Y alike.
  const y = parts[1] ?? (property === "scale" && parts.length === 1 ? x : neutral);
  return { x, y, z: parts[2] ?? neutral };
}

/**
 * The value the axes write: each axis's variable, falling back to the
 * page's own for it. Once written, it's kept as it is (its fallbacks are the
 * page's, read the first time).
 */
export function axesValue(property: TransformProperty, current: string, axes: readonly Axis[] = AXES): string {
  if (isAxesValue(property, current)) return current;
  const page = pageAxes(property, current);
  // An axis without a field (scale's Z) keeps the page's value as it is; left out when it's the neutral one.
  const parts = AXES.map((a) => (axes.includes(a) ? `var(${axisVar(property, a)}, ${page[a]})` : page[a]));
  if (!axes.includes("z") && page.z === NEUTRAL[property]) parts.pop();
  return parts.join(" ");
}

/**
 * What's typed in the one-value field → a value of `property`, or null: up
 * to three parts, each an axis's (a bare number is px for translate, a
 * factor for scale), or `none`; checked by the browser.
 */
export function parseTransform(property: TransformProperty, text: string): string | null {
  const t = closeParens(text.trim().replace(/\s+/g, " "));
  if (!t) return null;
  if (t.toLowerCase() === "none") return "none";
  const parts = splitTopLevel(t, " ").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 3) return null;
  const parsed = parts.map((p) => parseAxis(property, p));
  if (parsed.some((p) => p === null)) return null;
  const value = parsed.join(" ");
  const supported = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(property, value);
  return supported ? value : null;
}

/** One axis's value: a length (translate; a bare number is px) or a factor (scale), the shared parser's (css/values.ts). */
export function parseAxis(property: TransformProperty, text: string): string | null {
  return parseValue(property, text);
}
