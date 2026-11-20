import { splitTopLevel } from "../../dom/declared.ts";

/**
 * mask-image as masks the panel edits, and back (MaskImageEditor). The
 * shapes are Tailwind's mask utilities, written as plain CSS: a fade from
 * opaque (`black`, at `from`) to clear (`transparent`, at `to`), linear or
 * radial. What isn't one of them is a custom mask: its CSS as text.
 */

/** A linear mask's direction: a side or corner, both edges of an axis (Tailwind's mask-x, mask-y), or an angle. */
export const DIRECTIONS = [
  "to top",
  "to top right",
  "to right",
  "to bottom right",
  "to bottom",
  "to bottom left",
  "to left",
  "to top left",
  "left and right",
  "top and bottom",
  "angle",
] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** A radial mask's center, as `at …` writes it (Tailwind's mask-radial-at-*). */
export const POSITIONS = ["center", "top left", "top", "top right", "right", "bottom right", "bottom", "bottom left", "left"] as const;
export type Position = (typeof POSITIONS)[number];

/** The panel's first select: what kind of mask. `none` declares no mask at all (mask-image: none). */
export const MASK_TYPES = ["linear", "radial", "custom", "none"] as const;
export type MaskType = (typeof MASK_TYPES)[number];

export type Mask =
  | { type: "linear"; direction: Direction; angle: string; from: string; to: string }
  | { type: "radial"; at: Position; from: string; to: string }
  | { type: "custom"; text: string };

/** What + adds: Tailwind's mask-b-from-50%. */
export const NEW_MASK: Mask = { type: "linear", direction: "to bottom", angle: "", from: "50%", to: "" };

/** A value as masks: null when nothing is set, `none` when it says so. */
export function parseMask(value: string): Mask[] | "none" | null {
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase() === "none") return "none";
  const layers = splitTopLevel(v, ",").map((l) => l.trim());
  const masks: Mask[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = parseLayer(layers[i] as string);
    const next = i + 1 < layers.length ? parseLayer(layers[i + 1] as string) : null;
    // Two fades from opposite edges, the same stops: both edges of an axis.
    const pair = layer && next && axisOf(layer, next);
    if (pair && layer?.type === "linear") {
      masks.push({ ...layer, direction: pair });
      i++;
    } else masks.push(layer ?? { type: "custom", text: layers[i] as string });
  }
  return masks;
}

const OPPOSITE: Record<string, [string, Direction]> = {
  "to right": ["to left", "left and right"],
  "to left": ["to right", "left and right"],
  "to bottom": ["to top", "top and bottom"],
  "to top": ["to bottom", "top and bottom"],
};

function axisOf(a: Mask, b: Mask): Direction | null {
  if (a.type !== "linear" || b.type !== "linear" || a.from !== b.from || a.to !== b.to) return null;
  const pair = OPPOSITE[a.direction];
  return pair && pair[0] === b.direction ? pair[1] : null;
}

const OPAQUE = /^(black|white|#000(000)?(ff)?|#fff(fff)?(ff)?)$/i;
const CLEAR = /^transparent$/i;

/** One gradient layer, when it's a fade Pilot writes; null otherwise. */
function parseLayer(layer: string): Mask | null {
  const m = /^(linear|radial)-gradient\((.*)\)$/is.exec(layer);
  if (!m) return null;
  const args = splitTopLevel(m[2] as string, ",").map((a) => a.trim().replace(/\s+/g, " "));
  const stops = args.slice(-2);
  const lead = args.slice(0, -2);
  if (stops.length !== 2 || lead.length > 1) return null;
  const [opaque, clear] = stops.map((s) => splitTopLevel(s, " ")) as [string[], string[]];
  if (!OPAQUE.test(opaque[0] ?? "") || !CLEAR.test(clear[0] ?? "") || opaque.length > 2 || clear.length > 2) return null;
  const from = opaque[1] ?? "";
  const to = clear[1] ?? "";
  const first = lead[0]?.toLowerCase();
  if (m[1]?.toLowerCase() === "linear") {
    if (!first) return { type: "linear", direction: "to bottom", angle: "", from, to };
    const side = normalizeSide(first);
    if (side) return { type: "linear", direction: side, angle: "", from, to };
    // An angle (45deg, 0.25turn, var(--a)): anything else that isn't a stop.
    return { type: "linear", direction: "angle", angle: lead[0] as string, from, to };
  }
  if (!first) return { type: "radial", at: "center", from, to };
  const at = /^at (.+)$/.exec(first);
  const position = at ? normalizePosition(at[1] as string) : null;
  return position ? { type: "radial", at: position, from, to } : null;
}

/** `to right top` as the list names it (`to top right`); null for anything else. */
function normalizeSide(text: string): Direction | null {
  const words = text.split(" ");
  if (words[0] !== "to" || words.length < 2 || words.length > 3) return null;
  const sides = words.slice(1);
  const vertical = sides.find((s) => s === "top" || s === "bottom");
  const horizontal = sides.find((s) => s === "left" || s === "right");
  if ((vertical ? 1 : 0) + (horizontal ? 1 : 0) !== sides.length) return null;
  const name = ["to", vertical, horizontal].filter(Boolean).join(" ");
  return (DIRECTIONS as readonly string[]).includes(name) ? (name as Direction) : null;
}

/** `left top`, `center center`, `50% 50%`… as the list names it; null for one it doesn't have. */
function normalizePosition(text: string): Position | null {
  const words = text.split(" ").filter((w) => w !== "center");
  if (!words.length || text === "50% 50%") return "center";
  const vertical = words.find((w) => w === "top" || w === "bottom");
  const horizontal = words.find((w) => w === "left" || w === "right");
  if ((vertical ? 1 : 0) + (horizontal ? 1 : 0) !== words.length) return null;
  return [vertical, horizontal].filter(Boolean).join(" ") as Position;
}

/** The fade's stops: opaque at `from`, clear at `to` (none: the gradient's own ends). */
function stops(from: string, to: string): string {
  return `black${from ? ` ${from}` : ""}, transparent${to ? ` ${to}` : ""}`;
}

/** A mask's CSS: one layer, or two for both edges of an axis (as Tailwind's mask-x). */
export function maskLayers(mask: Mask): string[] {
  if (mask.type === "custom") return mask.text.trim() ? [mask.text.trim()] : [];
  if (mask.type === "radial") {
    return [`radial-gradient(${mask.at === "center" ? "" : `at ${mask.at}, `}${stops(mask.from, mask.to)})`];
  }
  const fade = (direction: string) => `linear-gradient(${direction}, ${stops(mask.from, mask.to)})`;
  if (mask.direction === "left and right") return [fade("to right"), fade("to left")];
  if (mask.direction === "top and bottom") return [fade("to bottom"), fade("to top")];
  if (mask.direction === "angle") return [fade(mask.angle.trim() || "180deg")];
  return [fade(mask.direction)];
}

/** The masks as mask-image's value ("" for none left). */
export function formatMask(masks: Mask[] | "none"): string {
  if (masks === "none") return "none";
  return masks.flatMap(maskLayers).join(", ");
}

/**
 * The changes for a mask-image `value`, with what the element declares now:
 * the value, then `mask-composite: intersect` when it has a linear or radial
 * mask (stacked fades keep only what every one keeps, as Tailwind's mask
 * utilities write), unless it's set already. Cleared (or `none`), an
 * `intersect` is cleared with it; custom masks leave it as it is.
 */
export function maskChanges(value: string, declared: (property: string) => string): Array<[string, string]> {
  const changes: Array<[string, string]> = [["mask-image", value]];
  const masks = parseMask(value);
  const composite = declared("mask-composite");
  if (Array.isArray(masks) && masks.some((m) => m.type !== "custom")) {
    if (composite !== "intersect") changes.push(["mask-composite", "intersect"]);
  } else if (!Array.isArray(masks) && composite === "intersect") {
    changes.push(["mask-composite", ""]);
  }
  return changes;
}

/** A from/to field's text as a stop: a bare number is a percentage (`50` → `50%`). */
export function stopText(text: string): string {
  const t = text.trim();
  return /^-?\d*\.?\d+$/.test(t) ? `${t}%` : t;
}

/** An angle field's text: a bare number is in degrees (`45` → `45deg`); null when it isn't an angle. */
export function angleText(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const angle = /^-?\d*\.?\d+$/.test(t) ? `${t}deg` : t;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") return CSS.supports("rotate", angle) ? angle : null;
  return /^-?\d*\.?\d+(deg|turn|rad|grad)$|^(var|calc)\(/.test(angle) ? angle : null;
}
