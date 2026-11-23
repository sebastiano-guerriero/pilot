import { splitColor } from "../../css/colors.ts";

/**
 * A smooth shadow: several shadows stacked, each further out and softer than
 * the one before, the way Josh Comeau and smoothshadows.com layer them, set
 * by five controls (the owner's call, after trying Framer's "realistic"
 * shadows): how far it falls, which way, how high the element floats, how
 * many layers, and its color.
 * - distance: how far the outermost layer falls from the element (its offset).
 * - direction: the way it falls, an angle (0deg up, 180deg down, clockwise).
 * - elevation: how high the element floats above the surface: how soft and
 *   wide the outermost layer is (its blur). With distance 0, a soft shadow
 *   all around.
 * - layers: how many shadows (more is smoother, and costs more to draw).
 * - color: its color; its opacity is how dark the stack is in all.
 * Each layer i of n sits at distance × (i/n)² (smoothshadows.com's ease-in:
 * close layers bunch up, the far ones spread out), blurs elevation × (i/n)²,
 * and is pulled in by a negative spread of SPREAD_RATIO × its blur, so it stays
 * under the element instead of a halo around it. The color's opacity is
 * shared out growing with i (the far, soft layers carry more), adding up to
 * the color's opacity.
 */
export interface Smooth {
  distance: number;
  /** Degrees. */
  direction: number;
  elevation: number;
  layers: number;
  /** The color with its opacity, as the color editor writes it (`#00000040`). */
  color: string;
}

/** How much each layer is pulled in, as a share of its blur (Tailwind's shadows: about 0.2 for the far layer, 0.5–0.7 for the close one). Tuned by eye. */
export const SPREAD_RATIO = 0.3;
/** Most layers: more add little and cost a draw each. */
export const MAX_LAYERS = 10;
/**
 * A smooth shadow is a stack: at least two layers. One layer is any plain
 * shadow, read back as manual: smooth → manual writes exactly such a layer
 * (the outermost, its spread pulled in like a smooth one's), and it must stay
 * manual, not turn smooth again.
 */
export const MIN_LAYERS = 2;

/** What switching to smooth starts from, when there's nothing to keep. */
export const NEW_SMOOTH: Smooth = { distance: 10, direction: 180, elevation: 10, layers: 4, color: "#00000040" };

const round2 = (n: number) => Math.round(n * 100) / 100;
/** A length in px, as short as it goes: `0`, `4px`, `0.4px`, `-1.2px`. */
const px = (n: number) => {
  const r = round2(n);
  return r === 0 ? "0" : `${r}px`;
};

/** The color at `opacity` (0–100, fractions kept for a hex: thin layers need them). */
function layerColor(color: string, opacity: number): string {
  const { color: base } = splitColor(color);
  if (/^#[0-9a-f]{6}$/i.test(base)) {
    return `${base}${Math.round((Math.min(100, Math.max(0, opacity)) / 100) * 255).toString(16).padStart(2, "0")}`;
  }
  return `color-mix(in srgb, ${base} ${round2(opacity)}%, transparent)`;
}

/** The smooth shadow's layers, as box-shadow layers' CSS (`inset` first when `inset`). */
export function smoothLayers(smooth: Smooth, inset: boolean): string[] {
  const n = Math.min(MAX_LAYERS, Math.max(1, Math.round(smooth.layers)));
  const a = (smooth.direction * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const total = splitColor(smooth.color).opacity ?? 100;
  const layers: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = (i / n) ** 2;
    const d = smooth.distance * t;
    const blur = smooth.elevation * t;
    const opacity = (total * 2 * i) / (n * (n + 1));
    layers.push(
      [inset ? "inset" : "", px(d * dx), px(d * dy), px(blur), px(-SPREAD_RATIO * blur), layerColor(smooth.color, opacity)]
        .filter(Boolean)
        .join(" "),
    );
  }
  return layers;
}

/** A layer's numbers, for reading a stack back. */
export interface LayerNumbers {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  /** The color without its opacity. */
  base: string;
  /** 0–100. */
  opacity: number;
}

/** A length's px (`0`, `4px`, `-1.5px`); null for any other unit. */
export function pxOf(text: string): number | null {
  const t = text.trim();
  if (t === "" || t === "0") return 0;
  const m = /^(-?\d*\.?\d+)px$/.exec(t);
  return m ? Number(m[1]) : null;
}

/**
 * Whether `layers` (in order) are a smooth shadow's, and which: the
 * outermost gives the distance and direction (its offset) and the
 * elevation (its blur),
 * the opacities add up to the color's; then the stack is drawn again from
 * that and compared, within rounding. At distance 0 (no offset in any layer)
 * the direction can't be read: 180deg, unless the editor remembers it. One
 * layer isn't (MIN_LAYERS: it's any plain shadow). Null when they aren't.
 */
export function readSmooth(layers: LayerNumbers[]): Smooth | null {
  const n = layers.length;
  const last = layers[n - 1];
  if (!last || n < MIN_LAYERS || n > MAX_LAYERS || last.blur < 0) return null;
  const first = layers[0] as LayerNumbers;
  if (layers.some((l) => l.inset !== first.inset || l.base.toLowerCase() !== first.base.toLowerCase())) return null;
  const distance = round2(Math.hypot(last.x, last.y));
  const elevation = last.blur;
  const direction = distance === 0 ? 180 : Math.round((((Math.atan2(last.x, -last.y) * 180) / Math.PI + 360) % 360) * 10) / 10;
  const opacity = Math.round(layers.reduce((sum, l) => sum + l.opacity, 0));
  const color = layerColor(first.base, opacity);
  const smooth: Smooth = { distance, direction, elevation, layers: n, color: opacity >= 100 ? first.base : color };
  const again = smoothLayers(smooth, first.inset);
  const close = (a: number, b: number, within: number) => Math.abs(a - b) <= within;
  const matches = again.every((text, i) => {
    const l = layers[i] as LayerNumbers;
    const parts = text.replace(/^inset /, "").split(" ");
    const [x, y, blur, spread] = parts.slice(0, 4).map((p) => pxOf(p) ?? Number.NaN) as [number, number, number, number];
    const o = (opacity * 2 * (i + 1)) / (n * (n + 1));
    return close(x, l.x, 0.02) && close(y, l.y, 0.02) && close(blur, l.blur, 0.02) && close(spread, l.spread, 0.02) && close(o, l.opacity, 1.5);
  });
  return matches ? smooth : null;
}
