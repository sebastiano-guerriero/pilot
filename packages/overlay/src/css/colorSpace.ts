/**
 * Color spaces for the color picker (ui/components/ColorPicker): a color as
 * sRGB channels, and its OKLCH, hex and HSV forms. The picker's area is HSV
 * (saturation × brightness at a hue, the hue strip under it); its fields are
 * OKLCH or hex. OKLab / OKLCH are Björn Ottosson's (https://bottosson.github.io/posts/oklab/).
 */

/** sRGB, each channel 0–1 (gamma-encoded, as CSS writes them), and alpha 0–1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH: lightness 0–1, chroma 0–~0.4, hue 0–360 (degrees). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** HSV: hue 0–360, saturation and value (brightness) 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** A color and its alpha (0–1). */
export interface Color {
  rgb: Rgb;
  alpha: number;
  /** When the color was written in OKLCH: its own values, so fields show them as written (no round trip). */
  oklch?: Oklch;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const num = (text: string, percentOf = 1) => (text.endsWith("%") ? (Number.parseFloat(text) / 100) * percentOf : Number.parseFloat(text));

/**
 * A CSS color as the picker reads it: hex, rgb()/rgba(), oklch(), oklab() or
 * color(srgb …), the forms the browser computes colors to. Null for anything
 * else (a var() or a name: read the computed value instead, or `colorOf()`).
 */
export function parseCssColor(text: string): Color | null {
  const t = text.trim().toLowerCase();
  const hex = t.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1] as string;
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const byte = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { rgb: { r: byte(0), g: byte(2), b: byte(4) }, alpha: h.length === 8 ? byte(6) : 1 };
  }
  const fn = t.match(/^([a-z]+)\(\s*([^)]*)\)$/);
  if (!fn) return null;
  const [, name, body] = fn as unknown as [string, string, string];
  const [main = "", alphaText] = body.split("/").map((s) => s.trim());
  const parts = main.split(/[\s,]+/).filter(Boolean);
  const commas = body.includes(",") ? body.split(",").map((s) => s.trim()) : null;
  const alphaOf = (a: string | undefined) => (a === undefined || a === "none" ? 1 : clamp(num(a)));
  if (name === "rgb" || name === "rgba") {
    const channels = commas ?? parts;
    if (channels.length < 3) return null;
    const [r, g, b] = channels.slice(0, 3).map((c) => num(c, 255) / 255) as [number, number, number];
    const alpha = alphaOf(alphaText ?? (commas ? commas[3] : undefined));
    if ([r, g, b, alpha].some((n) => !Number.isFinite(n))) return null;
    return { rgb: { r: clamp(r), g: clamp(g), b: clamp(b) }, alpha };
  }
  if (name === "oklch" && parts.length >= 3) {
    const [l, c, h] = [num(parts[0] as string), num(parts[1] as string, 0.4), parts[2] === "none" ? 0 : Number.parseFloat(parts[2] as string)];
    if ([l, c, h].some((n) => !Number.isFinite(n))) return null;
    const oklch = { l: clamp(l), c: Math.max(0, c), h: ((h % 360) + 360) % 360 };
    return { rgb: fromOklch(oklch), alpha: alphaOf(alphaText), oklch };
  }
  if (name === "oklab" && parts.length >= 3) {
    const [l, a, b] = [num(parts[0] as string), num(parts[1] as string, 0.4), num(parts[2] as string, 0.4)];
    if ([l, a, b].some((n) => !Number.isFinite(n))) return null;
    return { rgb: gamutMap(oklabToRgb(l, a, b)), alpha: alphaOf(alphaText) };
  }
  if (name === "color" && parts[0] === "srgb" && parts.length >= 4) {
    const [r, g, b] = parts.slice(1, 4).map((c) => num(c)) as [number, number, number];
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return { rgb: { r: clamp(r), g: clamp(g), b: clamp(b) }, alpha: alphaOf(alphaText) };
  }
  return null;
}

/**
 * Any CSS color the browser knows (a name, hsl(), color-mix()…), as the
 * picker reads it: parsed when it can be (parseCssColor), else drawn on a
 * 1×1 canvas and read back (8-bit sRGB). Null when it isn't a color.
 */
export function colorOf(text: string): Color | null {
  const parsed = parseCssColor(text);
  if (parsed) return parsed;
  if (typeof document === "undefined") return null;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#010203"; // a sentinel: an invalid color leaves it
  ctx.fillStyle = text;
  if (ctx.fillStyle === "#010203" && text.trim().toLowerCase() !== "#010203") return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  if (!a) return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  return { rgb: { r: r / 255, g: g / 255, b: b / 255 }, alpha: a / 255 };
}

/** `#rrggbb`, lowercase. */
export function hexOf({ r, g, b }: Rgb): string {
  const byte = (n: number) => Math.round(clamp(n) * 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

// OKLab, from linear sRGB (Ottosson's matrices).
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab({ r, g, b }: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to sRGB, not clamped: a channel outside 0–1 is out of gamut. (Exported for the picker's area, drawn pixel by pixel.) */
export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const inGamut = ({ r, g, b }: Rgb) => [r, g, b].every((c) => c >= -1e-4 && c <= 1 + 1e-4);
const clampRgb = ({ r, g, b }: Rgb): Rgb => ({ r: clamp(r), g: clamp(g), b: clamp(b) });

/** An out-of-gamut color, clamped channel by channel (for oklab, where there's no chroma to lower). */
function gamutMap(rgb: Rgb): Rgb {
  return clampRgb(rgb);
}

/** A color's OKLCH. A gray's hue is 0 (it has none). */
export function toOklch(rgb: Rgb): Oklch {
  const [l, a, b] = rgbToOklab(rgb);
  const c = Math.hypot(a, b);
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: clamp(l), c, h };
}

/**
 * An OKLCH color in sRGB. Outside sRGB (too much chroma for its lightness and
 * hue), the chroma is lowered until it fits, keeping lightness and hue: what
 * the swatch and a hex can show of it.
 */
export function fromOklch({ l, c, h }: Oklch): Rgb {
  const at = (chroma: number) => {
    const rad = (h * Math.PI) / 180;
    return oklabToRgb(l, chroma * Math.cos(rad), chroma * Math.sin(rad));
  };
  const full = at(c);
  if (inGamut(full)) return clampRgb(full);
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid;
    else hi = mid;
  }
  return clampRgb(at(lo));
}

/** An OKLCH color in sRGB, or null when sRGB can't show it (the picker's area leaves those empty). */
export function oklchInSrgb({ l, c, h }: Oklch): Rgb | null {
  const rad = (h * Math.PI) / 180;
  const rgb = oklabToRgb(l, c * Math.cos(rad), c * Math.sin(rad));
  return inGamut(rgb) ? clampRgb(rgb) : null;
}

/**
 * The most chroma sRGB can show at a lightness and hue: the right edge of the
 * picker's OKLCH area, whose chroma runs from 0 to it on each row (DialKit's
 * way: a full rectangle, every spot a color the screen shows). 0 at black and white.
 */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (oklchInSrgb({ l, c: mid, h })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A color's HSV. A gray's hue (and a black's saturation) is 0: keep the one before (the picker does). */
export function toHsv({ r, g, b }: Rgb): Hsv {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function fromHsv({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

/**
 * `oklch(0.7 0.12 280)`: lightness and chroma to 3 decimals, hue to 1,
 * trailing zeros dropped. A gray keeps its hue (`oklch(0.5 0 280)`): it draws
 * the same, and the picker's hue doesn't jump back to 0 on the way through it.
 */
export function formatOklch({ l, c, h }: Oklch): string {
  const n = (x: number, digits: number) => String(Number(x.toFixed(digits)));
  return `oklch(${n(l, 3)} ${n(c, 3)} ${n(h, 1)})`;
}

/** Whether two colors look the same at 8 bits a channel. */
export function sameRgb(a: Rgb, b: Rgb): boolean {
  return hexOf(a) === hexOf(b);
}
