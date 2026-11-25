import { closeParens } from "../../css/values.ts";
import { angleText } from "../mask/mask.ts";

/**
 * rotate, as one value (the `rotate` property: `30deg`, `x 30deg`,
 * `1 1 0 45deg`, `none`) or split into its axes, each its own entry so it
 * can change on its own at a width or in a state (hover: only X). The axes
 * can't all live in `rotate` (one axis, one angle), so, Tailwind's way, each
 * is a variable and one `transform` combines them; with one axis set, the
 * others are 0. The page's own `transform` goes first in it, so it stays.
 */

export const AXES = ["x", "y", "z"] as const;
export type Axis = (typeof AXES)[number];

/** An axis's variable: `--pilot-rotate-x`. */
export const axisVar = (axis: Axis) => `--pilot-rotate-${axis}`;

/** What the axes' `transform` adds: each axis's rotation, 0 when unset. */
const AXES_TRANSFORM = AXES.map((a) => `rotate${a.toUpperCase()}(var(${axisVar(a)}, 0deg))`).join(" ");

/** Whether a transform is the one the axes write (so it isn't the page's). */
export const isAxesTransform = (value: string) => value.includes("--pilot-rotate-");

/** The `transform` the axes write: the page's own first (`translateX(4px)`), then theirs. */
export function axesTransform(pageTransform: string): string {
  const page = pageTransform.trim();
  return page && page !== "none" && !isAxesTransform(page) ? `${page} ${AXES_TRANSFORM}` : AXES_TRANSFORM;
}

const NUMBER = /^-?\d*\.?\d+$/;

/**
 * What's typed in the one-value field → a `rotate` value, or null: a bare
 * number is degrees (`30` → `30deg`), also after an axis (`x 30` →
 * `x 30deg`) or a vector (`1 1 0 45`); `none`; checked by the browser.
 */
export function parseRotate(text: string): string | null {
  const t = closeParens(text.trim().replace(/\s+/g, " ")).toLowerCase();
  if (!t) return null;
  if (t === "none") return "none";
  const parts = t.split(" ");
  const last = parts.at(-1) as string;
  if (NUMBER.test(last)) parts[parts.length - 1] = `${Number(last)}deg`;
  const value = parts.join(" ");
  const supported = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("rotate", value);
  return supported ? value : null;
}

/** An axis's angle: a bare number is degrees; null when it isn't an angle. */
export function parseAxis(text: string): string | null {
  return angleText(closeParens(text.trim()));
}

/**
 * The value `delta` degrees on (↑/↓, the wheel, a drag): the angle at its
 * end steps, in its own unit (a turn by a hundredth); from empty, from 0deg.
 * Null when there's no angle to step (`none`, a var()).
 */
export function stepAngle(text: string, delta: number): string | null {
  const t = text.trim() || "0deg";
  const m = /^(.*?)(-?\d*\.?\d+)(deg|turn|rad|grad)?$/.exec(t);
  if (!m) return null;
  const unit = m[3] ?? "deg";
  const step = unit === "turn" || unit === "rad" ? delta / 100 : delta;
  return `${m[1]}${Math.round((Number(m[2]) + step) * 100) / 100}${unit}`;
}
