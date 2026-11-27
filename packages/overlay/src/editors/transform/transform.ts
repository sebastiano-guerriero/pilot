import { closeParens } from "../../css/values.ts";
import { splitTopLevel } from "../../dom/declared.ts";

/**
 * The `transform` property as the designer reads and types it: its functions
 * as text, applied after translate, rotate and scale (properties of their
 * own: editors/transforms, editors/rotate). The rotations rotate's split
 * view adds (`rotateX(var(--pilot-rotate-x, 0deg))`) are Pilot's: not shown,
 * kept at the end when the text is written back.
 */

/** Whether a function is one of the rotations rotate's split view adds (Pilot's own). */
const isPilots = (fn: string) => fn.includes("--pilot-rotate-");

/** A transform value → what's shown (the page's functions, or `none`), and Pilot's rotate axes apart. */
export function splitTransform(value: string): { shown: string; pilot: string[] } {
  const v = value.trim();
  if (!v || v === "none") return { shown: v, pilot: [] };
  const parts = splitTopLevel(v, " ").map((p) => p.trim()).filter(Boolean);
  return { shown: parts.filter((p) => !isPilots(p)).join(" "), pilot: parts.filter(isPilots) };
}

/** The text back as a value, Pilot's rotate axes after it ("" and none: just them, or nothing). */
export function joinTransform(shown: string, pilot: string[]): string {
  if (shown === "none") return "none";
  return [shown, ...pilot].filter(Boolean).join(" ");
}

/** What's typed → a transform's functions, as typed (case kept: `translateX`), or null: checked by the browser. */
export function parseTransformText(text: string): string | null {
  const t = closeParens(text.trim().replace(/\s+/g, " "));
  if (!t) return null;
  if (t.toLowerCase() === "none") return "none";
  const supported = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("transform", t);
  return supported ? t : null;
}

/**
 * The skews of a transform that holds nothing else (`skewX(10deg) skewY(5deg)`, `skew(10deg, 5deg)`), as X and
 * Y; null when it holds another function (then it's custom), and for none or nothing.
 */
export function skewOf(shown: string): { x: string; y: string } | null {
  const v = shown.trim();
  if (!v || v === "none") return null;
  const skew = { x: "", y: "" };
  for (const part of splitTopLevel(v, " ").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(skewX|skewY|skew)\((.*)\)$/.exec(part);
    if (!m) return null;
    const args = splitTopLevel(m[2] as string, ",").map((a) => a.trim());
    if (m[1] === "skewX" && args.length === 1) skew.x = args[0] as string;
    else if (m[1] === "skewY" && args.length === 1) skew.y = args[0] as string;
    else if (m[1] === "skew" && args.length <= 2) {
      skew.x = args[0] as string;
      if (args[1]) skew.y = args[1];
    } else return null;
  }
  return skew;
}
