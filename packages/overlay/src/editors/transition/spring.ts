/**
 * Springs as CSS easing (the owner's, 2026-11-27): a spring set by its bounce,
 * the duration being how long it feels (its perceived duration), as SwiftUI's
 * `spring(duration:bounce:)` and kvin.me's CSS springs: a mass of 1 with
 * stiffness (2π / duration)² and damping 4π (1 − bounce) / duration. It goes
 * on past that duration before it settles, so Pilot writes the easing as
 * `linear(…)`, the spring sampled until it settles, and the transition's
 * duration as the time it really lasts: the perceived one × `settleFactor()`,
 * which depends only on the bounce. Read back the same way: a `linear(…)` that
 * draws one of these springs is that spring, and its duration shows divided
 * back.
 */

/** A new spring's bounce, %: kvin.me's. */
export const DEFAULT_BOUNCE = 30;
/** The most bounce (the owner's, 2026-11-27): more settles ever later (80% lasts 5.5× its duration). */
export const MAX_BOUNCE = 80;

/**
 * The highest a spring of `bounce` goes, at its first overshoot: 1 + e^(−πζ/√(1−ζ²)).
 * The graph's square fits the most bounce's, so it holds still as the bounce changes.
 */
export function springPeak(bounce: number): number {
  const zeta = 1 - bounce / 100;
  return zeta >= 1 ? 1 : 1 + Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
}
/** Settled: within this of its end, for good. */
const SETTLED = 0.001;
/** How closely a `linear(…)` follows the spring it's written from: what the points left out may differ by. */
const TOLERANCE = 0.001;
/** How close a page's `linear(…)` must be to a spring to read as one. */
const MATCH = 0.01;

/** Where the spring is (0 → 1) at time `t`, in perceived durations. */
export function springAt(t: number, bounce: number): number {
  const zeta = 1 - bounce / 100;
  const w = 2 * Math.PI;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const a = zeta * w;
  return 1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t));
}

const factors = new Map<number, number>();
/**
 * How much longer than its perceived duration a spring lasts, until it
 * settles (30% → about 1.65): until its swing can't take it more than 0.1%
 * off its end, by the envelope of its oscillation, e^(−ζωt)·√(1 + (ζω/ω_d)²).
 * That grows smoothly with the bounce. Rejected: the last moment the spring
 * itself is 0.1% off, which jumps by half a wobble as the bounce grows (26%
 * lasted 1.26×, 28% 1.61×): the graph squeezed and stretched, and the
 * duration written jumped. With no bounce, no oscillation: the curve itself.
 * Never shorter than that: at a low bounce the envelope overstates the swing
 * less than it shortens the decay (5% came out at 1.35×, under no bounce's
 * 1.47×), and the graph moved back before moving on (the owner saw it, 0–5%).
 * So a spring lasts as long as one with no bounce until the envelope passes
 * it (about 20%), and longer from there: more bounce, never less time.
 */
export function settleFactor(bounce: number): number {
  const b = Math.round(bounce);
  const known = factors.get(b);
  if (known) return known;
  const w = 2 * Math.PI;
  // No bounce: the curve itself, as it closes in on its end.
  let none = 0;
  for (let x = 0; x < 10; x += 0.0005) if (Math.exp(-w * x) * (1 + w * x) >= SETTLED) none = x;
  let t = none;
  if (b > 0) {
    const zeta = 1 - b / 100;
    const a = zeta * w;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    t = Math.max(none, Math.log(Math.sqrt(1 + (a / wd) ** 2) / SETTLED) / a);
  }
  const factor = Math.round(t * 10000) / 10000;
  factors.set(b, factor);
  return factor;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The spring as a `linear(…)` easing: sampled until it settles, with only the points it needs. */
export function springEasing(bounce: number): string {
  const b = Math.round(Math.min(MAX_BOUNCE, Math.max(0, bounce)));
  const total = settleFactor(b);
  const samples = 400;
  const points: Array<[number, number]> = Array.from({ length: samples + 1 }, (_, k) => [k / samples, springAt((k / samples) * total, b)]);
  points[samples] = [1, 1];
  const kept = simplify(points, TOLERANCE);
  return `linear(${kept
    .map(([x, y], i) => (i === 0 || i === kept.length - 1 ? `${round4(y)}` : `${round4(y)} ${Math.round(x * 10000) / 100}%`))
    .join(", ")})`;
}

/** The points a line through them needs, within `tolerance` (Ramer–Douglas–Peucker). */
function simplify(points: Array<[number, number]>, tolerance: number): Array<[number, number]> {
  if (points.length < 3) return points;
  const [x0, y0] = points[0] as [number, number];
  const [x1, y1] = points[points.length - 1] as [number, number];
  let far = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i] as [number, number];
    // Vertical distance from the chord: how far the easing's value would be off.
    const d = Math.abs(y - (y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)));
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= tolerance) return [points[0] as [number, number], points[points.length - 1] as [number, number]];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

/** A `linear(…)` easing's points, as (progress, value) pairs, positions filled in as CSS does; null when it isn't one. */
export function linearPoints(text: string): Array<[number, number]> | null {
  const m = /^linear\((.*)\)$/is.exec(text.trim());
  if (!m) return null;
  const stops: Array<{ y: number; x: number | null }> = [];
  for (const part of (m[1] as string).split(",")) {
    const tokens = part.trim().split(/\s+/);
    const y = Number(tokens[0]);
    if (!tokens[0] || !Number.isFinite(y)) return null;
    const positions = tokens.slice(1).map((p) => (/^-?\d*\.?\d+%$/.test(p) ? Number(p.slice(0, -1)) / 100 : Number.NaN));
    if (positions.some(Number.isNaN) || positions.length > 2) return null;
    if (!positions.length) stops.push({ y, x: null });
    for (const x of positions) stops.push({ y, x });
  }
  if (stops.length < 2) return null;
  // CSS's rules: the first at 0 and the last at 1 unless placed; none before an earlier one; the rest evenly between.
  if ((stops[0] as { x: number | null }).x === null) (stops[0] as { x: number | null }).x = 0;
  const last = stops[stops.length - 1] as { x: number | null };
  if (last.x === null) last.x = Math.max(1, ...stops.map((s) => s.x ?? 0));
  let max = 0;
  for (const s of stops) if (s.x !== null) s.x = max = Math.max(max, s.x);
  for (let i = 1; i < stops.length; i++) {
    if ((stops[i] as { x: number | null }).x !== null) continue;
    let j = i;
    while ((stops[j] as { x: number | null }).x === null) j++;
    const from = (stops[i - 1] as { x: number }).x;
    const to = (stops[j] as { x: number }).x;
    for (let k = i; k < j; k++) (stops[k] as { x: number | null }).x = from + ((to - from) * (k - i + 1)) / (j - i + 1);
  }
  return stops.map((s) => [s.x as number, s.y]);
}

/** A `linear(…)`'s value at progress `x`. */
function valueAt(points: Array<[number, number]>, x: number): number {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    if (x <= x1) {
      const [x0, y0] = points[i - 1] as [number, number];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return (points[points.length - 1] as [number, number])[1];
}

/** A spring read from a `linear(…)`: its bounce, and how much longer than its perceived duration it lasts. */
export interface Spring {
  bounce: number;
  factor: number;
}

const read = new Map<string, Spring | null>();
/**
 * The spring a `linear(…)` draws, or null when it isn't one. Any generator's
 * (within a little): they sample the same spring but settle it a bit apart
 * (kvin.me rounds up to a frame), so the time it lasts is found too, around
 * Pilot's own.
 */
export function springOf(text: string): Spring | null {
  const key = text.trim();
  if (read.has(key)) return read.get(key) as Spring | null;
  const points = linearPoints(key);
  let found: Spring | null = null;
  if (points && points.length > 4) {
    let best = Number.POSITIVE_INFINITY;
    for (let b = 0; b <= MAX_BOUNCE; b++) {
      for (let s = 0.9; s <= 1.1001; s += 0.01) {
        const factor = settleFactor(b) * s;
        let off = 0;
        for (let k = 0; k <= 50 && off < best; k++) off = Math.max(off, Math.abs(valueAt(points, k / 50) - springAt((k / 50) * factor, b)));
        if (off < best) {
          best = off;
          found = { bounce: b, factor: Math.round(factor * 10000) / 10000 };
        }
      }
    }
    if (best > MATCH) found = null;
  }
  read.set(key, found);
  return found;
}

/** A spring's curve, for the graph: its value at progress `x` (0 → 1, until it settles). */
export function springCurve(spring: Spring): (x: number) => number {
  return (x) => springAt(x * spring.factor, spring.bounce);
}
