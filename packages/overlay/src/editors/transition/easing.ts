import { type Spring, springOf } from "./spring.ts";

/**
 * What an easing is, for its select and the rows under it (TransitionEditor's
 * EasingRow): a keyword, a cubic-bezier() (edited on its curve), a spring (a
 * `linear(…)` that draws one, spring.ts), or custom (anything else: steps(),
 * another linear(), a variable).
 */

/** CSS's easing keywords, in menu order. */
export const KEYWORDS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
export const BEZIER = "cubic-bezier";
export const SPRING = "spring";
export const CUSTOM = "custom";
/**
 * The easing select's options. cubic-bezier isn't one (the owner's, 2026-11-27): a curve is made by dragging the
 * graph's handles, from any keyword's, and the select then shows cubic-bezier.
 */
export const EASING_OPTIONS = [...KEYWORDS, SPRING, CUSTOM] as const;

export type Bezier = [number, number, number, number];

/** The keywords' curves (CSS's definitions): where cubic-bezier starts when picked from one. */
export const KEYWORD_CURVES: Record<(typeof KEYWORDS)[number], Bezier> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

const isKeyword = (v: string): v is (typeof KEYWORDS)[number] => (KEYWORDS as readonly string[]).includes(v);

/** A cubic-bezier()'s four numbers, or null (a variable inside, an x outside 0–1: not one Pilot edits). */
export function bezierOf(value: string): Bezier | null {
  const m = /^cubic-bezier\(([^)]*)\)$/i.exec(value.trim());
  if (!m) return null;
  return parseBezierNumbers(m[1] as string);
}

/** Four numbers typed (`0, 0, 0.58, 1`, commas or spaces): a curve, its x between 0 and 1 as CSS needs. */
export function parseBezierNumbers(text: string): Bezier | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4 || !parts.every((p) => /^-?\d*\.?\d+$/.test(p))) return null;
  const n = parts.map(Number) as Bezier;
  return n[0] < 0 || n[0] > 1 || n[2] < 0 || n[2] > 1 ? null : n;
}

/**
 * What a cubic-bezier's graph shows at least: 0 and 1 centered in the square, a quarter either side for
 * overshoot (the owner's, 2026-11-27). A handle further out brings the lines closer; nothing is cut.
 */
export const BEZIER_RANGE: [number, number] = [-0.25, 1.25];

const round2 = (n: number) => Math.round(n * 100) / 100;
export const formatBezier = (b: Bezier) => `cubic-bezier(${b.map(round2).join(", ")})`;

/** A curve as an easing: the keyword it is, if it's one's exactly, else its cubic-bezier(). */
export function easingFor(b: Bezier): string {
  const r = b.map(round2);
  const keyword = KEYWORDS.find((k) => KEYWORD_CURVES[k].every((n, i) => n === r[i]));
  return keyword ?? formatBezier(b);
}
export const bezierNumbers = (b: Bezier) => b.map(round2).join(", ");

/** The curve an easing draws, if Pilot can draw it: a keyword's, a cubic-bezier's. */
export function curveOf(value: string): Bezier | null {
  const v = value.trim();
  return isKeyword(v) ? KEYWORD_CURVES[v] : bezierOf(v);
}

/** What the select shows for an easing ("" for nothing set). */
export function easingKind(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (isKeyword(v)) return v;
  if (bezierOf(v)) return BEZIER;
  if (springOf(v)) return SPRING;
  return CUSTOM;
}

/** A cubic-bezier's value at progress `x` (its x solved for t by bisection; CSS's curves have x rising). */
export function bezierAt(b: Bezier, x: number): number {
  const [x1, y1, x2, y2] = b;
  const at = (t: number, p1: number, p2: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
}

/** The spring an easing is, if it's one (its bounce, and how much longer than it feels it lasts). */
export const springIn = (value: string): Spring | null => (value.trim() ? springOf(value.trim()) : null);

/**
 * A spring's duration is how long it feels (the owner's, 2026-11-27): it lasts
 * longer (spring.ts), and the transition's duration is that, so the fields
 * show it divided back (TransitionEditor's `felt`, `lasting`). Times Pilot
 * can't scale (a variable) stay as they are.
 */
export function scaleTime(time: string, by: number): string | null {
  const m = /^(-?\d*\.?\d+)(ms|s)$/i.exec(time.trim());
  if (!m) return null;
  const n = Number(m[1]) * by;
  return (m[2] as string).toLowerCase() === "ms" ? `${Math.round(n)}ms` : `${Math.round(n * 1000) / 1000}s`;
}
