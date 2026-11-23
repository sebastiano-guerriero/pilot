import { splitTopLevel } from "../../dom/declared.ts";
import { splitColor } from "../../css/colors.ts";
import { splitShadow } from "../shadow/shadow.ts";
import { type LayerNumbers, MAX_LAYERS, pxOf, readSmooth, type Smooth, smoothLayers } from "./smooth.ts";

/**
 * box-shadow as a list of shadows the panel edits, and back
 * (BoxShadowEditor). Each is outer (cast outside the box) or inset (drawn
 * inside it), with x, y, blur, spread and a color. A shadow
 * that doesn't split into those parts is a custom one: its CSS as text.
 */

/** The panel's first select: outer, inset, or none (box-shadow: none). */
export const SHADOW_TYPES = ["outer", "inset", "none"] as const;
export type ShadowType = (typeof SHADOW_TYPES)[number] | "custom";

/** In the type select, after the name, dimmed: what CSS calls it. */
export const TYPE_TAKES: Partial<Record<ShadowType, string>> = { none: "no shadow", custom: "as written" };

/** The second select, for outer and inset: each part set by hand, or a smooth stack (smooth.ts). */
export const SHADOW_MODES = ["manual", "smooth"] as const;
export type ShadowMode = (typeof SHADOW_MODES)[number];

export type ManualShadow = { type: "outer" | "inset"; mode: "manual"; x: string; y: string; blur: string; spread: string; color: string };
export type SmoothShadow = { type: "outer" | "inset"; mode: "smooth"; smooth: Smooth };
export type BoxShadow = ManualShadow | SmoothShadow | { type: "custom"; text: string };

/** What + adds: one layer of Tailwind's shadow-md. */
export const NEW_SHADOW: ManualShadow = { type: "outer", mode: "manual", x: "0", y: "4px", blur: "6px", spread: "-1px", color: "#0000001a" };

/** The footer's help, per type. */
export const TYPE_HINTS: Record<ShadowType, string> = {
  outer: "Cast outside the element: x and y move it, blur softens it, spread grows or shrinks it.",
  inset: "Drawn inside the element, along its edges: x and y move it, blur softens it, spread thickens it.",
  none: "Declares box-shadow: none, taking off one the page sets (at a width, say). × on the chip declares nothing instead.",
  custom: "A shadow the page writes that doesn't split into parts, as CSS writes it.",
};

/** The footer's help for a smooth shadow. */
export const SMOOTH_HINT =
  "Distance moves it, elevation softens it. More layers look smoother but cost more to draw.";

/**
 * A value as shadows: null when nothing is set, `none` when it says so.
 * Layers that are a smooth shadow's (readSmooth) are one smooth shadow,
 * the longest run that is.
 */
export function parseBoxShadow(value: string): BoxShadow[] | "none" | null {
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase() === "none") return "none";
  const layers = splitTopLevel(v, ",")
    .map((layer) => layer.trim())
    .filter(Boolean)
    .map((layer): BoxShadow => {
      const parts = splitShadow(layer, 4);
      if (!parts) return { type: "custom", text: layer };
      const [x, y, blur = "", spread = ""] = parts.lengths as [string, string, string?, string?];
      return { type: parts.inset ? "inset" : "outer", mode: "manual", x, y, blur, spread, color: parts.color };
    });
  const shadows: BoxShadow[] = [];
  for (let i = 0; i < layers.length; ) {
    let found: { smooth: Smooth; count: number } | null = null;
    for (let count = Math.min(MAX_LAYERS, layers.length - i); count >= 1 && !found; count--) {
      const run = layers.slice(i, i + count).map(numbersOf);
      if (run.every((n): n is LayerNumbers => n !== null)) {
        const smooth = readSmooth(run);
        if (smooth) found = { smooth, count };
      }
    }
    if (found) {
      shadows.push({ type: (layers[i] as ManualShadow).type, mode: "smooth", smooth: found.smooth });
      i += found.count;
    } else shadows.push(layers[i++] as BoxShadow);
  }
  return shadows;
}

/** A manual shadow's numbers, when they're all px and it has a color; null otherwise. */
function numbersOf(shadow: BoxShadow): LayerNumbers | null {
  if (shadow.type === "custom" || shadow.mode !== "manual" || !shadow.color) return null;
  const [x, y, blur, spread] = [shadow.x, shadow.y, shadow.blur, shadow.spread].map(pxOf);
  const { color, opacity: rounded } = splitColor(shadow.color);
  // A hex's alpha exactly (splitColor rounds to whole percents): thin layers' shares add up right.
  const alpha = /^#[0-9a-f]{8}$/i.test(shadow.color.trim()) ? (parseInt(shadow.color.trim().slice(7), 16) / 255) * 100 : rounded;
  if (x == null || y == null || blur == null || spread == null || alpha == null) return null;
  return { inset: shadow.type === "inset", x, y, blur, spread, base: color, opacity: alpha };
}

/** One shadow's CSS: `inset 0 4px 6px -1px #0000001a`; a smooth one's layers, joined. A spread needs a blur before it: 0 then. */
export function shadowText(shadow: BoxShadow): string {
  if (shadow.type === "custom") return shadow.text.trim();
  if (shadow.mode === "smooth") return smoothLayers(shadow.smooth, shadow.type === "inset").join(", ");
  const spread = shadow.spread.trim();
  const blur = shadow.blur.trim() || (spread ? "0" : "");
  return [shadow.type === "inset" ? "inset" : "", shadow.x.trim() || "0", shadow.y.trim() || "0", blur, spread, shadow.color.trim()]
    .filter(Boolean)
    .join(" ");
}

/** The shadows as box-shadow's value ("" for none left). */
export function formatBoxShadow(shadows: BoxShadow[] | "none"): string {
  if (shadows === "none") return "none";
  return shadows.map(shadowText).filter(Boolean).join(", ");
}
