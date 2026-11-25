import { withVars } from "./values.ts";
/**
 * Colors, as the color editor shows and writes them: a color and an opacity
 * (0–100), edited in two fields, written back as one CSS value.
 * - A hex color with alpha (`#00000080`) or an rgb()/rgba() value splits into
 *   its hex (`#000000`) and opacity (50).
 * - Any other color (`var(--brand)`, `oklch(…)`, `red`, `currentcolor`) keeps
 *   its text, at 100: Pilot never rewrites how a color is named.
 * - An oklch() color with its alpha (`oklch(0.7 0.1 280 / 50%)`, the color
 *   picker's) splits into the color and that opacity, and is written back so.
 * - Writing back: a hex at 100 is just the hex; below 100, 8-digit hex. A
 *   named color below 100 is `color-mix(in srgb, <color> 50%, transparent)`,
 *   which agents read as "this color at 50%" (Tailwind's `text-primary/50`).
 */

export interface ColorParts {
  /** The color: `#rrggbb` (lowercase) for hex and rgb colors, else as written. "" for none. */
  color: string;
  /** 0–100. 100 for a color without an alpha; null for none. */
  opacity: number | null;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A value as the editor's two fields show it. */
export function splitColor(value: string): ColorParts {
  const v = value.trim();
  if (!v) return { color: "", opacity: null };
  const hex = expandHex(v);
  if (hex) return { color: hex.slice(0, 7), opacity: hex.length === 9 ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) : 100 };
  const rgb = parseRgb(v);
  if (rgb) return { color: toHex(rgb), opacity: Math.round(rgb.a * 100) };
  const oklch = v.match(/^oklch\(\s*([^/)]+?)\s*(?:\/\s*(\d+(?:\.\d+)?)(%?)\s*)?\)$/i);
  if (oklch) {
    const alpha = oklch[2] === undefined ? 100 : oklch[3] ? Number(oklch[2]) : Number(oklch[2]) * 100;
    return { color: `oklch(${oklch[1]})`, opacity: Math.round(alpha) };
  }
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/i);
  if (mix) return { color: mix[1] as string, opacity: Math.round(Number(mix[2])) };
  return { color: v, opacity: 100 };
}

/** The two fields, as one CSS value (see the module comment). "" when there's no color. */
export function joinColor(color: string, opacity: number | null): string {
  if (!color) return "";
  const o = opacity === null ? 100 : Math.min(100, Math.max(0, Math.round(opacity)));
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return o >= 100 ? color : `${color}${Math.round((o / 100) * 255).toString(16).padStart(2, "0")}`;
  }
  const oklch = color.match(/^oklch\(\s*([^/)]+?)\s*\)$/i);
  if (oklch) return o >= 100 ? color : `oklch(${oklch[1]} / ${o}%)`;
  return o >= 100 ? color : `color-mix(in srgb, ${color} ${o}%, transparent)`;
}

/**
 * What's typed in the color field, as a color: hex with or without `#`, in
 * 3, 4, 6 or 8 digits (`000`, `#000000`, `00000080`); or any other CSS color
 * the browser accepts, as typed. Null for anything else. A hex with alpha
 * keeps its alpha (splitColor takes it apart).
 */
export function parseColor(text: string): string | null {
  const t = withVars(text.trim()); // a token typed by its name, as the field shows it
  if (!t) return null;
  const hex = expandHex(t);
  if (hex) return hex;
  if (/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|var|light-dark)\(.+\)$/i.test(t) || /^[a-z]+$/i.test(t)) {
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") return CSS.supports("color", t) ? t : null;
    return t;
  }
  return null;
}

/** An opacity typed as `50` or `50%`: 0–100. Null for anything else. */
export function parseOpacity(text: string): number | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)%?$/);
  if (!m) return null;
  return Math.min(100, Math.max(0, Math.round(Number(m[1]))));
}

/** `#abc` → `#aabbcc`, `00000080` → `#00000080`; lowercase. Null for not a hex. */
function expandHex(text: string): string | null {
  const m = text.match(HEX);
  if (!m) return null;
  let h = (m[1] as string).toLowerCase();
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return `#${h}`;
}

/** rgb()/rgba(), comma or space syntax, numbers or percentages. */
function parseRgb(text: string): { r: number; g: number; b: number; a: number } | null {
  const m = text.match(/^rgba?\(\s*([^)]+)\)$/i);
  if (!m) return null;
  const parts = (m[1] as string).split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channel = (p: string) => (p.endsWith("%") ? (Number.parseFloat(p) / 100) * 255 : Number.parseFloat(p));
  const [r, g, b] = parts.slice(0, 3).map(channel) as [number, number, number];
  const alpha = parts[3];
  const a = alpha === undefined ? 1 : alpha.endsWith("%") ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
  if ([r, g, b, a].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b, a: Math.min(1, Math.max(0, a)) };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
