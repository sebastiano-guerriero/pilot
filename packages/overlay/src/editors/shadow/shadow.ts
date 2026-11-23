import { splitTopLevel } from "../../dom/declared.ts";

/**
 * A shadow's text in parts, for the editors that split it into rows
 * (filter's drop-shadow, box-shadow): its lengths in order (x, y, blur,
 * then spread for a box-shadow), its color, and box-shadow's `inset`.
 */
export interface ShadowParts {
  lengths: string[];
  color: string;
  inset: boolean;
}

/** A length, or math that makes one: `4px`, `0`, `-2px`, `calc(…)`. */
const LENGTH = /^(-?\d*\.?\d+([a-z]+|%)?|(calc|min|max|clamp)\(.*\))$/i;
const VAR = /^var\(.*\)$/i;

/**
 * One shadow's text as its parts: two to `maxLengths` lengths, a color
 * before or after them, and `inset` at either end. A var() is a length,
 * unless it comes last after two or more others (then it's the color:
 * `0 4px 4px var(--shadow)`). Null when it doesn't split that way (a var()
 * for the whole shadow, two colors): it's then edited as text.
 */
export function splitShadow(text: string, maxLengths: number): ShadowParts | null {
  const parts = splitTopLevel(text.trim(), " ").filter(Boolean);
  const lengths: string[] = [];
  let color = "";
  let inset = false;
  let colorAfterLengths = false;
  for (const [i, part] of parts.entries()) {
    if (part.toLowerCase() === "inset") {
      if (inset || (i !== 0 && i !== parts.length - 1)) return null;
      inset = true;
      continue;
    }
    const last = i === parts.length - 1 || (i === parts.length - 2 && parts.at(-1)?.toLowerCase() === "inset");
    const isColor = !LENGTH.test(part) && (!VAR.test(part) || (last && !color && lengths.length >= 2));
    if (!isColor) {
      // The lengths come together: none after a color that came after some.
      if (colorAfterLengths) return null;
      lengths.push(part);
    } else if (!color) {
      color = part;
      colorAfterLengths = lengths.length > 0;
    } else return null;
  }
  if (lengths.length < 2 || lengths.length > maxLengths) return null;
  return { lengths, color, inset };
}
