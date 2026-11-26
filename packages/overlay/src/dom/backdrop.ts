/**
 * The page's color behind a point of Pilot's overlay, to pick text that reads
 * on it: Pilot's layer is isolated (fixed, its own stacking context), so CSS
 * can't blend with the page, and a filter can't draw text in the overlay's
 * font. Read from the elements under the point (`elementsFromPoint`), Pilot's
 * own left out: their background colors, composited from the first opaque
 * one up (the canvas white below them all). Null where there's no single
 * color: an image, a gradient, a video or canvas, an `<img>` or `<svg>`.
 */

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/** The page's color under (x, y), viewport px, leaving out `overlay` (Pilot's host); null when it can't tell. */
export function colorBehind(x: number, y: number, overlay: Element | null): RGB | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  const layers: RGBA[] = [];
  for (const el of document.elementsFromPoint(x, y)) {
    if (overlay && (el === overlay || overlay.contains(el))) continue;
    if (/^(img|video|canvas|svg|iframe|picture|object|embed)$/i.test(el.tagName)) return null;
    const style = getComputedStyle(el);
    if (style.backgroundImage && style.backgroundImage !== "none") return null;
    const color = parseColor(style.backgroundColor);
    if (!color || color[3] === 0) continue;
    layers.push(color);
    if (color[3] >= 1) break;
  }
  // From the bottom (the first opaque one, else the canvas white) up.
  return over([255, 255, 255], layers);
}

/** `rgb(…)` / `rgba(…)` / `color(srgb …)` as 0–255 channels and alpha; null for anything else. */
export function parseColor(text: string): RGBA | null {
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha(rgb[4])];
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text.trim());
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, alpha(srgb[4])];
  return null;
}

function alpha(text: string | undefined): number {
  if (text === undefined) return 1;
  return text.endsWith("%") ? Number(text.slice(0, -1)) / 100 : Number(text);
}

/**
 * Over `page`, translucent layers (top first, each a color and its alpha):
 * the color they make together.
 */
export function over(page: RGB, layers: readonly RGBA[]): RGB {
  let out = page;
  for (const [r, g, b, a] of [...layers].reverse()) out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
  return out;
}

/** Whether dark text reads better than white on `color` (by contrast ratio). */
export function darkTextOn(color: RGB, dark: RGB = [23, 23, 23]): boolean {
  const l = luminance(color);
  return (l + 0.05) / (luminance(dark) + 0.05) > 1.05 / (l + 0.05);
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
